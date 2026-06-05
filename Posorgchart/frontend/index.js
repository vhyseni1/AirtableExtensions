import {
    initializeBlock,
    useBase,
    useRecords,
    expandRecord,
} from '@airtable/blocks/interface/ui';
import {useState, useRef, useEffect, useMemo, useCallback} from 'react';
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
const FIELDS = {
    tableName: 'Employees & Positions',
    primaryNameSource: '[E] First Name, Last Name',
    jobTitleField: 'REF Title [F]',
    departmentField: '[F] Supervisory Organization 🔗',
    statusField: null,
    parentLinkField: 'Future Manager',
    employeeIdField: '[E] Employee ID',
    managerIdField: '[F] Manager ID',
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

function sampleValue(records, field) {
    if (!field) return '';
    const cap = Math.min(records.length, 400);
    for (let i = 0; i < cap; i++) {
        const t = readText(records[i], field);
        if (t) return t;
    }
    return '';
}

// ─── Org model ────────────────────────────────────────────────────────────────

function buildOrg(records, cfg) {
    const {parentField, nameField, jobTitleField, departmentField, statusField,
        employeeIdField, managerIdField} = cfg;
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
            status: readText(r, statusField),
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

// managers: [{manager: card, reports: [card, ...]}]; each card is
// {name, title, dept, directs, total}. Each manager starts on a new page; the
// manager card repeats on top of each of its pages; footer reads "Page x / y".
function exportVectorPDF(managers) {
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
    // Manager header: spans two report columns, same height as a report card —
    // emphasized by the blue border/accent rather than by being oversized.
    const mgrW = Math.min(2 * cardW + colGap, availW);
    const mgrH = cardH;
    const gridTop = margin + mgrH + headerGap;
    const reportsAvailH = pageH - margin - footer - gridTop;
    const rowsPerPage = Math.max(1, Math.floor((reportsAvailH + rowGap) / (cardH + rowGap)));

    const pagesFor = m => {
        const rows = Math.ceil(m.reports.length / cols);
        return Math.max(1, Math.ceil(rows / rowsPerPage) || 1);
    };
    const totalPages = managers.reduce((s, m) => s + pagesFor(m), 0);

    let pageIndex = 0;
    managers.forEach(m => {
        const rowsTotal = Math.ceil(m.reports.length / cols);
        const nPages = pagesFor(m);
        for (let pg = 0; pg < nPages; pg++) {
            if (pageIndex > 0) pdf.addPage();
            // Manager card on top of every page for this manager.
            drawPersonCard(pdf, margin + (availW - mgrW) / 2, margin, mgrW, mgrH, m.manager, true);

            const startRow = pg * rowsPerPage;
            const endRow = Math.min(rowsTotal, startRow + rowsPerPage);
            for (let row = startRow; row < endRow; row++) {
                const y = gridTop + (row - startRow) * (cardH + rowGap);
                for (let c = 0; c < cols; c++) {
                    const idx = row * cols + c;
                    if (idx >= m.reports.length) break;
                    const x = margin + c * (cardW + colGap);
                    drawPersonCard(pdf, x, y, cardW, cardH, m.reports[idx], false);
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

function AboutModal({onClose}) {
    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} title="Close">×</button>
                <h2 className="modal-title">About this Org Chart</h2>
                <p className="modal-body">
                    A Workday-style org explorer built by PwC as a token of appreciation
                    for the trust and partnership Roche has placed in us — and for the
                    results we&rsquo;ve delivered together.
                </p>
                <p className="modal-contact">
                    Developed by the PwC team. Primary contact:{' '}
                    <strong>Valon Hyseni (PwC P&amp;O)</strong>.
                </p>
                <div className="modal-signoff">— PwC</div>
            </div>
        </div>
    );
}

function FieldsModal({table, cfg, records, onClose}) {
    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const mappings = [
        ['Name', FIELDS.primaryNameSource === 'name' ? '(primary field)' : FIELDS.primaryNameSource,
            FIELDS.primaryNameSource === 'name' ? {type: 'primary'} : cfg.nameField],
        ['Job title', FIELDS.jobTitleField, cfg.jobTitleField],
        ['Department', FIELDS.departmentField, cfg.departmentField],
        ['Status', FIELDS.statusField, cfg.statusField],
        ['Manager link', FIELDS.parentLinkField, cfg.parentField],
        ['Employee id', FIELDS.employeeIdField, cfg.employeeIdField],
        ['Manager id', FIELDS.managerIdField, cfg.managerIdField],
    ];

    const clip = s => (s.length > 60 ? s.slice(0, 60) + '…' : s);

    return (
        <div className="overlay" onClick={onClose}>
            <div className="modal fields-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} title="Close">×</button>
                <h2 className="modal-title">Field diagnostics</h2>

                <h3 className="fields-subtitle">Configured mappings</h3>
                <table className="fields-table">
                    <thead><tr><th>Role</th><th>Configured name</th><th>Resolved</th><th>Sample value</th></tr></thead>
                    <tbody>
                        {mappings.map(([role, configured, field]) => (
                            <tr key={role}>
                                <td>{role}</td>
                                <td className="fields-mono">{configured || <em>(none)</em>}</td>
                                <td>
                                    {!configured
                                        ? <span className="fields-muted">—</span>
                                        : field
                                            ? <span className="fields-ok">✓ {field.type || ''}</span>
                                            : <span className="fields-bad">✗ not found</span>}
                                </td>
                                <td className="fields-mono">{field && field.id ? clip(sampleValue(records, field)) : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h3 className="fields-subtitle">All fields in “{table.name}”</h3>
                <table className="fields-table">
                    <thead><tr><th>Field name</th><th>Type</th><th>Sample value</th></tr></thead>
                    <tbody>
                        {table.fields.map(f => (
                            <tr key={f.id}>
                                <td className="fields-mono">{f.name}</td>
                                <td>{f.type}</td>
                                <td className="fields-mono">{clip(sampleValue(records, f))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({node, variant, directs, total, statusColor, showAvatar, onDrill, onOpen}) {
    const drillable = variant === 'report' && directs > 0;
    const cls = ['person-card', `person-card-${variant}`, 'clickable'];
    if (!showAvatar) cls.push('no-avatar');
    if (node.vacant) cls.push('vacant');
    const onClick = variant === 'report' ? () => onDrill(node.id) : () => onOpen(node);
    const title = variant === 'report'
        ? `Drill into ${node.displayName}`
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
            {drillable && <div className="person-drill">▾</div>}
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

// ─── Main Workday-style chart ─────────────────────────────────────────────────

function WorkdayChart({table}) {
    const records = useRecords(table);
    const [focusIdState, setFocusIdState] = useState(null);
    const [managerFilter, setManagerFilter] = useState(() => new Set());
    const [showAvatars, setShowAvatars] = useState(true);
    const [showAbout, setShowAbout] = useState(false);
    const [showFields, setShowFields] = useState(false);
    const boardRef = useRef(null);

    const cfg = useMemo(() => {
        const nameField = FIELDS.primaryNameSource && FIELDS.primaryNameSource !== 'name'
            ? findFieldByName(table, FIELDS.primaryNameSource)
            : null;
        const parentField = FIELDS.parentLinkField
            ? findFieldByName(table, FIELDS.parentLinkField)
            : (table.fields.find(f => f.type === 'multipleRecordLinks') || null);
        return {
            nameField,
            jobTitleField: findFieldByName(table, FIELDS.jobTitleField),
            departmentField: findFieldByName(table, FIELDS.departmentField),
            statusField: findFieldByName(table, FIELDS.statusField),
            parentField,
            employeeIdField: findFieldByName(table, FIELDS.employeeIdField),
            managerIdField: findFieldByName(table, FIELDS.managerIdField),
        };
    }, [table]);
    const cfgKey = Object.values(cfg).map(f => (f ? f.id : '∅')).join('|');

    const {nodeMap, rootIds, totals} = useMemo(
        () => buildOrg(records, cfg),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, cfgKey],
    );

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
    // Clicking a card while a manager filter is active jumps to normal navigation.
    const drillFromFilter = useCallback(id => {
        setManagerFilter(new Set());
        setFocusIdState(id);
    }, []);
    const openRecord = useCallback(node => { if (node && node.record) expandRecord(node.record); }, []);

    const filterActive = managerFilter.size > 0;
    const selectedManagers = useMemo(
        () => [...managerFilter].filter(id => nodeMap[id]),
        [managerFilter, nodeMap],
    );

    // Build the data the vector PDF draws from: one entry per manager, each with
    // its direct reports. Filter view = the selected managers; otherwise the
    // currently focused person.
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
        const ids = filterActive
            ? [...selectedManagers].sort((a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName))
            : (focusId ? [focusId] : []);
        return ids.map(id => ({
            manager: toCard(nodeMap[id]),
            reports: nodeMap[id].childIds.map(c => toCard(nodeMap[c])),
        }));
    }, [filterActive, selectedManagers, focusId, nodeMap, totals]);

    if (!focus) {
        return (
            <div className="org-root">
                <div className="toolbar">
                    <span className="app-title">Org Chart</span>
                    <button className="tb-btn" onClick={() => setShowFields(true)}>Fields</button>
                </div>
                <div className="empty-state">
                    No people to display. Open <strong>Fields</strong> to check that the
                    name and manager fields resolved, or configure a table in the Data panel.
                </div>
                {showFields && <FieldsModal table={table} cfg={cfg} records={records} onClose={() => setShowFields(false)} />}
            </div>
        );
    }

    const children = focus.childIds.map(id => nodeMap[id]);

    return (
        <div className="org-root">
            {/* Toolbar */}
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="app-title">Org Chart</span>
                    <CheckboxFilter
                        label="Manager"
                        options={managerOptions}
                        selected={managerFilter}
                        onChange={setManagerFilter}
                    />
                    {filterActive && (
                        <button
                            className="tb-btn tb-btn-clear"
                            onClick={() => setManagerFilter(new Set())}
                            title="Clear manager filter"
                        >
                            Clear · {selectedManagers.length} manager{selectedManagers.length !== 1 ? 's' : ''}
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
                    <ExportMenu boardRef={boardRef} getData={buildExportData} />
                    <button className="tb-btn" onClick={() => setShowFields(true)} title="Field diagnostics">Fields</button>
                    <button className="tb-btn" onClick={() => setShowAbout(true)} title="About">About</button>
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
                {filterActive ? (
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

                        <div className="focus-row">
                            <PersonCard
                                node={focus}
                                variant="focus"
                                directs={focus.childIds.length}
                                total={totals[focus.id] || 0}
                                statusColor={focus.status ? statusColors[focus.status] : null}
                                showAvatar={showAvatars}
                                onDrill={drill}
                                onOpen={openRecord}
                            />
                        </div>

                        {children.length > 0 ? (
                            <>
                                <div className="connector-vertical" />
                                <div className="reports-label">
                                    {children.length} direct report{children.length !== 1 ? 's' : ''}
                                </div>
                                <div className="reports-grid">
                                    {children.map(child => (
                                        <PersonCard
                                            key={child.id}
                                            node={child}
                                            variant="report"
                                            directs={child.childIds.length}
                                            total={totals[child.id] || 0}
                                            statusColor={child.status ? statusColors[child.status] : null}
                                            showAvatar={showAvatars}
                                            onDrill={drill}
                                            onOpen={openRecord}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="no-reports">No direct reports</div>
                        )}
                    </div>
                )}
            </div>

            {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
            {showFields && <FieldsModal table={table} cfg={cfg} records={records} onClose={() => setShowFields(false)} />}
        </div>
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
