/**
 * populate-email-text-current.js — access for the EXISTING (current) manager
 * hierarchy. Identical logic to populate-email-text.js, but sourced from the
 * CURRENT leaders + the existing manager pointer, and written to a different
 * output field.
 *
 *   Leaders : "Current Leaders List" — each leader's code = the leading token of
 *             "Managing Organization" (e.g. "DOAEC Consumables Support (Walter
 *             Schroder) (50520170)" → DOAEC). Prefix-matched to each position's
 *             short code, top leaders first.
 *   Output  : "[T] Email Text (Current Leaders)".
 *
 * Writes ONLY the output field. Safe to re-run.
 */

// ─── CONFIG — edit to match your base ────────────────────────────────────────
const CONFIG = {
    posTable:          'Employees & Positions',
    uniqueIdField:     'Unique ID',          // each record's own id (child)
    managerIdField:    '[E] Manager ID',     // the EXISTING manager's id (parent)
    employeeIdField:   '[E] Employee ID',    // incumbent id (hierarchy fallback)
    outputField:       '[T] Email Text (Current Leaders)',
    // POSITION's current supervisory org; its LEADING token is the short code
    // (e.g. "DOAEC Consumables Support (…)" → DOAEC).
    shortCodeField:    '[E] Supervisory Organization',

    leadersTable:          'Current Leaders List',
    leadersEmpIdField:     'Leader ID',
    leadersEmailField:     'Email',
    leadersShortCodeField: 'Managing Organization',   // leader code = its leading token

    includeSelf:    true,
    shortCodeMode:  'only',   // 'only' (recommended) | 'empty' | 'always'
    topLeadersOnly: false,
};
// ─────────────────────────────────────────────────────────────────────────────

const norm      = s => String(s == null ? '' : s).normalize('NFKC').trim();
const normKey   = s => norm(s).toUpperCase();
const normEmail = s => norm(s).toLowerCase();
const normCode  = s => norm(s).replace(/\s+/g, '').toUpperCase();
// Leading code token, e.g. "DOAEC Consumables Support (…)" → "DOAEC".
const parseCode = s => {
    const m = norm(s).match(/^[A-Za-z0-9]+/);
    return m ? m[0].toUpperCase() : '';
};

function idKey(s) {
    const str = String(s == null ? '' : s);
    const m = str.match(/\d{3,}/);
    return m ? m[0] : normKey(str);
}
function readText(record, field) {
    let s = '';
    try { s = record.getCellValueAsString(field); } catch (e) { s = ''; }
    return (s || '').trim();
}

// ── Leaders: from the Current Leaders List — email + (leading-token) code ────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;
const leadersQ = await leadersTable.selectRecordsAsync({
    fields: lCodeField ? [lEmpField, lMailField, lCodeField] : [lEmpField, lMailField],
});

const emailByEmpId = {};            // Employee/Leader ID → email (hierarchy fallback)
const leadersByCode = [];           // {code, email} from the leaders list itself
const seenLeaderCode = new Set();
for (const r of leadersQ.records) {
    const id = normKey(readText(r, lEmpField));
    const email = norm(readText(r, lMailField));
    if (id && email && !(id in emailByEmpId)) emailByEmpId[id] = email;
    const code = lCodeField ? parseCode(readText(r, lCodeField)) : '';
    if (email && code) {
        const key = code + '|' + normEmail(email);
        if (!seenLeaderCode.has(key)) { seenLeaderCode.add(key); leadersByCode.push({code, email}); }
    }
}
output.text(
    `Loaded ${Object.keys(emailByEmpId).length} leader email(s); ` +
    `${leadersByCode.length} have a short code on "${CONFIG.leadersTable}".`,
);

// ── Positions ────────────────────────────────────────────────────────────────
const posTable = base.getTable(CONFIG.posTable);
const fUid = posTable.getField(CONFIG.uniqueIdField);
const fMgr = posTable.getField(CONFIG.managerIdField);
const fEmp = posTable.getField(CONFIG.employeeIdField);
const fOut = posTable.getField(CONFIG.outputField);
const fCode = CONFIG.shortCodeField ? posTable.getField(CONFIG.shortCodeField) : null;
const posQ = await posTable.selectRecordsAsync({
    fields: fCode ? [fUid, fMgr, fEmp, fOut, fCode] : [fUid, fMgr, fEmp, fOut],
});

const recByUid    = {};
const mgrRawByRec = {};
const empKeyByRec = {};
const codeByRec   = {};
for (const r of posQ.records) {
    const uidRaw = readText(r, fUid);
    for (const k of [normKey(uidRaw), idKey(uidRaw)]) {
        if (k && !(k in recByUid)) recByUid[k] = r;
    }
    mgrRawByRec[r.id] = readText(r, fMgr);
    empKeyByRec[r.id] = normKey(readText(r, fEmp));
    codeByRec[r.id]   = fCode ? parseCode(readText(r, fCode)) : '';   // leading token = code
}

