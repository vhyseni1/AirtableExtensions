import {
    initializeBlock,
    useBase,
    useRecords,
    useSession,
    expandRecord,
    colorUtils,
} from '@airtable/blocks/interface/ui';
import {createContext, useContext, useState, useRef, useEffect, useMemo, useCallback} from 'react';
import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import './style.css';

// ─── Data source configuration ───────────────────────────────────────────────
//
// All field-name dependencies live here. Use the in-app "Fields" button to see
// how each one resolved and a sample value from the data.
//
//   tableName         : table to read from (null ⇒ first table in the base).
//   primaryNameSource : 'name' ⇒ record's primary field as the card title, or a
//                       field-name string to use a specific field.
//   jobTitleField     : job title shown on the card (null to hide).
//   departmentField   : department / org shown on the card (null to hide).
//   statusField       : optional colored accent + legend (null to disable).
//   parentLinkField   : field pointing to a person's manager. May be a
//                       linked-record field OR a lookup.
//   employeeIdField   : OPTIONAL. Each person's unique id (e.g. position/worker
//                       id). Combined with managerIdField, the hierarchy is built
//                       by id — robust when two managers share the same name.
//   managerIdField    : OPTIONAL. The manager's unique id for this person.
//
// ─── Per-leader scoping (share one interface with all leaders) ────────────────
//
// When a scoping field is configured, each signed-in leader sees ONLY their own
// branch (their node + everyone below), rooted at themselves, and can deep-dive
// any sub-branch. The signed-in user is identified by email (useSession). NOTE:
// this is DISPLAY-only scoping — the extension still loads the full table. For
// enforced row-level security, pair it with a native Airtable interface element
// filtered by `Visible to leaders = current user` (see scripts/ and RLS.md).
//
//   leaderEmailField  : OPTIONAL. Each leader's email. Matched against the
//                       signed-in user to find their node + short code.
//   shortCodeField    : OPTIONAL. Hierarchical org code (e.g. DSG, DSGA). A DSG
//                       leader sees every record whose code starts with "DSG".
//   visibleLeadersField : OPTIONAL. Multi-collaborator field listing every leader
//                       allowed to see the record (the ancestor-leader chain,
//                       precomputed by scripts/populate-visible-leaders.js). When
//                       present it takes precedence over the short-code prefix.
//   adminEmails       : emails that bypass scoping and see the whole org.
//
// Scoping only activates when leaderEmailField OR visibleLeadersField resolves;
// until then the chart shows the full org (unchanged behavior).
//
const FIELDS = {
    tableName: 'Employees & Positions',
    primaryNameSource: '[E] First Name, Last Name',
    jobTitleField: 'REF Title [F]',
    departmentField: '[F] Supervisory Organization 🔗',
    statusField: '[T] Position Status ⚙️',
    // Location shown under the team. Hidden for "New position" seats (no
    // incumbent / location yet).
    locationField: '[F] Location',
    parentLinkField: 'Future Manager',
    employeeIdField: '[E] Employee ID',
    managerIdField: '[F] Manager ID',
    // Field powering the "Organization" checkbox filter. Falls back to the
    // department field if this name doesn't resolve.
    orgFilterField: 'Future Organization',
    leaderEmailField: null,
    shortCodeField: 'Short Code',
    visibleLeadersField: null,
    adminEmails: [],
    // Per-employee "decision" shown as a chip on the card. Toggleable on screen
    // and ALWAYS omitted from exports (PDF/PNG). Set to null to disable entirely.
    employeeDecisionField: '[D] Employee Decision',
};

// ─── Field helpers ────────────────────────────────────────────────────────────

// Read a field as text. Falls back to getCellValue for linked-record / lookup
// fields whose getCellValueAsString can come back empty in the interface SDK.
function readText(record, field) {
    if (!field) return '';
    let s = '';
    try { s = record.getCellValueAsString(field); } catch { s = ''; }
    if (s && s.trim()) return s.trim();

    let v;
    try { v = record.getCellValue(field); } catch { return ''; }
    const parts = [];
    const visit = it => {
        if (it == null) return;
        if (typeof it === 'string') { if (it.trim()) parts.push(it.trim()); }
        else if (typeof it === 'number') parts.push(String(it));
        else if (typeof it === 'object') {
            if (typeof it.name === 'string' && it.name.trim()) parts.push(it.name.trim());
            else if (typeof it.value === 'string' && it.value.trim()) parts.push(it.value.trim());
            else if (typeof it.value === 'number') parts.push(String(it.value));
        }
    };
    if (Array.isArray(v)) v.forEach(visit);
    else visit(v);
    return parts.join(', ').trim();
}

const VACANT_LABEL = 'Vacant position';

// The incumbent's name. Unlike the display name, this does NOT fall back to the
// primary field — an empty result means the position has no incumbent (vacant).
function incumbentName(record, nameField) {
    const raw = nameField ? readText(record, nameField) : record.name;
    return (raw || '').trim();
}

function normName(s) {
    return String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
}

// Map a raw "[T] Position Status ⚙️" value to a clean display label: drops the
// verbose suffixes (e.g. "Employee mapped - position …") and fixes casing.
// Matches on distinctive substrings so it's tolerant of leading codes/icons or
// trailing detail. Unknown values pass through unchanged.
function normalizeStatus(raw) {
    const s = (raw || '').trim();
    if (!s) return '';
    const low = s.toLowerCase();
    if (low.includes('new position'))   return 'New position';
    if (low.includes('out of scope'))   return 'Out of scope';
    if (low.includes('at risk'))        return 'Employee at risk';
    if (low.includes('mapped'))         return 'Employee mapped';
    if (low.includes('decision pending') || low.includes('pending')) return 'Decision pending';
    return s;
}
const STATUS_NEW_POSITION = 'New position';

