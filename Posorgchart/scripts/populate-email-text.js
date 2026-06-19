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
    managerIdField:    '[F] Manager ID 🔎',  // the parent's Unique ID (lookup)
    employeeIdField:   '[E] Employee ID',    // incumbent id, to match a leader
    outputField:       '[T] Email Text (Future Leaders)',  // comma-separated emails (output)

    leadersTable:      'Future Leaders list',
    leadersEmpIdField: 'Leader ID',
    leadersEmailField: 'Email',
    // The leader's short code lives as the LEADING token of "Managing
    // Organization" (e.g. "DOC Sensor & Cartridge Manufacturing" → DOC). The
    // script parses that leading code automatically.
    leadersShortCodeField: 'Managing Organization',

    // Also stamp a leader's OWN email on their OWN seat (so they can see
    // themselves at the top of their branch). Set false for "managers see
    // reports only".
    includeSelf:       true,

    // SHORT CODE drives access: every leader whose short code is a PREFIX of a
    // record's short code gets that record, listed TOP-FIRST (a "DOS" leader is
    // first on every DOS* record, then DOSN, then DOSNPT, …). This is reliable
    // even where the manager chain is broken/vacant.
    shortCodeField:    'Short Code (from [F] Supervisory Organization 🔗)',
    // 'only'   → use ONLY short codes (recommended; hierarchy only when a record
    //            has no short code)
    // 'empty'  → hierarchy first, short codes only when the chain found nothing
    // 'always' → hierarchy plus a UNION of short-code leaders
    shortCodeMode:     'only',

    // TEST MODE: when true, IGNORE everything above and write ONLY each
    // position's TOP-of-branch leader(s) — the leader(s) with the SHORTEST
    // prefix short code above the record (e.g. the "DOC" leader for any DOC*
    // record). Set back to false to restore the full chain behaviour.
    topLeadersOnly:    false,
};
// ─────────────────────────────────────────────────────────────────────────────

const norm      = s => String(s == null ? '' : s).normalize('NFKC').trim();
const normKey   = s => norm(s).toUpperCase();      // id matching (case-tolerant)
const normEmail = s => norm(s).toLowerCase();
const normCode  = s => norm(s).replace(/\s+/g, '').toUpperCase();  // short codes
// Leading code token of a string, e.g. "DOCAA Production Rotkreuz" → "DOCAA".
const parseCode = s => {
    const m = norm(s).match(/^[A-Za-z0-9]+/);
    return m ? m[0].toUpperCase() : '';
};

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

// ── Leaders: from the Future Leaders list — email + (its own) short code ─────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;
const leadersQ = await leadersTable.selectRecordsAsync({
    fields: lCodeField ? [lEmpField, lMailField, lCodeField] : [lEmpField, lMailField],
});

const emailByEmpId = {};            // Employee ID → email (for the hierarchy fallback)
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

// ── Positions: index by Unique ID; read manager pointer + employee id ───────
const posTable = base.getTable(CONFIG.posTable);
const fUid = posTable.getField(CONFIG.uniqueIdField);
const fMgr = posTable.getField(CONFIG.managerIdField);
const fEmp = posTable.getField(CONFIG.employeeIdField);
const fOut = posTable.getField(CONFIG.outputField);
const fCode = CONFIG.shortCodeField ? posTable.getField(CONFIG.shortCodeField) : null;
const posQ = await posTable.selectRecordsAsync({
    fields: fCode ? [fUid, fMgr, fEmp, fOut, fCode] : [fUid, fMgr, fEmp, fOut],
});

const recByUid     = {};   // unique-id key → record  (keyed by raw AND leading-number)
const mgrRawByRec  = {};   // record id → raw "[F] Manager ID 🔎" text
const empKeyByRec  = {};   // record id → employee-id key
const codeByRec    = {};   // record id → short code
for (const r of posQ.records) {
    const uidRaw = readText(r, fUid);
    for (const k of [normKey(uidRaw), idKey(uidRaw)]) {
        if (k && !(k in recByUid)) recByUid[k] = r;
    }
    mgrRawByRec[r.id] = readText(r, fMgr);
    empKeyByRec[r.id] = normKey(readText(r, fEmp));
    codeByRec[r.id]   = fCode ? normCode(readText(r, fCode)) : '';
}

// A record inherits every leader (from the Future Leaders list) whose short code
// is a PREFIX of the record's code.
const shortCodeEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    // shortest code = highest in the org → list top leaders first.
    const matches = leadersByCode
        .filter(L => code.startsWith(L.code))
        .sort((a, b) => a.code.length - b.code.length);
    const out = [];
    const seen = new Set();
    for (const L of matches) {
        const k = normEmail(L.email);
        if (!seen.has(k)) { seen.add(k); out.push(L.email); }
    }
    return out;
};

// TEST: only the TOP-of-branch leader(s) — among the prefix matches, the one(s)
// with the SHORTEST short code (highest in the org).
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

// Leader emails for the chain, ORDERED TOP-FIRST: the top leader, then the next
// one down, … all the way to the position's direct manager (and the position
// itself last when includeSelf). We climb from the record up to the root, then
// reverse so the top of the org comes first.
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
    out.reverse();   // top leader first → … → direct manager (→ self if included)
    return out;
}

// ── Write "[T] Email Text" for every position ───────────────────────────────
let filledByHierarchy = 0, filledByShortCode = 0, stillEmpty = 0;
const updates = posQ.records.map(r => {
    // TEST MODE: only the top-of-branch leader(s).
    if (CONFIG.topLeadersOnly) {
        const emails = topLeaderEmailsFor(r);
        if (emails.length > 0) filledByShortCode++; else stillEmpty++;
        return {id: r.id, fields: {[fOut.id]: emails.join(', ')}};
    }

    let emails, via;
    if (CONFIG.shortCodeMode === 'only') {
        // Short code is the source of truth (top-first). Fall back to the
        // hierarchy only for records that have no short code at all.
        emails = shortCodeEmailsFor(r);
        via = emails.length ? 'shortcode' : null;
        if (!emails.length) { emails = leaderEmailsFor(r); via = emails.length ? 'hierarchy' : null; }
    } else {
        emails = leaderEmailsFor(r);
        via = emails.length ? 'hierarchy' : null;
        if (CONFIG.shortCodeMode === 'always') {
            const seen = new Set(emails.map(normEmail));
            for (const e of shortCodeEmailsFor(r)) {
                const k = normEmail(e);
                if (!seen.has(k)) { seen.add(k); emails.push(e); }
            }
        } else if (!emails.length) {
            emails = shortCodeEmailsFor(r);   // fallback only when the chain found nothing
            via = emails.length ? 'shortcode' : null;
        }
    }

    if (via === 'hierarchy') filledByHierarchy++;
    else if (via === 'shortcode') filledByShortCode++;
    else stillEmpty++;

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

// Positions per layer = per short-code length (DOS = layer 3, DOSN = 4, …).
const perLayer = {};
for (const c of codes) perLayer[c.length] = (perLayer[c.length] || 0) + 1;
const layerLines = Object.keys(perLayer).map(Number).sort((a, b) => a - b)
    .map(len => `- **Layer ${len}**: ${perLayer[len]} position(s)`);

// Each leader and how many positions sit in their subtree (code prefix), TOP
// (shortest code) first.
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