// A position inherits every leader whose code is a PREFIX of its short code.
const shortCodeEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    const matches = leadersByCode
        .filter(L => code.startsWith(L.code))
        .sort((a, b) => a.code.length - b.code.length);   // top (shortest) first
    const out = [];
    const seen = new Set();
    for (const L of matches) {
        const k = normEmail(L.email);
        if (!seen.has(k)) { seen.add(k); out.push(L.email); }
    }
    return out;
};

const topLeaderEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    let minLen = Infinity;
    const matches = [];
    for (const L of leadersByCode) {
        if (code.startsWith(L.code)) {
            matches.push(L);
            if (L.code.length < minLen) minLen = L.code.length;
        }
    }
    const out = [];
    const seen = new Set();
    for (const L of matches) {
        if (L.code.length !== minLen) continue;
        const k = normEmail(L.email);
        if (!seen.has(k)) { seen.add(k); out.push(L.email); }
    }
    return out;
};

const parentOf = r => {
    const raw = mgrRawByRec[r.id];
    if (!raw) return null;
    const p = recByUid[normKey(raw)] || recByUid[idKey(raw)] || null;
    return (p && p.id !== r.id) ? p : null;
};
function leaderEmailsFor(startRec) {
    const out = [];
    const seen = new Set();
    const guard = new Set();
    let r = startRec;
    let isSelf = true;
    while (r && !guard.has(r.id)) {
        guard.add(r.id);
        if (!isSelf || CONFIG.includeSelf) {
            const email = emailByEmpId[empKeyByRec[r.id]];
            if (email) { const k = normEmail(email); if (!seen.has(k)) { seen.add(k); out.push(email); } }
        }
        isSelf = false;
        r = parentOf(r);
    }
    out.reverse();   // top first → … → direct manager
    return out;
}

// ── Write ─────────────────────────────────────────────────────────────────────
let filledByShortCode = 0, filledByHierarchy = 0, stillEmpty = 0;
const updates = posQ.records.map(r => {
    if (CONFIG.topLeadersOnly) {
        const emails = topLeaderEmailsFor(r);
        if (emails.length > 0) filledByShortCode++; else stillEmpty++;
        return {id: r.id, fields: {[fOut.id]: emails.join(', ')}};
    }

    let emails, via;
    if (CONFIG.shortCodeMode === 'only') {
        emails = shortCodeEmailsFor(r);
        via = emails.length ? 'shortcode' : null;
        if (!emails.length) { emails = leaderEmailsFor(r); via = emails.length ? 'hierarchy' : null; }
    } else {
        emails = leaderEmailsFor(r);
        via = emails.length ? 'hierarchy' : null;
        if (CONFIG.shortCodeMode === 'always') {
            const seen = new Set(emails.map(normEmail));
            for (const e of shortCodeEmailsFor(r)) { const k = normEmail(e); if (!seen.has(k)) { seen.add(k); emails.push(e); } }
        } else if (!emails.length) { emails = shortCodeEmailsFor(r); via = emails.length ? 'shortcode' : null; }
    }

    // SELF: if this position's incumbent IS a leader (its [E] Employee ID matches
    // a Leader ID), ensure their own email is on their own seat.
    if (CONFIG.includeSelf) {
        const self = emailByEmpId[empKeyByRec[r.id]];
        if (self && !emails.some(e => normEmail(e) === normEmail(self))) emails.push(self);
    }

    if (emails.length === 0) stillEmpty++;
    else if (via === 'hierarchy') filledByHierarchy++;
    else filledByShortCode++;

    return {id: r.id, fields: {[fOut.id]: emails.join(', ')}};
});

let written = 0;
while (updates.length > 0) {
    const batch = updates.splice(0, 50);
    await posTable.updateRecordsAsync(batch);
    written += batch.length;
}

// ── Summary: layers (by short-code depth) and employees per layer ────────────
const codes = posQ.records.map(r => codeByRec[r.id]).filter(Boolean);
const perLayer = {};
for (const c of codes) perLayer[c.length] = (perLayer[c.length] || 0) + 1;
const layerLines = Object.keys(perLayer).map(Number).sort((a, b) => a - b)
    .map(len => `- **Layer ${len}**: ${perLayer[len]} position(s)`);

const leaderCounts = leadersByCode.map(L => ({
    code: L.code,
    email: L.email,
    n: codes.reduce((s, c) => s + (c.startsWith(L.code) ? 1 : 0), 0),
})).sort((a, b) => a.code.length - b.code.length || b.n - a.n);
const topLines = leaderCounts.slice(0, 25)
    .map(L => `- \`${L.code}\` (layer ${L.code.length}) — ${L.email} — **${L.n}** position(s)`);

output.markdown(
    `### Updated "${CONFIG.outputField}" on ${written} position(s)\n` +
    `- ${filledByShortCode} via short code · ${filledByHierarchy} via hierarchy · **${stillEmpty} empty**\n\n` +
    `### Positions per layer (short-code depth)\n` +
    layerLines.join('\n') + `\n\n` +
    `### Top leaders (top layer first) — employees in their subtree\n` +
    topLines.join('\n') +
    (leaderCounts.length > 25 ? `\n- … and ${leaderCounts.length - 25} more leaders` : ''),
);