// Normalize a hierarchical short code for prefix matching (e.g. "dsg a" → "DSGA").
function normCode(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

// Emails of every collaborator in a multipleCollaborators cell (lowercased).
function readCollaboratorEmails(record, field) {
    if (!field) return [];
    let v;
    try { v = record.getCellValue(field); } catch { return []; }
    const out = [];
    const visit = it => { if (it && typeof it === 'object' && it.email) out.push(normName(it.email)); };
    if (Array.isArray(v)) v.forEach(visit);
    else visit(v);
    return out;
}

// Resolve a configured field NAME to a field instance, tolerating whitespace and
// decorative symbols (e.g. the "🔗" link emoji). Returns null if unset/not found.
function findFieldByName(table, name) {
    if (!name) return null;
    const exact = typeof table.getFieldByNameIfExists === 'function'
        ? table.getFieldByNameIfExists(name)
        : table.fields.find(f => f.name === name);
    if (exact) return exact;
    const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(name);
    if (!target) return null;
    return table.fields.find(f => norm(f.name) === target) || null;
}

// Candidate manager references from a cell. Handles linked-record fields (ids)
// and lookups (linkedRecordId and/or the looked-up manager name).
function extractParentRef(record, parentField) {
    const ids = [];
    const names = [];
    if (!parentField) return {ids, names};
    let cell;
    try {
        cell = record.getCellValue(parentField);
    } catch {
        return {ids, names};
    }
    const visit = item => {
        if (item == null) return;
        if (typeof item === 'string') {
            if (item.trim()) names.push(item.trim());
        } else if (typeof item === 'object') {
            if (item.id) ids.push(item.id);
            if (item.linkedRecordId) ids.push(item.linkedRecordId);
            if (typeof item.name === 'string' && item.name.trim()) names.push(item.name.trim());
            if (typeof item.value === 'string' && item.value.trim()) names.push(item.value.trim());
        }
    };
    if (Array.isArray(cell)) cell.forEach(visit);
    else visit(cell);
    if (ids.length === 0 && names.length === 0) {
        const asStr = readText(record, parentField);
        if (asStr) names.push(asStr);
    }
    return {ids, names};
}

// ─── Org model ────────────────────────────────────────────────────────────────

function buildOrg(records, cfg) {
    const {parentField, nameField, jobTitleField, departmentField, statusField,
        locationField, employeeIdField, managerIdField, orgFilterField, leaderEmailField,
        shortCodeField, visibleLeadersField, employeeDecisionField} = cfg;

    // Map each decision value to its native Airtable colour (so the chip matches
    // the single-select swatches exactly). Keyed by normalised choice name.
    const decisionStyleByName = {};
    const choices = employeeDecisionField
        && employeeDecisionField.options
        && employeeDecisionField.options.choices;
    if (Array.isArray(choices)) {
        choices.forEach(c => {
            if (!c || !c.name) return;
            const hex = c.color ? colorUtils.getHexForColor(c.color) : null;
            decisionStyleByName[normName(c.name)] = hex
                ? {bg: hex, fg: colorUtils.shouldUseLightTextOnColor(c.color) ? '#ffffff' : '#1f2937'}
                : null;
        });
    }

    const nodeMap = {};
    const idByName = {};
    const idByEmployeeId = {}; // employee-id value → record id

    records.forEach(r => {
        const incumbent = incumbentName(r, nameField);
        const vacant = !incumbent;
        const jobTitle = readText(r, jobTitleField);
        // Vacant seats show the role title as the headline (fall back to a
        // generic label only if there's no title either).
        const displayName = vacant ? (jobTitle || VACANT_LABEL) : incumbent;
        nodeMap[r.id] = {
            id: r.id,
            record: r,
            displayName,
            vacant,
            jobTitle,
            department: readText(r, departmentField),
            org: readText(r, orgFilterField),
            status: normalizeStatus(readText(r, statusField)),
            location: readText(r, locationField),
            email: normName(readText(r, leaderEmailField)),
            shortCode: normCode(readText(r, shortCodeField)),
            visibleLeaders: readCollaboratorEmails(r, visibleLeadersField),
            decision: readText(r, employeeDecisionField),
            decisionStyle: decisionStyleByName[normName(readText(r, employeeDecisionField))] || null,
            childIds: [],
            parentId: null,
        };
        // Don't index vacant "names" — they'd collide and mis-match by name.
        if (!vacant) {
            [displayName, r.name].forEach(n => {
                const k = normName(n);
                if (k && !(k in idByName)) idByName[k] = r.id;
            });
        }
        if (employeeIdField) {
            const eid = normName(readText(r, employeeIdField));
            if (eid && !(eid in idByEmployeeId)) idByEmployeeId[eid] = r.id;
        }
    });

    // Prefer a true id over name matching (names are ambiguous for duplicates):
    //   1. explicit manager-id → employee-id mapping (most reliable),
    //   2. linked-record id from the manager lookup/link,
    //   3. name match as a last resort.
    const resolveParentId = r => {
        if (managerIdField) {
            const mid = normName(readText(r, managerIdField));
            if (mid && idByEmployeeId[mid] && idByEmployeeId[mid] !== r.id) return idByEmployeeId[mid];
        }
        const {ids, names} = extractParentRef(r, parentField);
        for (const id of ids) {
            if (nodeMap[id] && id !== r.id) return id;
        }
        for (const nm of names) {
            const id = idByName[normName(nm)];
            if (id && id !== r.id) return id;
        }
        return null;
    };

    records.forEach(r => {
        const pid = resolveParentId(r);
        if (pid && nodeMap[pid]) {
            nodeMap[r.id].parentId = pid;
            nodeMap[pid].childIds.push(r.id);
        }
    });

    const byName = (a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName);
    Object.values(nodeMap).forEach(n => n.childIds.sort(byName));
    const rootIds = Object.keys(nodeMap).filter(id => !nodeMap[id].parentId).sort(byName);

    const totals = {};
    const computeTotal = (id, stack) => {
        if (totals[id] != null) return totals[id];
        if (stack.has(id)) return 0;
        stack.add(id);
        let sum = 0;
        nodeMap[id].childIds.forEach(c => { sum += 1 + computeTotal(c, stack); });
        stack.delete(id);
        totals[id] = sum;
        return sum;
    };
    Object.keys(nodeMap).forEach(id => computeTotal(id, new Set()));

    return {nodeMap, rootIds, totals};
}

function ancestorChain(nodeMap, id) {
    const chain = [];
    let cur = nodeMap[id] ? nodeMap[id].parentId : null;
    let guard = 0;
    const seen = new Set([id]);
    while (cur && nodeMap[cur] && !seen.has(cur) && guard < 200) {
        chain.push(cur);
        seen.add(cur);
        cur = nodeMap[cur].parentId;
        guard++;
    }
    return chain.reverse();
}

// Compute rootIds + descendant totals for an arbitrary node map (used after the
// full tree is pruned to a single leader's scope).
function deriveRootsTotals(nodeMap) {
    const ids = Object.keys(nodeMap);
    const byName = (a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName);
    const rootIds = ids.filter(id => !nodeMap[id].parentId).sort(byName);
    const totals = {};
    const compute = (id, stack) => {
        if (totals[id] != null) return totals[id];
        if (stack.has(id)) return 0;
        stack.add(id);
        let sum = 0;
        nodeMap[id].childIds.forEach(c => { if (nodeMap[c]) sum += 1 + compute(c, stack); });
        stack.delete(id);
        totals[id] = sum;
        return sum;
    };
    ids.forEach(id => compute(id, new Set()));
    return {nodeMap, rootIds, totals};
}

// ─── Avatars & status colors ──────────────────────────────────────────────────

const AVATAR_COLORS = [
    '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
    '#d97706', '#16a34a', '#0891b2', '#4f46e5', '#0d9488',
];

function colorFromString(s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_PALETTE = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

function buildStatusColors(nodeMap) {
    const vals = new Set();
    Object.values(nodeMap).forEach(n => { if (n.status) vals.add(n.status); });
    const m = {};
    [...vals].sort().forEach((v, i) => { m[v] = STATUS_PALETTE[i % STATUS_PALETTE.length]; });
    return m;
}

// ─── Export (PNG / PDF / paginated PDF) ──────────────────────────────────────

async function renderChartCanvas(el, {scale = 2} = {}) {
    el.classList.add('exporting');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
        return await html2canvas(el, {
            scale,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            width: el.scrollWidth,
            height: el.scrollHeight,
            windowWidth: el.scrollWidth,
            windowHeight: el.scrollHeight,
        });
    } finally {
        el.classList.remove('exporting');
    }
}

function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

async function exportPNG(boardEl) {
    const canvas = await renderChartCanvas(boardEl, {scale: 3});
    downloadDataUrl(canvas.toDataURL('image/png'), `org-chart-${timestamp()}.png`);
}

// ── Vector PDF ────────────────────────────────────────────────────────────
// Drawn with jsPDF vector primitives (not a screenshot), so text and borders
// stay razor-sharp at any zoom and every card has a true solid border.

const PDF_COLORS = {
    name: [15, 23, 42],
    title: [71, 85, 105],
    dept: [148, 163, 184],
    blue: [37, 99, 235],
    border: [148, 163, 184],     // solid report-card border
    borderFocus: [37, 99, 235],  // manager border
    divider: [226, 232, 240],
    page: [148, 163, 184],
    vacant: [180, 83, 9],        // amber "VACANT" marker
};

// Draw centered, wrapped text limited to maxLines; returns the y after the text.
function drawCenteredLines(pdf, text, cx, y, maxW, lh, maxLines) {
    if (!text) return y;
    const lines = pdf.splitTextToSize(String(text), maxW).slice(0, maxLines);
    lines.forEach((ln, i) => pdf.text(ln, cx, y + i * lh, {align: 'center'}));
    return y + lines.length * lh;
}

function drawPersonCard(pdf, x, y, w, h, card, isFocus) {
    const p = 8;
    const cx = x + w / 2;
    const innerW = w - p * 2;

    // White card with a true border (heavier + blue for managers, dashed grey
    // for vacant positions).
    pdf.setFillColor(255, 255, 255);
    if (card.vacant) {
        pdf.setDrawColor(...PDF_COLORS.dept);
        pdf.setLineWidth(isFocus ? 1.2 : 0.9);
        pdf.setLineDashPattern([3, 2], 0);
    } else if (isFocus) {
        pdf.setDrawColor(...PDF_COLORS.borderFocus);
        pdf.setLineWidth(1.4);
    } else {
        pdf.setDrawColor(...PDF_COLORS.border);
        pdf.setLineWidth(0.8);
    }
    pdf.roundedRect(x, y, w, h, 6, 6, 'FD');
    pdf.setLineDashPattern([], 0);
    if (isFocus && !card.vacant) {
        // Blue accent bar across the top edge.
        pdf.setFillColor(...PDF_COLORS.borderFocus);
        pdf.rect(x + 6, y, w - 12, 3, 'F');
    }

    let cy = y + 15;
    pdf.setFont('helvetica', card.vacant ? 'bolditalic' : 'bold');
    pdf.setFontSize(isFocus ? 9.6 : 8.8);
    pdf.setTextColor(...(card.vacant ? PDF_COLORS.title : PDF_COLORS.name));
    cy = drawCenteredLines(pdf, card.name, cx, cy, innerW, isFocus ? 11 : 10, 2);

    if (card.vacant) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.4);
        pdf.setTextColor(...PDF_COLORS.vacant);
        pdf.text('VACANT', cx, cy + 4, {align: 'center'});
        cy += 8;
    } else if (card.title) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(isFocus ? 7.8 : 7.6);
        pdf.setTextColor(...PDF_COLORS.title);
        cy = drawCenteredLines(pdf, card.title, cx, cy + 3, innerW, 9, 2);
    }
    if (card.dept) {
        pdf.setFontSize(7.2);
        pdf.setTextColor(...PDF_COLORS.dept);
        drawCenteredLines(pdf, card.dept, cx, cy + 2, innerW, 8, 1);
    }

    // Divider + the parenthesized team line pinned to the bottom.
    const footY = y + h - 8;
    pdf.setDrawColor(...PDF_COLORS.divider);
    pdf.setLineWidth(0.6);
    pdf.line(x + p, footY - 9, x + w - p, footY - 9);
    pdf.setFontSize(7.6);
    if (card.directs > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...PDF_COLORS.blue);
        const t = `(${card.directs} direct report${card.directs !== 1 ? 's' : ''} · ${card.total} total)`;
        pdf.text(pdf.splitTextToSize(t, innerW)[0], cx, footY, {align: 'center'});
    } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...PDF_COLORS.dept);
        pdf.text('(Individual contributor)', cx, footY, {align: 'center'});
    }
}

