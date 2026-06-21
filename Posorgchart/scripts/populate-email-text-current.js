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

    // RECONCILE: write to the leaders list's Status/Level columns (NEVER Email).
    flagMissingLeaders: true,
    posNameField:       '[E] First Name, Last Name',     // → Leader Name (optional)
    posOrgField:        '[E] Supervisory Organization',  // → Managing Organization (optional)
    leadersNameField:   'Leader Name',
    leadersLevelField:  'Level',
    leadersStatusField: 'Status',
    statusMissing:      'Leader missing',
    statusMissingEmail: 'Leader missing email',
    statusUpdate:       'Leader update',
    statusNotLeader:    'Leader not marked as leader',
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
const fieldOrNull = (table, name) => { try { return name ? table.getField(name) : null; } catch (e) { return null; } };
// Level from a short code's length: 2→GOLT, 3→GOLT-1, 4→GOLT-2, 5+→Below Golt-2.
const levelFor = code => {
    const n = (code || '').length;
    if (n === 2) return 'GOLT';
    if (n === 3) return 'GOLT-1';
    if (n === 4) return 'GOLT-2';
    if (n >= 5) return 'Below Golt-2';
    return '';
};

// ── Leaders: from the Current Leaders List — email + (leading-token) code ────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;
const leadersQ = await leadersTable.selectRecordsAsync({
    fields: lCodeField ? [lEmpField, lMailField, lCodeField] : [lEmpField, lMailField],
});

const emailByEmpId = {};            // Employee/Leader ID → email (hierarchy fallback)
const leaderIdSet = new Set();      // every Leader ID already on the list
const leaderRecByEmpId = {};        // Leader ID → leaders-list record (to update Level/Status)
const leadersByCode = [];           // {code, email} from the leaders list itself
const seenLeaderCode = new Set();
for (const r of leadersQ.records) {
    const id = normKey(readText(r, lEmpField));
    const email = norm(readText(r, lMailField));
    if (id) { leaderIdSet.add(id); if (!leaderRecByEmpId[id]) leaderRecByEmpId[id] = r; }
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
const fName = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posNameField) : null;
const fOrg  = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posOrgField) : null;
const posFields = [fUid, fMgr, fEmp, fOut];
for (const f of [fCode, fName, fOrg]) if (f && !posFields.includes(f)) posFields.push(f);
const posQ = await posTable.selectRecordsAsync({fields: posFields});

const recByUid    = {};
const recByEmpId  = {};   // [E] Employee ID → record (current managers are referenced by employee id)
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
    if (empKeyByRec[r.id] && !(empKeyByRec[r.id] in recByEmpId)) recByEmpId[empKeyByRec[r.id]] = r;
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

// CURRENT hierarchy: "[E] Manager ID" is the MANAGER'S EMPLOYEE ID, so resolve
// the parent by matching it to a record's [E] Employee ID. Tolerates a formatted
// "276355 - Name" value by taking the leading number.
const mgrEmpIdOf = r => {
    const raw = mgrRawByRec[r.id] || '';
    const m = raw.match(/\d{3,}/);
    return m ? m[0] : normKey(raw);
};
const parentOf = r => {
    const mid = mgrEmpIdOf(r);
    const p = mid ? recByEmpId[mid] : null;
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

// ── Reconcile the leaders list (Status + Level columns; never Email) ─────────
let added = 0, updated = 0;
if (CONFIG.flagMissingLeaders) {
    const lLevelField  = fieldOrNull(leadersTable, CONFIG.leadersLevelField);
    const lStatusField = fieldOrNull(leadersTable, CONFIG.leadersStatusField);

    const reportsByEmpId = {};
    const managerRecByEmpId = {};
    for (const r of posQ.records) {
        const m = parentOf(r);
        if (!m) continue;
        const mid = empKeyByRec[m.id];
        if (!mid) continue;
        reportsByEmpId[mid] = (reportsByEmpId[mid] || 0) + 1;
        if (!managerRecByEmpId[mid]) managerRecByEmpId[mid] = m;
    }

    // Short-code subtree size: positions strictly BELOW a leader's code — the
    // reliable signal (same as the email branch) when the manager-pointer
    // hierarchy doesn't resolve.
    const allCodes = posQ.records.map(r => codeByRec[r.id]).filter(Boolean);
    const subtreeBelow = C => C ? allCodes.reduce((s, c) => (c.length > C.length && c.startsWith(C) ? s + 1 : s), 0) : 0;

    // 1) Update EXISTING leaders: Level + a situational Status. "Active" is
    //    decided by direct reports (hierarchy) OR a non-empty short-code subtree.
    const toUpdate = [];
    for (const r of leadersQ.records) {
        const mid = normKey(readText(r, lEmpField));
        const code = lCodeField ? parseCode(readText(r, lCodeField)) : '';
        const direct = mid ? (reportsByEmpId[mid] || 0) : 0;
        const below = subtreeBelow(code);
        const fields = {};
        if (lLevelField && code) fields[CONFIG.leadersLevelField] = levelFor(code);
        if (lStatusField) {
            let status;
            if (mid && !(mid in emailByEmpId)) status = CONFIG.statusMissingEmail;
            else if (direct > 0) status = `${CONFIG.statusUpdate} (${direct} direct report${direct !== 1 ? 's' : ''})`;
            else if (below > 0)  status = `${CONFIG.statusUpdate} (${below} in org)`;
            else status = CONFIG.statusNotLeader;
            fields[CONFIG.leadersStatusField] = status;
        }
        if (Object.keys(fields).length) toUpdate.push({id: r.id, fields});
    }

    // 2) ADD managers not on the list, Status = "Leader missing".
    const toAdd = [];
    for (const mid of Object.keys(managerRecByEmpId)) {
        if (leaderIdSet.has(mid)) continue;
        const m = managerRecByEmpId[mid];
        const fields = {[CONFIG.leadersEmpIdField]: readText(m, fEmp)};
        if (fName) fields[CONFIG.leadersNameField] = readText(m, fName);
        if (fOrg)  fields[CONFIG.leadersShortCodeField] = readText(m, fOrg);
        if (lLevelField)  fields[CONFIG.leadersLevelField]  = levelFor(codeByRec[m.id]);
        if (lStatusField) fields[CONFIG.leadersStatusField] = CONFIG.statusMissing;
        toAdd.push({fields});
    }

    while (toUpdate.length > 0) { const b = toUpdate.splice(0, 50); await leadersTable.updateRecordsAsync(b); updated += b.length; }
    while (toAdd.length > 0)    { const b = toAdd.splice(0, 50);    await leadersTable.createRecordsAsync(b); added += b.length; }
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
    `- ${filledByShortCode} via short code · ${filledByHierarchy} via hierarchy · **${stillEmpty} empty**\n` +
    `- leaders list: **${added} added** (Status "${CONFIG.statusMissing}") · **${updated} updated** (Level / "${CONFIG.statusMissingEmail}")\n\n` +
    `### Positions per layer (short-code depth)\n` +
    layerLines.join('\n') + `\n\n` +
    `### Top leaders (top layer first) — employees in their subtree\n` +
    topLines.join('\n') +
    (leaderCounts.length > 25 ? `\n- … and ${leaderCounts.length - 25} more leaders` : ''),
);
