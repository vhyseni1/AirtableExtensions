// Field-reading helpers shared by every view.
//
// The Interface SDK is strict about missing fields (getCellValue throws), and
// linked-record / lookup cells come back in a handful of shapes. Everything in
// here is defensive: an unresolvable field or an odd cell shape yields an empty
// value rather than an exception.

// Read a field as text. Falls back to getCellValue for linked-record / lookup
// fields whose getCellValueAsString can come back empty in the interface SDK.
export function readText(record, field) {
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

// Read a field as a number. Non-numeric or missing values read as 0.
export function readNumber(record, field) {
    if (!field) return 0;
    let v;
    try { v = record.getCellValue(field); } catch { return 0; }
    if (v == null) {
        const s = readText(record, field);
        const parsed = parseFloat(s);
        return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
        return v.reduce((sum, item) => {
            if (typeof item === 'number') return sum + item;
            if (item && typeof item.value === 'number') return sum + item.value;
            return sum;
        }, 0);
    }
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
}

export function normName(s) {
    return String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
}

// Normalize a hierarchical short code for prefix matching (e.g. "dsg a" → "DSGA").
export function normCode(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

// Emails of every collaborator in a multipleCollaborators cell (lowercased).
export function readCollaboratorEmails(record, field) {
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
export function findFieldByName(table, name) {
    if (!table || !name) return null;
    const exact = typeof table.getFieldByNameIfExists === 'function'
        ? table.getFieldByNameIfExists(name)
        : table.fields.find(f => f.name === name);
    if (exact) return exact;
    const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(name);
    if (!target) return null;
    return table.fields.find(f => norm(f.name) === target) || null;
}

// Resolve a table by name, falling back to the first table in the base.
export function findTable(base, name) {
    if (!base) return null;
    if (name) {
        const named = typeof base.getTableByNameIfExists === 'function'
            ? base.getTableByNameIfExists(name)
            : base.tables.find(t => t.name === name);
        if (named) return named;
        const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const target = norm(name);
        const loose = base.tables.find(t => norm(t.name) === target);
        if (loose) return loose;
    }
    return base.tables[0] || null;
}

// Candidate manager references from a cell. Handles linked-record fields (ids)
// and lookups (linkedRecordId and/or the looked-up manager name).
export function extractParentRef(record, parentField) {
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

// Map a single-select field's choices to their native Airtable colours, so a
// chip rendered by the extension matches the swatch shown in the grid.
export function selectChoiceStyles(field, colorUtils) {
    const styles = {};
    const choices = field && field.options && field.options.choices;
    if (!Array.isArray(choices)) return styles;
    choices.forEach(c => {
        if (!c || !c.name) return;
        const hex = c.color ? colorUtils.getHexForColor(c.color) : null;
        if (!hex) return;
        styles[normName(c.name)] = {
            bg: hex,
            fg: colorUtils.shouldUseLightTextOnColor(c.color) ? '#ffffff' : '#1f2937',
        };
    });
    return styles;
}

// ─── Presentation helpers ────────────────────────────────────────────────────

const AVATAR_COLORS = [
    '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
    '#d97706', '#16a34a', '#0891b2', '#4f46e5', '#0d9488',
];

export function colorFromString(s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const CHART_PALETTE = [
    '#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#f59e0b',
    '#db2777', '#dc2626', '#0d9488', '#4f46e5', '#ea580c',
    '#65a30d', '#9333ea',
];