// Banner header used by org-filter sections (org name + position count).
function drawOrgBanner(pdf, x, y, w, h, name, count) {
    pdf.setFillColor(239, 246, 255);
    pdf.setDrawColor(...PDF_COLORS.borderFocus);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(x, y, w, h, 5, 5, 'FD');
    pdf.setFillColor(...PDF_COLORS.borderFocus);
    pdf.rect(x, y + 4, 4, h - 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...PDF_COLORS.name);
    pdf.text(pdf.splitTextToSize(String(name), w - 170)[0], x + 14, y + h / 2 + 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...PDF_COLORS.title);
    pdf.text(`${count} position${count !== 1 ? 's' : ''}`, x + w - 12, y + h / 2 + 4, {align: 'right'});
}

// sections: [{kind:'manager'|'org', header, reports:[card,...]}].
// Each section starts on a new page; its header (manager card, or org banner)
// repeats on top of each of its pages; footer reads "Page x / y".
function exportVectorPDF(sections) {
    const pdf = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const footer = 18;
    const headerGap = 14;
    const colGap = 12;
    const rowGap = 12;
    const availW = pageW - margin * 2;

    const targetCardW = 150;
    const cols = Math.max(1, Math.min(6, Math.floor((availW + colGap) / (targetCardW + colGap))));
    const cardW = (availW - (cols - 1) * colGap) / cols;
    const cardH = 88;
    const mgrW = Math.min(2 * cardW + colGap, availW);
    const orgHeaderH = 38;

    const headerHFor = sec => (sec.kind === 'org' ? orgHeaderH : cardH);
    const rowsPerPageFor = sec => {
        const avail = pageH - margin - footer - (margin + headerHFor(sec) + headerGap);
        return Math.max(1, Math.floor((avail + rowGap) / (cardH + rowGap)));
    };
    const pagesFor = sec =>
        Math.max(1, Math.ceil(Math.ceil(sec.reports.length / cols) / rowsPerPageFor(sec)) || 1);
    const totalPages = sections.reduce((s, sec) => s + pagesFor(sec), 0);

    let pageIndex = 0;
    sections.forEach(sec => {
        const headerH = headerHFor(sec);
        const gridTop = margin + headerH + headerGap;
        const rowsPerPage = rowsPerPageFor(sec);
        const rowsTotal = Math.ceil(sec.reports.length / cols);
        const nPages = pagesFor(sec);
        for (let pg = 0; pg < nPages; pg++) {
            if (pageIndex > 0) pdf.addPage();
            if (sec.kind === 'org') {
                drawOrgBanner(pdf, margin, margin, availW, orgHeaderH, sec.header.name, sec.header.count);
            } else {
                drawPersonCard(pdf, margin + (availW - mgrW) / 2, margin, mgrW, cardH, sec.header, true);
            }

            const startRow = pg * rowsPerPage;
            const endRow = Math.min(rowsTotal, startRow + rowsPerPage);
            for (let row = startRow; row < endRow; row++) {
                const y = gridTop + (row - startRow) * (cardH + rowGap);
                for (let c = 0; c < cols; c++) {
                    const idx = row * cols + c;
                    if (idx >= sec.reports.length) break;
                    const x = margin + c * (cardW + colGap);
                    drawPersonCard(pdf, x, y, cardW, cardH, sec.reports[idx], false);
                }
            }

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(...PDF_COLORS.page);
            pdf.text(`Page ${pageIndex + 1} / ${totalPages}`, pageW - margin - 64, pageH - margin / 2);
            pageIndex++;
        }
    });

    pdf.save(`org-chart-${timestamp()}.pdf`);
}

