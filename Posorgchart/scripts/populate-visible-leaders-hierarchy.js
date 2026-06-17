/**
 * populate-visible-leaders-hierarchy.js
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * Builds the "Visible to leaders" MULTIPLE COLLABORATORS field by climbing the
 * real parent→child hierarchy (Unique ID ↔ [F] Manager ID) — the SAME join the
 * org-chart uses — instead of short-code prefixes. For every position it
 * collects the leaders from the position itself up to the root and writes them
 * as collaborators; that field is what powers enforced row-level security on a
 * native interface element filtered by `Visible to leaders = current user`, and
 * the org-chart extension's own per-leader scoping.
 *
 * WHY THE HIERARCHY (vs. short codes / employee ids): a VACANT or NEW manager
 * has no incumbent — no employee id, no email, sometimes no code. Walking the
 * hierarchy, that seat still has a Unique ID, so we pass straight THROUGH it and
 * keep collecting the real leaders ABOVE it. Records beneath a vacant manager
 * therefore never lose access to the leaders higher up.
 *
 * HOW TO RUN
 *   Extensions → add a "Scripting" extension → paste this in → set CONFIG to
 *   match your field names → ensure "Visible to leaders" is a Multiple
 *   collaborators field and every leader is a base collaborator → Run.
 *   Safe to re-run; it only writes the collaborator field.
 *
 * NOTE: collaborator cells are set by user id; leaders are matched to base
 * collaborators by email (case-insensitive). Leader emails that are not base
 * collaborators are reported and skipped.
 */

// ─── CONFIG — edit to match your base ────────────────────────────────────────
const CONFIG = {
    posTable:            'Employees & Positions',
    uniqueIdField:       'Unique ID',          // each record's own id
    managerIdField:      '[F] Manager ID 🔎',  // the parent's Unique ID (lookup)
    employeeIdField:     '[E] Employee ID',    // incumbent id, to match a leader
    visibleLeadersField: 'Visible to leaders', // Multiple collaborators (output)

    leadersTable:        'Future Leaders list',
    leadersEmpIdField:   'Employee ID',
    leadersEmailField:   'Email',

    // Also grant a leader access to their OWN seat (so they see themselves at
    // the top of their branch). Set false for "managers see reports only".
    includeSelf:         true,
};
// ─────────────────────────────────────────────────────────────────────────────

const norm      = s => String(s == null ? '' : s).normalize('NFKC').trim();
const normKey   = s => norm(s).toUpperCase();
const normEmail = s => norm(s).toLowerCase();

// Parent-id key: first run of 3+ digits ("12345 - Title" → "12345"), else the
// whole normalized value. Mirrors the org-chart's matching.
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

// email → userId for everyone who can be assigned (base collaborators).
const userIdByEmail = {};
for (const c of base.activeCollaborators) {
    if (c.email) userIdByEmail[normEmail(c.email)] = c.id;
}

// ── Leaders: Employee ID → email ────────────────────────────────────────────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const leadersQ = await leadersTable.selectRecordsAsync({fields: [lEmpField, lMailField]});

const emailByEmpId = {};
for (const r of leadersQ.records) {
    const id = normKey(readText(r, lEmpField));
    const email = normEmail(readText(r, lMailField));
    if (id && email && !(id in emailByEmpId)) emailByEmpId[id] = email;
}
output.text(`Loaded ${Object.keys(emailByEmpId).length} leader email(s) from "${CONFIG.leadersTable}".`);

// ── Positions: index by Unique ID; read manager pointer + employee id ───────
const posTable = base.getTable(CONFIG.posTable);
const fUid = posTable.getField(CONFIG.uniqueIdField);
const fMgr = posTable.getField(CONFIG.managerIdField);
const fEmp = posTable.getField(CONFIG.employeeIdField);
const fOut = posTable.getField(CONFIG.visibleLeadersField);
const posQ = await posTable.selectRecordsAsync({fields: [fUid, fMgr, fEmp, fOut]});

const recByUid    = {};   // unique-id key → record (keyed by raw AND leading-number)
const mgrRawByRec = {};   // record id → raw "[F] Manager ID" text
const empKeyByRec = {};   // record id → employee-id key
for (const r of posQ.records) {
    const uidRaw = readText(r, fUid);
    for (const k of [normKey(uidRaw), idKey(uidRaw)]) {
        if (k && !(k in recByUid)) recByUid[k] = r;
    }
    mgrRawByRec[r.id] = readText(r, fMgr);
    empKeyByRec[r.id] = normKey(readText(r, fEmp));
}

const parentOf = r => {
    const raw = mgrRawByRec[r.id];
    if (!raw) return null;
    const p = recByUid[normKey(raw)] || recByUid[idKey(raw)] || null;
    return (p && p.id !== r.id) ? p : null;
};

// Leader emails for the chain from the record itself up to the root.
function leaderEmailsFor(startRec) {
    const out = [];
    const seen = new Set();
    const guard = new Set();
    let r = startRec;
    let isSelf = true;
    while (r && !guard.has(r.id)) {
        guard.add(r.id);
        if (!isSelf || CONFIG.includeSelf) {
            const email = emailByEmpId[empKeyByRec[r.id]];   // empty for vacant seats
            if (email && !seen.has(email)) { seen.add(email); out.push(email); }
        }
        isSelf = false;
        r = parentOf(r);   // climb the hierarchy — straight through vacant seats
    }
    return out;
}

// ── Build collaborator cells; report leaders without a base account ──────────
const missingCollaborators = new Set();
const updates = posQ.records.map(r => {
    const userIds = new Set();
    for (const email of leaderEmailsFor(r)) {
        const uid = userIdByEmail[email];
        if (uid) userIds.add(uid);
        else missingCollaborators.add(email);
    }
    return {id: r.id, fields: {[fOut.id]: [...userIds].map(id => ({id}))}};
});

if (missingCollaborators.size > 0) {
    output.markdown(
        `⚠️ **${missingCollaborators.size} leader email(s) are not base collaborators** and were skipped:\n\n` +
        [...missingCollaborators].map(e => `- ${e}`).join('\n'),
    );
}

// ── Write (Airtable caps batch writes at 50) ────────────────────────────────
let written = 0;
while (updates.length > 0) {
    const batch = updates.splice(0, 50);
    await posTable.updateRecordsAsync(batch);
    written += batch.length;
}
output.text(`Updated "${CONFIG.visibleLeadersField}" on ${written} position(s). Done.`);
