import {
    initializeBlock,
    useBase,
    useRecords,
    useSession,
    expandRecord,
    colorUtils,
} from '@airtable/blocks/interface/ui';
import {createContext, useContext, useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback} from 'react';
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
//   statusField       : optional status shown as a colored chip (null to disable).
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
    // Position-based linking so a VACANT manager (no incumbent, so no name or
    // employee id to match) still connects its branch to the level above.
    //   positionIdField        : each record's OWN position id.
    //   managerPositionIdField : the manager's position id on each record.
    // Both tolerate values like "50692845 - Global Head … (Name)" — the leading
    // number is used. If positionIdField doesn't resolve, the record's primary
    // field is parsed for a leading id as a fallback.
    positionIdField: '[F] Position ID',
    managerPositionIdField: '[F] Manager ID',
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

// Fallback chip colours used when the status field is text/formula (no native
// single-select swatches). Soft pill backgrounds with a readable foreground.
const STATUS_FALLBACK_STYLES = {
    'New position':     {bg: '#e0e7ff', fg: '#3730a3'}, // indigo
    'Out of scope':     {bg: '#fee2e2', fg: '#991b1b'}, // red
    'Employee mapped':  {bg: '#dcfce7', fg: '#166534'}, // green
    'Employee at risk': {bg: '#fef3c7', fg: '#92400e'}, // amber
    'Decision pending': {bg: '#fef9c3', fg: '#854d0e'}, // yellow
};