function ExportMenu({boardRef, getData}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const run = useCallback(async fn => {
        setBusy(true);
        setOpen(false);
        try {
            await fn();
        } catch (err) {
            window.alert('Export failed: ' + (err && err.message ? err.message : err));
        } finally {
            setBusy(false);
        }
    }, []);

    return (
        <div className="export-wrap" ref={ref}>
            <button className="tb-btn" onClick={() => setOpen(o => !o)} disabled={busy} title="Export">
                {busy ? 'Exporting…' : 'Export ▾'}
            </button>
            {open && (
                <div className="menu">
                    <button onClick={() => run(() => exportVectorPDF(getData()))}>PDF (crisp vector)</button>
                    <button onClick={() => run(() => boardRef.current && exportPNG(boardRef.current))}>PNG image</button>
                </div>
            )}
        </div>
    );
}

// ─── Checkbox filter (searchable, multi-select) ──────────────────────────────
// options: array of {value, label, sub?}

function CheckboxFilter({label, options, selected, onChange}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return options;
        return options.filter(o =>
            o.label.toLowerCase().includes(needle) ||
            (o.sub && o.sub.toLowerCase().includes(needle)));
    }, [q, options]);

    const toggle = useCallback(value => {
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange(next);
    }, [selected, onChange]);

    const count = selected.size;

    return (
        <div className="filter-wrap" ref={ref}>
            <button
                className={`tb-btn ${count > 0 ? 'tb-btn-active' : ''}`}
                onClick={() => setOpen(o => !o)}
                title={`Filter by ${label}`}
            >
                {label}{count > 0 ? ` (${count})` : ''} ▾
            </button>
            {open && (
                <div className="menu filter-menu" onClick={e => e.stopPropagation()}>
                    <input
                        className="filter-search"
                        value={q}
                        placeholder={`Search ${label.toLowerCase()}…`}
                        onChange={e => setQ(e.target.value)}
                        autoFocus
                    />
                    <div className="filter-actions">
                        <button onClick={() => onChange(new Set(filtered.map(o => o.value)))}>
                            Select shown
                        </button>
                        <button onClick={() => onChange(new Set())}>Clear</button>
                    </div>
                    <div className="filter-list">
                        {filtered.length === 0 && <div className="filter-empty">No matches</div>}
                        {filtered.map(o => (
                            <label key={o.value} className="filter-option">
                                <input
                                    type="checkbox"
                                    checked={selected.has(o.value)}
                                    onChange={() => toggle(o.value)}
                                />
                                <span className="filter-option-text">
                                    <span className={`filter-option-label${o.vacant ? ' vacant' : ''}`}>{o.label}</span>
                                    {o.sub && <span className="filter-option-sub">{o.sub}</span>}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Search (jump to anyone) ──────────────────────────────────────────────────

function SearchBox({nodeMap, onJump}) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const matches = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return [];
        const out = [];
        for (const n of Object.values(nodeMap)) {
            if (
                n.displayName.toLowerCase().includes(needle) ||
                (n.jobTitle && n.jobTitle.toLowerCase().includes(needle)) ||
                (n.department && n.department.toLowerCase().includes(needle))
            ) {
                out.push(n);
                if (out.length >= 30) break;
            }
        }
        return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [q, nodeMap]);

    return (
        <div className="search-wrap" ref={ref}>
            <input
                className="search-input"
                value={q}
                placeholder="Search people…"
                onChange={e => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
            />
            {open && q.trim() && (
                <div className="menu search-menu">
                    {matches.length === 0 && <div className="search-empty">No matches</div>}
                    {matches.map(n => (
                        <button key={n.id} onClick={() => { onJump(n.id); setOpen(false); setQ(''); }}>
                            <span className="search-name">{n.displayName}</span>
                            {n.jobTitle && <span className="search-meta">{n.jobTitle}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

// ─── Person card ──────────────────────────────────────────────────────────────

// Whether the per-employee "decision" chip is shown. Provided once at the board
// root rather than drilled through every section/tree level (parallel to the
// avatar toggle, which is prop-drilled). Always false during export.
const DecisionContext = createContext(false);

function PersonCard({node, variant, directs, total, statusColor, showAvatar, expanded, onDrill, onOpen}) {
    const showDecision = useContext(DecisionContext);
    const drillable = variant === 'report' && directs > 0;
    const cls = ['person-card', `person-card-${variant}`, 'clickable'];
    if (!showAvatar) cls.push('no-avatar');
    if (node.vacant) cls.push('vacant');
    if (expanded) cls.push('expanded');
    // Reports drill into their own subtree; the focus card opens the record.
    const onClick = variant === 'report' ? () => onDrill(node.id) : () => onOpen(node);
    // `expanded` is a boolean in the inline-expand tree (▾ collapse / ▴), and
    // undefined in the filtered views where a click re-roots ("drill").
    const title = variant !== 'report'
        ? `Open ${node.displayName} in Airtable`
        : expanded === undefined
            ? `Drill into ${node.displayName}`
            : drillable
                ? `${expanded ? 'Collapse' : 'Expand'} ${node.displayName}`
                : `Open ${node.displayName} in Airtable`;
    return (
        <div
            className={cls.join(' ')}
            style={statusColor ? {borderLeftColor: statusColor, borderLeftWidth: 4} : undefined}
            onClick={onClick}
            title={title}
        >
            {showAvatar && (
                <div
                    className="person-avatar"
                    style={{background: node.vacant ? '#cbd5e1' : colorFromString(node.displayName)}}
                >
                    {node.vacant ? '—' : initials(node.displayName)}
                </div>
            )}
            <div className="person-info">
                <div className="person-name">{node.displayName}</div>
                {node.vacant
                    ? <div className="vacant-badge">Vacant</div>
                    : (node.jobTitle && <div className="person-title">{node.jobTitle}</div>)}
                {node.department && <div className="person-dept">{node.department}</div>}
                {node.location && node.status !== STATUS_NEW_POSITION && (
                    <div className="person-loc">{node.location}</div>
                )}
            </div>
            <div className="person-foot">
                {directs > 0 ? (
                    <span className="person-reports">
                        ({directs} direct report{directs !== 1 ? 's' : ''} · {total} total)
                    </span>
                ) : (
                    <span className="person-ic">(Individual contributor)</span>
                )}
            </div>
            {showDecision && node.decision && (
                <div className="person-decision">
                    <span
                        className="decision-chip"
                        style={node.decisionStyle
                            ? {background: node.decisionStyle.bg, color: node.decisionStyle.fg, borderColor: node.decisionStyle.bg}
                            : undefined}
                    >
                        {node.decision}
                    </span>
                </div>
            )}
            {drillable && <div className="person-drill">{expanded ? '▴' : '▾'}</div>}
        </div>
    );
}

// One node in the inline expand/collapse tree (Workday-style drill-down). A node
// shows its direct reports only while it's the *open* child of its parent —
// siblings are mutually exclusive, so opening one collapses the other and the
// newly-opened box centers over its own reports while staying linked to the
// manager above. The root focus is always open.
function Branch({node, nodeMap, totals, statusColors, showAvatar, openByParent, onToggle, onOpen, isRoot}) {
    const open = isRoot || openByParent[node.parentId] === node.id;
    const children = open ? node.childIds.map(id => nodeMap[id]).filter(Boolean) : [];
    return (
        <div className="branch">
            <PersonCard
                node={node}
                variant={isRoot ? 'focus' : 'report'}
                directs={node.childIds.length}
                total={totals[node.id] || 0}
                statusColor={node.status ? statusColors[node.status] : null}
                showAvatar={showAvatar}
                expanded={isRoot ? undefined : (open && node.childIds.length > 0)}
                onDrill={onToggle}
                onOpen={onOpen}
            />
            {children.length > 0 && (
                <>
                    <div className="connector-vertical" />
                    <div className="branch-children">
                        {children.map(child => (
                            <Branch
                                key={child.id}
                                node={child}
                                nodeMap={nodeMap}
                                totals={totals}
                                statusColors={statusColors}
                                showAvatar={showAvatar}
                                openByParent={openByParent}
                                onToggle={onToggle}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// A manager + their direct reports (used by the Manager filter view).
function ManagerSection({node, nodeMap, totals, statusColors, showAvatar, onDrill, onOpen}) {
    const children = node.childIds.map(id => nodeMap[id]);
    return (
        <div className="manager-section">
            <PersonCard
                node={node}
                variant="focus"
                directs={node.childIds.length}
                total={totals[node.id] || 0}
                statusColor={node.status ? statusColors[node.status] : null}
                showAvatar={showAvatar}
                onDrill={onDrill}
                onOpen={onOpen}
            />
            {children.length > 0 && (
                <>
                    <div className="connector-vertical" />
                    <div className="reports-grid">
                        {children.map(child => (
                            <PersonCard
                                key={child.id}
                                node={child}
                                variant="report"
                                directs={child.childIds.length}
                                total={totals[child.id] || 0}
                                statusColor={child.status ? statusColors[child.status] : null}
                                showAvatar={showAvatar}
                                onDrill={onDrill}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// An organization + the positions in it (used by the Organization filter view).
function OrgSection({org, members, totals, statusColors, showAvatar, onDrill, onOpen}) {
    return (
        <div className="manager-section">
            <div className="org-header">
                <span className="org-header-name">{org}</span>
                <span className="org-header-count">
                    {members.length} position{members.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="reports-grid">
                {members.map(n => (
                    <PersonCard
                        key={n.id}
                        node={n}
                        variant="report"
                        directs={n.childIds.length}
                        total={totals[n.id] || 0}
                        statusColor={n.status ? statusColors[n.status] : null}
                        showAvatar={showAvatar}
                        onDrill={onDrill}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Main Workday-style chart ─────────────────────────────────────────────────

function WorkdayChart({table}) {
    const records = useRecords(table);
    const [focusIdState, setFocusIdState] = useState(null);
    const [managerFilter, setManagerFilter] = useState(() => new Set());
    const [orgFilter, setOrgFilter] = useState(() => new Set());
    const [showAvatars, setShowAvatars] = useState(true);
    const [showDecision, setShowDecision] = useState(true);
    // Inline expand/collapse tree: parentId → the id of its currently-open child
    // (one open child per parent ⇒ siblings are mutually exclusive).
    const [openByParent, setOpenByParent] = useState({});
    const boardRef = useRef(null);

    const cfg = useMemo(() => {
        const nameField = FIELDS.primaryNameSource && FIELDS.primaryNameSource !== 'name'
            ? findFieldByName(table, FIELDS.primaryNameSource)
            : null;
        const parentField = FIELDS.parentLinkField
            ? findFieldByName(table, FIELDS.parentLinkField)
            : (table.fields.find(f => f.type === 'multipleRecordLinks') || null);
        const departmentField = findFieldByName(table, FIELDS.departmentField);
        return {
            nameField,
            jobTitleField: findFieldByName(table, FIELDS.jobTitleField),
            departmentField,
            statusField: findFieldByName(table, FIELDS.statusField),
            locationField: findFieldByName(table, FIELDS.locationField),
            parentField,
            employeeIdField: findFieldByName(table, FIELDS.employeeIdField),
            managerIdField: findFieldByName(table, FIELDS.managerIdField),
            // Org filter field, falling back to the department/supervisory org.
            orgFilterField: findFieldByName(table, FIELDS.orgFilterField) || departmentField,
            leaderEmailField: findFieldByName(table, FIELDS.leaderEmailField),
            shortCodeField: findFieldByName(table, FIELDS.shortCodeField),
            visibleLeadersField: findFieldByName(table, FIELDS.visibleLeadersField),
            employeeDecisionField: findFieldByName(table, FIELDS.employeeDecisionField),
        };
    }, [table]);
    const cfgKey = Object.values(cfg).map(f => (f ? f.id : '∅')).join('|');

    const {nodeMap: fullNodeMap} = useMemo(
        () => buildOrg(records, cfg),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, cfgKey],
    );

    // ─── Per-leader scoping ──────────────────────────────────────────────────
    // Identify the signed-in user and restrict the org to their branch. Scoping
    // is off (full org) until leaderEmailField or visibleLeadersField is set.
    const session = useSession();
    const viewerEmail = normName(session && session.currentUser ? session.currentUser.email : '');
    const adminSet = useMemo(
        () => new Set((FIELDS.adminEmails || []).map(normName)),
        [],
    );
    const scopingConfigured = !!(cfg.leaderEmailField || cfg.visibleLeadersField);
    const isAdmin = adminSet.has(viewerEmail);

    // Set of record ids the viewer may see, or null = unrestricted (full org).
    const scope = useMemo(() => {
        if (!scopingConfigured || isAdmin) return null;
        if (!viewerEmail) return new Set(); // public share / unidentifiable
        // 1) Collaborator field ("Visible to leaders") takes precedence.
        if (cfg.visibleLeadersField) {
            const s = new Set();
            for (const n of Object.values(fullNodeMap)) {
                if (n.visibleLeaders && n.visibleLeaders.includes(viewerEmail)) s.add(n.id);
            }
            if (s.size > 0) {
                // The access field lists each record's SUPERIORS, so this set is the
                // leader's subordinates — it excludes the leader's own seat, which
                // sits up in the parent org they don't manage. Add the immediate
                // parent(s) of the top of the scoped branch so the leader appears as
                // the top box, with their direct reports hanging beneath it.
                const parents = new Set();
                for (const id of s) {
                    const n = fullNodeMap[id];
                    if (n && n.parentId && !s.has(n.parentId)) parents.add(n.parentId);
                }
                parents.forEach(pid => { if (fullNodeMap[pid]) s.add(pid); });
                return s;
            }
        }
        // 2) Fall back to short-code prefix from the viewer's own leader node.
        const leaderNode = Object.values(fullNodeMap).find(n => n.email && n.email === viewerEmail);
        if (leaderNode && leaderNode.shortCode) {
            const code = leaderNode.shortCode;
            const s = new Set();
            for (const n of Object.values(fullNodeMap)) {
                if (n.shortCode && n.shortCode.startsWith(code)) s.add(n.id);
            }
            s.add(leaderNode.id);
            return s;
        }
        return new Set();
    }, [scopingConfigured, isAdmin, viewerEmail, fullNodeMap, cfg.visibleLeadersField]);

    const noView = scopingConfigured && !isAdmin && (!scope || scope.size === 0);

    // Prune the full tree to the scoped branch (parent/child links clipped to scope).
    const {nodeMap, rootIds, totals} = useMemo(() => {
        if (!scope) return deriveRootsTotals(fullNodeMap);
        const m = {};
        for (const id of scope) {
            const n = fullNodeMap[id];
            if (!n) continue;
            m[id] = {
                ...n,
                parentId: (n.parentId && scope.has(n.parentId)) ? n.parentId : null,
                childIds: n.childIds.filter(c => scope.has(c)),
            };
        }
        return deriveRootsTotals(m);
    }, [scope, fullNodeMap]);

    const statusColors = useMemo(() => buildStatusColors(nodeMap), [nodeMap]);
    const hasStatus = Object.keys(statusColors).length > 0;

    // Managers = people with at least one direct report.
    const managerOptions = useMemo(() => {
        return Object.values(nodeMap)
            .filter(n => n.childIds.length > 0)
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(n => {
                const count = `${n.childIds.length} report${n.childIds.length !== 1 ? 's' : ''}`;
                // Vacant seats read "Role title (Vacant)"; the title is already the label.
                const label = n.vacant ? `${n.displayName} (Vacant)` : n.displayName;
                const sub = n.vacant ? count : count + (n.jobTitle ? ` · ${n.jobTitle}` : '');
                return {value: n.id, label, sub, vacant: n.vacant};
            });
    }, [nodeMap]);

    // Organizations = distinct values of the org field, with a position count.
    const orgOptions = useMemo(() => {
        const counts = new Map();
        Object.values(nodeMap).forEach(n => {
            const org = (n.org || '').trim();
            if (org) counts.set(org, (counts.get(org) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([org, c]) => ({value: org, label: org, sub: `${c} position${c !== 1 ? 's' : ''}`}));
    }, [nodeMap]);

    // The Manager and Organization filters are mutually exclusive — selecting in
    // one clears the other so the board shows a single, unambiguous view.
    const selectManagers = useCallback(next => {
        setManagerFilter(next);
        if (next.size) setOrgFilter(new Set());
    }, []);
    const selectOrgs = useCallback(next => {
        setOrgFilter(next);
        if (next.size) setManagerFilter(new Set());
    }, []);

    const defaultFocusId = useMemo(() => {
        if (rootIds.length === 0) return null;
        return [...rootIds].sort((a, b) => (totals[b] || 0) - (totals[a] || 0))[0];
    }, [rootIds, totals]);

    const focusId = (focusIdState && nodeMap[focusIdState]) ? focusIdState : defaultFocusId;
    const focus = focusId ? nodeMap[focusId] : null;

    const chain = useMemo(
        () => (focusId ? ancestorChain(nodeMap, focusId) : []),
        [nodeMap, focusId],
    );

    const drill = useCallback(id => setFocusIdState(id), []);
    // Clicking a card while a filter is active jumps back to normal navigation.
    const drillFromFilter = useCallback(id => {
        setManagerFilter(new Set());
        setOrgFilter(new Set());
        setFocusIdState(id);
    }, []);
    const openRecord = useCallback(node => { if (node && node.record) expandRecord(node.record); }, []);

    // Toggle a report's inline expansion. Opening a node sets it as its parent's
    // open child (collapsing any sibling); a leaf has nothing to expand, so it
    // opens its record instead.
    const toggleExpand = useCallback(id => {
        const n = nodeMap[id];
        if (!n) return;
        if (n.childIds.length === 0) { openRecord(n); return; }
        const pid = n.parentId;
        setOpenByParent(prev => {
            const next = {...prev};
            if (next[pid] === id) delete next[pid];
            else next[pid] = id;
            return next;
        });
    }, [nodeMap, openRecord]);

    // Re-rooting (new focus, search jump, or filter) starts from a clean tree.
    useEffect(() => { setOpenByParent({}); }, [focusId]);

    const managerActive = managerFilter.size > 0;
    const orgActive = orgFilter.size > 0;
    const filterActive = managerActive || orgActive;
    const selectedManagers = useMemo(
        () => [...managerFilter].filter(id => nodeMap[id]),
        [managerFilter, nodeMap],
    );
    // Selected orgs → the positions in each, sorted managers-first then by name.
    const selectedOrgs = useMemo(() => {
        if (!orgActive) return [];
        return [...orgFilter].sort((a, b) => a.localeCompare(b)).map(org => ({
            org,
            members: Object.values(nodeMap)
                .filter(n => (n.org || '').trim() === org)
                .sort((a, b) =>
                    (b.childIds.length > 0) - (a.childIds.length > 0) ||
                    a.displayName.localeCompare(b.displayName)),
        }));
    }, [orgActive, orgFilter, nodeMap]);

    // Build the sections the vector PDF draws: a manager section (manager card +
    // direct reports) per manager, OR an org section (org banner + members) per
    // organization, OR the focused manager when no filter is active.
    const buildExportData = useCallback(() => {
        const toCard = n => ({
            name: n.displayName,
            // For vacant seats the title is already the headline, so don't repeat it.
            title: n.vacant ? '' : n.jobTitle,
            dept: n.department,
            directs: n.childIds.length,
            total: totals[n.id] || 0,
            vacant: n.vacant,
        });
        if (orgActive) {
            return selectedOrgs.map(({org, members}) => ({
                kind: 'org',
                header: {name: org, count: members.length},
                reports: members.map(toCard),
            }));
        }
        const ids = managerActive
            ? [...selectedManagers].sort((a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName))
            : (focusId ? [focusId] : []);
        return ids.map(id => ({
            kind: 'manager',
            header: toCard(nodeMap[id]),
            reports: nodeMap[id].childIds.map(c => toCard(nodeMap[c])),
        }));
    }, [orgActive, selectedOrgs, managerActive, selectedManagers, focusId, nodeMap, totals]);

    if (noView) {
        return (
            <div className="org-root">
                <div className="toolbar">
                    <span className="app-title">Org Chart</span>
                </div>
                <div className="empty-state">
                    This org chart is personalized per leader, and there is no view
                    available for{viewerEmail ? <> <strong>{viewerEmail}</strong></> : ' your account'}.
                    If you should have access, ask an administrator to add your email as
                    a leader, or to the admin list.
                </div>
            </div>
        );
    }

    if (!focus) {
        return (
            <div className="org-root">
                <div className="toolbar">
                    <span className="app-title">Org Chart</span>
                </div>
                <div className="empty-state">
                    No people to display. Check that the name and manager fields
                    resolved, or configure a table in the Data panel.
                </div>
            </div>
        );
    }

    const children = focus.childIds.map(id => nodeMap[id]);

    return (
        <DecisionContext.Provider value={showDecision}>
        <div className="org-root">
            {/* Toolbar */}
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="app-title">Org Chart</span>
                    <CheckboxFilter
                        label="Manager"
                        options={managerOptions}
                        selected={managerFilter}
                        onChange={selectManagers}
                    />
                    {cfg.orgFilterField && (
                        <CheckboxFilter
                            label="Organization"
                            options={orgOptions}
                            selected={orgFilter}
                            onChange={selectOrgs}
                        />
                    )}
                    {filterActive && (
                        <button
                            className="tb-btn tb-btn-clear"
                            onClick={() => { setManagerFilter(new Set()); setOrgFilter(new Set()); }}
                            title="Clear filters"
                        >
                            {orgActive
                                ? `Clear · ${selectedOrgs.length} org${selectedOrgs.length !== 1 ? 's' : ''}`
                                : `Clear · ${selectedManagers.length} manager${selectedManagers.length !== 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
                <div className="toolbar-right">
                    {hasStatus && (
                        <div className="legend">
                            {Object.entries(statusColors).map(([label, color]) => (
                                <span key={label} className="legend-item">
                                    <span className="legend-dot" style={{background: color}} />
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                    <SearchBox nodeMap={nodeMap} onJump={drillFromFilter} />
                    <button
                        className={`tb-btn ${showAvatars ? 'tb-btn-active' : ''}`}
                        onClick={() => setShowAvatars(v => !v)}
                        title={showAvatars ? 'Hide avatar circles' : 'Show avatar circles'}
                    >
                        Avatars
                    </button>
                    {cfg.employeeDecisionField && (
                        <button
                            className={`tb-btn ${showDecision ? 'tb-btn-active' : ''}`}
                            onClick={() => setShowDecision(v => !v)}
                            title={showDecision ? 'Hide employee decision' : 'Show employee decision'}
                        >
                            Decision
                        </button>
                    )}
                    <ExportMenu boardRef={boardRef} getData={buildExportData} />
                </div>
            </div>

            {/* Breadcrumb (focus mode only) */}
            {!filterActive && (
                <div className="breadcrumb">
                    {chain.length === 0 && <span className="crumb crumb-current">Top of organization</span>}
                    {chain.map(id => (
                        <span key={id} className="crumb-wrap">
                            <button className="crumb" onClick={() => drill(id)}>{nodeMap[id].displayName}</button>
                            <span className="crumb-sep">›</span>
                        </span>
                    ))}
                    {chain.length > 0 && <span className="crumb crumb-current">{focus.displayName}</span>}
                </div>
            )}

            {/* Board */}
            <div className="board-scroll">
                {orgActive ? (
                    <div className="board board-filtered" ref={boardRef}>
                        {selectedOrgs.length === 0 && (
                            <div className="no-reports">No matching organizations.</div>
                        )}
                        {selectedOrgs.map(({org, members}) => (
                            <OrgSection
                                key={org}
                                org={org}
                                members={members}
                                totals={totals}
                                statusColors={statusColors}
                                showAvatar={showAvatars}
                                onDrill={drillFromFilter}
                                onOpen={openRecord}
                            />
                        ))}
                    </div>
                ) : managerActive ? (
                    <div className="board board-filtered" ref={boardRef}>
                        {selectedManagers.length === 0 && (
                            <div className="no-reports">No matching managers.</div>
                        )}
                        {selectedManagers
                            .sort((a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName))
                            .map(id => (
                                <ManagerSection
                                    key={id}
                                    node={nodeMap[id]}
                                    nodeMap={nodeMap}
                                    totals={totals}
                                    statusColors={statusColors}
                                    showAvatar={showAvatars}
                                    onDrill={drillFromFilter}
                                    onOpen={openRecord}
                                />
                            ))}
                    </div>
                ) : (
                    <div className="board" ref={boardRef}>
                        {focus.parentId && nodeMap[focus.parentId] && (
                            <button
                                className="up-btn"
                                onClick={() => drill(focus.parentId)}
                                title={`Up to ${nodeMap[focus.parentId].displayName}`}
                            >
                                ↑ {nodeMap[focus.parentId].displayName}
                            </button>
                        )}

                        <Branch
                            node={focus}
                            nodeMap={nodeMap}
                            totals={totals}
                            statusColors={statusColors}
                            showAvatar={showAvatars}
                            openByParent={openByParent}
                            onToggle={toggleExpand}
                            onOpen={openRecord}
                            isRoot
                        />
                        {children.length === 0 && (
                            <div className="no-reports">No direct reports</div>
                        )}
                    </div>
                )}
            </div>
        </div>
        </DecisionContext.Provider>
    );
}

// ─── App ────────────────────────────────────────────────────────────────────

function OrgChartApp() {
    const base = useBase();
    const namedTable = FIELDS.tableName
        ? (typeof base.getTableByNameIfExists === 'function'
            ? base.getTableByNameIfExists(FIELDS.tableName)
            : base.tables.find(t => t.name === FIELDS.tableName))
        : null;
    const table = namedTable || base.tables[0];

    if (!table) {
        return (
            <div style={{padding: 16, color: '#dc2626'}}>
                {FIELDS.tableName
                    ? `Table "${FIELDS.tableName}" not found. Check tableName in the FIELDS config, or configure a table in the Data panel.`
                    : 'No table found. Please configure a table in the Data panel.'}
            </div>
        );
    }

    return <WorkdayChart table={table} />;
}

initializeBlock({interface: () => <OrgChartApp />});
