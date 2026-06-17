/**
 * populate-email-text.js — branching access via the parent→child hierarchy
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * For every position it writes into "[T] Email Text" the emails of every LEADER
 * in that position's management chain — INCLUDING the position itself — by
 * climbing the real parent→child relationship: a record's parent is the record
 * whose "Unique ID" equals this record's "[F] Manager ID" (the SAME join the
 * org-chart extension uses).
 *
 * WHY THIS (vs. climbing by Employee ID): a VACANT or NEW manager has no
 * incumbent and therefore no employee id / email. Climbing by employee id
 * dead-ends there and the records beneath lose access to the leaders ABOVE the
 * vacant seat. Climbing by the hierarchy instead, a vacant manager still has a
 * Unique ID, so we walk straight THROUGH it and keep collecting the leaders
 * higher up — access is never lost beneath a vacant seat.
 *
 *   Hierarchy : parent(record) = the record whose "Unique ID" == record's
 *               "[F] Manager ID"  (tolerates "12345 - Title (Name)" — the
 *               leading number, or the whole value, is matched).
 *   Leaders   : "Future Leaders list" maps an Employee ID → Email. A position
 *               is a leader's seat when its "[E] Employee ID" is in that list;
 *               a vacant seat has none, so it contributes no email (but is still
 *               walked through).
 *   Output    : comma-separated leader emails written to "[T] Email Text".
 *
 * HOW TO RUN
 *   Extensions → add a "Scripting" extension → paste this in → set CONFIG to
 *   match your field names → Run. Re-run whenever the org or leaders change.
 *   Safe to re-run; it only writes "[T] Email Text".
 */

// ─── CONFIG — edit to match your base ────────────────────────────────────────
const CONFIG = {
    posTable:          'Employees & Positions',
    uniqueIdField:     'Unique ID',          // each record's own id
    managerIdField:    '[F] Manager ID',     // the parent's Unique ID
    employeeIdField:   '[E] Employee ID',    // incumbent id, to match a leader
    outputField:       '[T] Email Text',     // comma-separated emails (output)

    leadersTable:      'Future Leaders list',
    leadersEmpIdField: 'Employee ID',
    leadersEmailField: 'Email',

    // Also stamp a leader's OWN email on their OWN seat (so they can see
    // themselves at the top of their branch). Set false for "managers see
    // reports only".
    includeSelf:       true,
};
// ─────────────────────────────────────────────────────────────────────────────

const norm      = s => String(s == null ? '' : s).normalize('NFKC').trim();
const normKey   = s => norm(s).toUpperCase();      // id matching (case-tolerant)
const normEmail = s => norm(s).toLowerCase();

// Parent-id key: the first run of 3+ digits ("12345 - Title" → "12345"), else
// the whole normalized value. Mirrors the org-chart's matching.
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

// ── Leaders: Employee ID → email ────────────────────────────────────────────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const leadersQ = await leadersTable.selectRecordsAsync({fields: [lEmpField, lMailField]});

const emailByEmpId = {};
for (const r of leadersQ.records) {
    const id = normKey(readText(r, lEmpField));
    const email = norm(readText(r, lMailField));
    if (id && email && !(id in emailByEmpId)) emailByEmpId[id] = email;
}
output.text(`Loaded ${Object.keys(emailByEmpId).length} leader email(s) from "${CONFIG.leadersTable}".`);

// ── Positions: index by Unique ID; read manager pointer + employee id ───────
const posTable = base.getTable(CONFIG.posTable);
const fUid = posTable.getField(CONFIG.uniqueIdField);
const fMgr = posTable.getField(CONFIG.managerIdField);
const fEmp = posTable.getField(CONFIG.employeeIdField);
const fOut = posTable.getField(CONFIG.outputField);
const posQ = await posTable.selectRecordsAsync({fields: [fUid, fMgr, fEmp, fOut]});

const recByUid    = {};   // unique-id key → record  (keyed by raw AND leading-number)
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

// Leader emails for the chain starting at the record itself, climbing to the root.
function leaderEmailsFor(startRec) {
    const out = [];
    const seen = new Set();    // dedupe emails
    const guard = new Set();   // cycle guard on record ids
    let r = startRec;
    let isSelf = true;
    while (r && !guard.has(r.id)) {
        guard.add(r.id);
        if (!isSelf || CONFIG.includeSelf) {
            const email = emailByEmpId[empKeyByRec[r.id]];   // empty for vacant seats
            if (email) {
                const k = normEmail(email);
                if (!seen.has(k)) { seen.add(k); out.push(email); }
            }
        }
        isSelf = false;
        r = parentOf(r);   // climb the hierarchy — straight through vacant seats
    }
    return out;
}

// ── Write "[T] Email Text" for every position ───────────────────────────────
const updates = posQ.records.map(r => ({
    id: r.id,
    fields: {[fOut.id]: leaderEmailsFor(r).join(', ')},
}));

let written = 0;
while (updates.length > 0) {
    const batch = updates.splice(0, 50);
    await posTable.updateRecordsAsync(batch);
    written += batch.length;
}
output.text(`Updated "${CONFIG.outputField}" on ${written} position(s). Done.`);