// Normalize a hierarchical short code for prefix matching (e.g. "dsg a" → "DSGA").
function normCode(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

// Pull a position id out of a value that may be a bare id ("50692845") or a
// formatted label ("50692845 - Global Head … (Name)"): the first run of 3+
// digits, else the whole trimmed/normalized token.
function parsePositionId(s) {
    const str = String(s == null ? '' : s);
    const m = str.match(/\d{3,}/);
    if (m) return m[0];
    const t = str.normalize('NFKC').trim().toLowerCase();
    return t;
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
        locationField, employeeIdField, managerIdField, positionIdField,
        managerPositionIdField, orgFilterField, leaderEmailField,
        shortCodeField, visibleLeadersField, employeeDecisionField} = cfg;

    // Each record's own position id (works even for vacant seats). Prefer the
    // dedicated field; fall back to a leading id parsed from the primary field.
    const positionIdOf = r => {
        const raw = positionIdField ? readText(r, positionIdField) : '';
        if (raw) return parsePositionId(raw);
        return parsePositionId(r.name);
    };
    const managerPositionIdOf = r =>
        managerPositionIdField ? parsePositionId(readText(r, managerPositionIdField)) : '';

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

    // Status colours. Prefer the field's own single-select swatches (keyed by the
    // NORMALISED label so it lines up with node.status); otherwise fall back to a
    // sensible palette for the known statuses.
    const statusStyleByName = {};
    const statusChoices = statusField && statusField.options && statusField.options.choices;
    if (Array.isArray(statusChoices)) {
        statusChoices.forEach(c => {
            if (!c || !c.name) return;
            const key = normName(normalizeStatus(c.name));
            const hex = c.color ? colorUtils.getHexForColor(c.color) : null;
            if (hex && !statusStyleByName[key]) {
                statusStyleByName[key] = {bg: hex, fg: colorUtils.shouldUseLightTextOnColor(c.color) ? '#ffffff' : '#1f2937'};
            }
        });
    }
    const statusStyleFor = label => statusStyleByName[normName(label)] || STATUS_FALLBACK_STYLES[label] || null;

    const nodeMap = {};
    const idByName = {};
    const idByEmployeeId = {};  // employee-id value → record id
    const idByPositionId = {};  // position-id value → record id (survives vacancy)

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
            statusStyle: statusStyleFor(normalizeStatus(readText(r, statusField))),
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
        const pid = positionIdOf(r);
        if (pid && !(pid in idByPositionId)) idByPositionId[pid] = r.id;
    });

    // Prefer a true id over name matching (names are ambiguous for duplicates):
    //   0. manager POSITION id → position id (works even when the manager seat
    //      is vacant, so the branch above never gets cut off),
    //   1. explicit manager-id → employee-id mapping,
    //   2. linked-record id from the manager lookup/link,
    //   3. name match as a last resort.
    const resolveParentId = r => {
        const mpid = managerPositionIdOf(r);
        if (mpid && idByPositionId[mpid] && idByPositionId[mpid] !== r.id) return idByPositionId[mpid];
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

// ─── Export (vector PDF) ─────────────────────────────────────────────────────

function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
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

function ExportButton({getData}) {
    const [busy, setBusy] = useState(false);
    const run = useCallback(async () => {
        setBusy(true);
        try {
            await exportVectorPDF(getData());
        } catch (err) {
            window.alert('Export failed: ' + (err && err.message ? err.message : err));
        } finally {
            setBusy(false);
        }
    }, [getData]);

    return (
        <button className="tb-btn" onClick={run} disabled={busy} title="Export the chart as a PDF">
            {busy ? 'Exporting…' : 'Export PDF'}
        </button>
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

function PersonCard({node, variant, directs, total, showAvatar, expanded, onDrill, onOpen}) {
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
                {/* Name / title / department use fixed two-line slots (wrap to 2,
                    centered when shorter) so every card stays the same height. */}
                <div className="person-name"><span>{node.displayName}</span></div>
                <div className="person-title">
                    {node.vacant
                        ? <span className="vacant-badge">Vacant</span>
                        : <span>{node.jobTitle}</span>}
                </div>
                <div className="person-dept"><span>{node.department}</span></div>
                {node.location && node.status !== STATUS_NEW_POSITION && (
                    <div className="person-loc">{node.location}</div>
                )}
                {node.status && (
                    <div className="person-status">
                        <span
                            className="status-chip"
                            style={node.statusStyle
                                ? {background: node.statusStyle.bg, color: node.statusStyle.fg, borderColor: node.statusStyle.bg}
                                : undefined}
                        >
                            {node.status}
                        </span>
                    </div>
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

// Reorder a row of siblings so the open one sits in the middle, peers split to
// the sides (Workday-style: the expanded peer takes the center).
function centerOrder(ids, openId) {
    if (!openId || !ids.includes(openId)) return ids;
    const others = ids.filter(id => id !== openId);
    const mid = Math.floor(others.length / 2);
    return [...others.slice(0, mid), openId, ...others.slice(mid)];
}

// A single level (row) of sibling cards with FLIP animation: when `ids` reorder
// (the open peer slides to the center), the SAME card elements glide from their
// old positions to their new ones, like swapping cards; freshly added cards fade
// in. Card elements persist (keyed by id) so the slide is possible.
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
function reducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function TreeLevel({ids, nodeMap, totals, showAvatar, openChildId, nowrap, onToggle, onOpen}) {
    const ref = useRef(null);
    const prevRects = useRef(new Map());
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const kids = Array.from(el.children);
        const newRects = new Map();
        const reduce = reducedMotion();
        kids.forEach((node, i) => {
            const cid = ids[i];
            if (!cid) return;
            const rect = node.getBoundingClientRect();
            newRects.set(cid, rect);
            if (reduce) return;
            const prev = prevRects.current.get(cid);
            if (prev) {
                const dx = prev.left - rect.left;
                const dy = prev.top - rect.top;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    node.animate(
                        [{transform: `translate(${dx}px, ${dy}px)`}, {transform: 'translate(0, 0)'}],
                        {duration: 520, easing: FLIP_EASING},
                    );
                }
            } else {
                // Newly revealed card — fade/slide in.
                node.animate(
                    [{opacity: 0, transform: 'translateY(-22px) scale(0.96)'}, {opacity: 1, transform: 'none'}],
                    {duration: 560, easing: FLIP_EASING},
                );
            }
        });
        prevRects.current = newRects;
    });
    return (
        <div className={`tree-level${nowrap ? ' tree-level-nowrap' : ''}`} ref={ref}>
            {ids.map(cid => {
                const child = nodeMap[cid];
                return (
                    <PersonCard
                        key={cid}
                        node={child}
                        variant="report"
                        directs={child.childIds.length}
                        total={totals[cid] || 0}
                        showAvatar={showAvatar}
                        expanded={cid === openChildId && child.childIds.length > 0}
                        onDrill={onToggle}
                        onOpen={onOpen}
                    />
                );
            })}
        </div>
    );
}

// Inline expand/collapse as a LEVEL STACK (Workday-style drill-down). Each level
// is a row of siblings; expanding one centers it (peers stay on the sides) and
// its direct reports appear as a NEW row beneath — never displacing the peers.
// Only the open path expands, so siblings are mutually exclusive.
function ExpandTree({focus, nodeMap, totals, showAvatar, openByParent, onToggle, onOpen}) {
    // Open path: the focus, then each open child down the chain.
    const path = [];
    const guard = new Set();
    let cur = focus;
    while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        path.push(cur);
        const oc = openByParent[cur.id];
        cur = (oc && nodeMap[oc] && cur.childIds.includes(oc)) ? nodeMap[oc] : null;
    }
    return (
        <div className="tree-stack">
            <div className="tree-level">
                <PersonCard
                    node={focus}
                    variant="focus"
                    directs={focus.childIds.length}
                    total={totals[focus.id] || 0}
                    showAvatar={showAvatar}
                    onDrill={onToggle}
                    onOpen={onOpen}
                />
            </div>
            {path.map(p => {
                if (p.childIds.length === 0) return null;
                const openChildId = openByParent[p.id];
                const ids = centerOrder(p.childIds, openChildId).filter(cid => nodeMap[cid]);
                if (ids.length === 0) return null;
                // A level that has an expanded child is laid out as a SINGLE row
                // (no wrap) so the expanded card sits directly above its reports;
                // a level with nothing expanded (the deepest) wraps to stay
                // compact. This keeps the drill path unambiguous.
                const hasOpenChild = !!(openChildId && nodeMap[openChildId]);
                // Stable key (p.id) so the section & its cards persist across
                // expansion changes — that persistence is what lets the cards
                // slide (FLIP) instead of remounting.
                return (
                    <div className="tree-section" key={p.id}>
                        <div className="connector-vertical" />
                        <TreeLevel
                            ids={ids}
                            nodeMap={nodeMap}
                            totals={totals}
                            showAvatar={showAvatar}
                            openChildId={openChildId}
                            nowrap={hasOpenChild}
                            onToggle={onToggle}
                            onOpen={onOpen}
                        />
                    </div>
                );
            })}
        </div>
    );
}

// A manager + their direct reports (used by the Manager filter view).
function ManagerSection({node, nodeMap, totals, showAvatar, onDrill, onOpen}) {
    const children = node.childIds.map(id => nodeMap[id]);
    return (
        <div className="manager-section">
            <PersonCard
                node={node}
                variant="focus"
                directs={node.childIds.length}
                total={totals[node.id] || 0}
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

// A flat group of positions under a header (used by the Organization and
// Location filter views).
function GroupSection({title, members, totals, showAvatar, onDrill, onOpen}) {
    return (
        <div className="manager-section">
            <div className="org-header">
                <span className="org-header-name">{title}</span>
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
                        showAvatar={showAvatar}
                        onDrill={onDrill}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}

// A set of selected values → one group per value (positions whose field equals
// it), each sorted managers-first then by name.
function groupsForValues(nodeMap, filterSet, pick) {
    return [...filterSet].sort((a, b) => a.localeCompare(b)).map(value => ({
        title: value,
        members: Object.values(nodeMap)
            .filter(n => (pick(n) || '').trim() === value)
            .sort((a, b) =>
                (b.childIds.length > 0) - (a.childIds.length > 0) ||
                a.displayName.localeCompare(b.displayName)),
    }));
}

// Distinct non-empty values of a node field → filter options with a count.
function distinctFieldOptions(nodeMap, pick) {
    const counts = new Map();
    Object.values(nodeMap).forEach(n => {
        const v = (pick(n) || '').trim();
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([v, c]) => ({value: v, label: v, sub: `${c} position${c !== 1 ? 's' : ''}`}));
}

// ─── Main Workday-style chart ─────────────────────────────────────────────────

function WorkdayChart({table}) {
    const records = useRecords(table);
    const [focusIdState, setFocusIdState] = useState(null);
    const [managerFilter, setManagerFilter] = useState(() => new Set());
    const [orgFilter, setOrgFilter] = useState(() => new Set());
    const [locationFilter, setLocationFilter] = useState(() => new Set());
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
            statusField: findFieldByName(table, FIELDS.statusField)
                || findFieldByName(table, 'Position Status'),
            locationField: findFieldByName(table, FIELDS.locationField)
                || findFieldByName(table, 'Location'),
            parentField,
            employeeIdField: findFieldByName(table, FIELDS.employeeIdField),
            managerIdField: findFieldByName(table, FIELDS.managerIdField),
            positionIdField: findFieldByName(table, FIELDS.positionIdField)
                || findFieldByName(table, 'Position ID'),
            managerPositionIdField: findFieldByName(table, FIELDS.managerPositionIdField),
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
    const orgOptions = useMemo(() => distinctFieldOptions(nodeMap, n => n.org), [nodeMap]);
    // Locations = distinct values of the location field, with a position count.
    const locationOptions = useMemo(() => distinctFieldOptions(nodeMap, n => n.location), [nodeMap]);

    // The Manager / Organization / Location filters are mutually exclusive —
    // selecting in one clears the others so the board shows a single view.
    const selectManagers = useCallback(next => {
        setManagerFilter(next);
        if (next.size) { setOrgFilter(new Set()); setLocationFilter(new Set()); }
    }, []);
    const selectOrgs = useCallback(next => {
        setOrgFilter(next);
        if (next.size) { setManagerFilter(new Set()); setLocationFilter(new Set()); }
    }, []);
    const selectLocations = useCallback(next => {
        setLocationFilter(next);
        if (next.size) { setManagerFilter(new Set()); setOrgFilter(new Set()); }
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
    const locationActive = locationFilter.size > 0;
    const filterActive = managerActive || orgActive || locationActive;
    const selectedManagers = useMemo(
        () => [...managerFilter].filter(id => nodeMap[id]),
        [managerFilter, nodeMap],
    );
    // A value filter (org or location) → the positions in each group.
    const selectedOrgs = useMemo(
        () => (orgActive ? groupsForValues(nodeMap, orgFilter, n => n.org) : []),
        [orgActive, orgFilter, nodeMap],
    );
    const selectedLocations = useMemo(
        () => (locationActive ? groupsForValues(nodeMap, locationFilter, n => n.location) : []),
        [locationActive, locationFilter, nodeMap],
    );

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
        const groups = orgActive ? selectedOrgs : locationActive ? selectedLocations : null;
        if (groups) {
            return groups.map(({title, members}) => ({
                kind: 'org',
                header: {name: title, count: members.length},
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
    }, [orgActive, selectedOrgs, locationActive, selectedLocations, managerActive, selectedManagers, focusId, nodeMap, totals]);

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
                    {cfg.locationField && (
                        <CheckboxFilter
                            label="Location"
                            options={locationOptions}
                            selected={locationFilter}
                            onChange={selectLocations}
                        />
                    )}
                    {filterActive && (
                        <button
                            className="tb-btn tb-btn-clear"
                            onClick={() => { setManagerFilter(new Set()); setOrgFilter(new Set()); setLocationFilter(new Set()); }}
                            title="Clear filters"
                        >
                            {orgActive
                                ? `Clear · ${selectedOrgs.length} org${selectedOrgs.length !== 1 ? 's' : ''}`
                                : locationActive
                                    ? `Clear · ${selectedLocations.length} location${selectedLocations.length !== 1 ? 's' : ''}`
                                    : `Clear · ${selectedManagers.length} manager${selectedManagers.length !== 1 ? 's' : ''}`}
                        </button>
                    )}
                    <SearchBox nodeMap={nodeMap} onJump={drillFromFilter} />
                </div>
                <div className="toolbar-right">
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
                    <ExportButton getData={buildExportData} />
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
                {(orgActive || locationActive) ? (
                    <div className="board board-filtered" ref={boardRef}>
                        {(orgActive ? selectedOrgs : selectedLocations).length === 0 && (
                            <div className="no-reports">No matching {orgActive ? 'organizations' : 'locations'}.</div>
                        )}
                        {(orgActive ? selectedOrgs : selectedLocations).map(({title, members}) => (
                            <GroupSection
                                key={title}
                                title={title}
                                members={members}
                                totals={totals}
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
                                    showAvatar={showAvatars}
                                    onDrill={drillFromFilter}
                                    onOpen={openRecord}
                                />
                            ))}
                    </div>
                ) : (
                    <div className="board board-expandable" ref={boardRef}>
                        {focus.parentId && nodeMap[focus.parentId] && (
                            <button
                                className="up-btn"
                                onClick={() => drill(focus.parentId)}
                                title={`Up to ${nodeMap[focus.parentId].displayName}`}
                            >
                                ↑ {nodeMap[focus.parentId].displayName}
                            </button>
                        )}

                        <ExpandTree
                            focus={focus}
                            nodeMap={nodeMap}
                            totals={totals}
                            showAvatar={showAvatars}
                            openByParent={openByParent}
                            onToggle={toggleExpand}
                            onOpen={openRecord}
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
