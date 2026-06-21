/**
 * populate-email-text.js — branching access via the parent→child hierarchy
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * For every position it writes into "[T] Email Text (Future Leaders)" the emails
 * of every LEADER in that position's management chain — INCLUDING the position
 * itself — by climbing the real parent→child relationship: a record's parent is
 * the record whose "Unique ID" equals this record's "[F] Manager ID" (the SAME
 * join the org-chart extension uses), then unioning in short-code matches.
 *
 * SOURCE OF TRUTH = the Employees & Positions table. Each manager (parent of ≥1
 * position) manages the set of supervisory orgs their DIRECT reports sit in. The
 * reconcile step makes the "Future Leaders list" reflect that:
 *   • if a leader's "Managing Organization" code doesn't match an org they
 *     actually manage → it is OVERWRITTEN with the real one from the table;
 *   • a manager who manages MORE THAN ONE org gets ONE ROW PER ORG (so short-code
 *     matching covers every org — e.g. a DOAD+DOAB manager gets a DOAD row and a
 *     DOAB row, and every report under either org receives their email);
 *   • a brand-new org row copies the manager's KNOWN email from their primary row
 *     (it only ever fills a BLANK email — it never overwrites a curated one).
 * Reconcile runs BEFORE the email-text write and the list is re-read in between,
 * so corrected orgs + copied emails take effect in a SINGLE run.
 *
 *   Hierarchy : parent(record) = the record whose "Unique ID" == record's
 *               "[F] Manager ID"  (tolerates "12345 - Title (Name)").
 *   Leaders   : "Future Leaders list" maps a Leader ID → Email, with a
 *               "Managing Organization" whose leading token is the short code.
 *   Output    : comma-separated leader emails written to the output field.
 *
 * Writes the output field, plus the leaders list's Status / Level / Managing
 * Organization, and (only on rows where it is BLANK) the copied Email. Safe to
 * re-run.
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
    // Organization" (e.g. "DOC Sensor & Cartridge Manufacturing" → DOC).
    leadersShortCodeField: 'Managing Organization',

    // Also stamp a leader's OWN email on their OWN seat (so they can see
    // themselves at the top of their branch). Set false for "reports only".
    includeSelf:       true,

    // RECONCILE the leaders list against the positions table (source of truth):
    // overwrite mismatched "Managing Organization" values and split a multi-org
    // manager into one row per org. Status / Level are (re)written too.
    flagMissingLeaders: true,
    posNameField:       '[E] First Name, Last Name',     // → Leader Name (optional)
    posOrgField:        '[F] Supervisory Organization',  // the org a report SITS in
    leadersNameField:   'Leader Name',
    leadersLevelField:  'Level',
    leadersStatusField: 'Status',
    statusMissing:      'Leader missing',
    statusMissingEmail: 'Leader missing email',
    statusUpdate:       'Leader update',                 // "Leader update (N direct reports)"
    statusNotLeader:    'Leader not marked as leader',   // on the list but manages nothing now
    // Copy the manager's known email into an ADDITIONAL org row (only fills a
    // BLANK email; never overwrites an existing/curated one).
    copyEmailToNewRows: true,

    // SHORT CODE drives access: every leader whose short code is a PREFIX of a
    // record's short code gets that record, listed TOP-FIRST.
    shortCodeField:    'Short Code (from [F] Supervisory Organization 🔗)',
    // 'always' = manager-ID chain FIRST (handles managers who run more than one
    // org), then UNION short-code leaders (fills gaps where the chain breaks at a
    // vacant manager). 'only' = short code only. 'empty' = chain, short code only
    // when the chain found nothing.
    shortCodeMode:     'always',

    // TEST MODE: when true, write ONLY each position's TOP-of-branch leader(s).
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

// ── Leaders: from the Future Leaders list — email + (its own) short code ─────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;

const emailByEmpId = {};            // Leader ID → email (mutated by reloadLeaders)
const leadersByCode = [];           // {code, email} (mutated by reloadLeaders)

// Rebuild emailByEmpId + leadersByCode IN PLACE from the current leaders list, so
// reconcile's writes are visible to the email-text write within the same run.
async function reloadLeaders() {
    const q = await leadersTable.selectRecordsAsync({
        fields: lCodeField ? [lEmpField, lMailField, lCodeField] : [lEmpField, lMailField],
    });
    for (const k of Object.keys(emailByEmpId)) delete emailByEmpId[k];
    leadersByCode.length = 0;
    const seen = new Set();
    for (const r of q.records) {
        const id = normKey(readText(r, lEmpField));
        const email = norm(readText(r, lMailField));
        if (id && email && !(id in emailByEmpId)) emailByEmpId[id] = email;
        const code = lCodeField ? parseCode(readText(r, lCodeField)) : '';
        if (email && code) {
            const key = code + '|' + normEmail(email);
            if (!seen.has(key)) { seen.add(key); leadersByCode.push({code, email}); }
        }
    }
    return q;
}

let leadersQ = await reloadLeaders();
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
const fName = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posNameField) : null;
const fOrg  = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posOrgField) : null;
const posFields = [fUid, fMgr, fEmp, fOut];
for (const f of [fCode, fName, fOrg]) if (f && !posFields.includes(f)) posFields.push(f);
const posQ = await posTable.selectRecordsAsync({fields: posFields});

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

const parentOf = r => {
    const raw = mgrRawByRec[r.id];
    if (!raw) return null;
    const p = recByUid[normKey(raw)] || recByUid[idKey(raw)] || null;
    return (p && p.id !== r.id) ? p : null;
};

// A record inherits every leader (from the Future Leaders list) whose short code
// is a PREFIX of the record's code. Shortest code = highest → top leaders first.
const shortCodeEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
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

// TEST: only the TOP-of-branch leader(s) — the prefix match(es) with the SHORTEST
// short code (highest in the org).
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

// Leader emails for the chain, ORDERED TOP-FIRST: the top leader, then the next
// one down, … to the position's direct manager (and the position itself last when
// includeSelf). Climb to the root, then reverse.
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

// ── Reconcile the leaders list to the positions table (SOURCE OF TRUTH) ──────
// Runs BEFORE the email-text write; the list is re-read afterward so the writes
// take effect this run.
let orgsOverwritten = 0, rowsCreated = 0, emailsCopied = 0, rowsFlagged = 0, rowsRefreshed = 0;
if (CONFIG.flagMissingLeaders) {
    const lLevelField  = fieldOrNull(leadersTable, CONFIG.leadersLevelField);
    const lStatusField = fieldOrNull(leadersTable, CONFIG.leadersStatusField);

    // Managed orgs per manager: the distinct supervisory-org CODES their direct
    // reports sit in (dedup by leading token), with a representative full string
    // and a per-(manager, code) direct-report count.
    const reportsByMidCode = {};   // mid → { code → count }
    const orgStrCount      = {};   // code → { fullString → count }
    const managerRecByMid  = {};   // mid → manager position record (for name / id)
    for (const r of posQ.records) {
        const m = parentOf(r);
        if (!m) continue;
        const mid = empKeyByRec[m.id];
        if (!mid) continue;
        if (!managerRecByMid[mid]) managerRecByMid[mid] = m;
        const orgStr = fOrg ? readText(r, fOrg) : '';
        const code = parseCode(orgStr);
        if (!code) continue;
        (reportsByMidCode[mid] = reportsByMidCode[mid] || {});
        reportsByMidCode[mid][code] = (reportsByMidCode[mid][code] || 0) + 1;
        (orgStrCount[code] = orgStrCount[code] || {});
        if (orgStr) orgStrCount[code][orgStr] = (orgStrCount[code][orgStr] || 0) + 1;
    }
    const orgStrByCode = {};   // code → most common full supervisory-org string
    for (const code of Object.keys(orgStrCount)) {
        orgStrByCode[code] = Object.keys(orgStrCount[code])
            .sort((a, b) => orgStrCount[code][b] - orgStrCount[code][a])[0] || code;
    }

    // Group the EXISTING leader rows by Leader ID.
    const rowsByMid = {};
    for (const r of leadersQ.records) {
        const mid = normKey(readText(r, lEmpField));
        if (!mid) continue;
        (rowsByMid[mid] = rowsByMid[mid] || []).push(r);
    }

    // Short-code subtree size, for leaders we can't resolve via the hierarchy.
    const allCodes = posQ.records.map(r => codeByRec[r.id]).filter(Boolean);
    const subtreeBelow = C => C ? allCodes.reduce((s, c) => (c.length > C.length && c.startsWith(C) ? s + 1 : s), 0) : 0;

    const toUpdate = [];
    const toAdd = [];
    const handledRowIds = new Set();

    // Build the fields for a row that should represent (mid, code).
    const buildFields = (mid, code, row) => {
        const direct   = reportsByMidCode[mid][code];
        const orgStr   = orgStrByCode[code] || code;
        const rowEmail = row ? norm(readText(row, lMailField)) : '';
        const known    = emailByEmpId[mid] || '';
        const fillEmail = (!rowEmail && known && CONFIG.copyEmailToNewRows) ? known : '';
        const finalEmail = rowEmail || fillEmail;
        const fields = {};
        if (lLevelField)  fields[CONFIG.leadersLevelField] = levelFor(code);
        if (lStatusField) {
            fields[CONFIG.leadersStatusField] = finalEmail
                ? `${CONFIG.statusUpdate} (${direct} direct report${direct !== 1 ? 's' : ''})`
                : (row ? CONFIG.statusMissingEmail : CONFIG.statusMissing);
        }
        return {fields, orgStr, fillEmail};
    };

    for (const mid of Object.keys(reportsByMidCode)) {
        const codes = Object.keys(reportsByMidCode[mid]);
        const existing = (rowsByMid[mid] || []).slice();

        // Map existing rows by their current code; spare rows become reuse fodder.
        const rowByCode = {};
        const spare = [];
        for (const row of existing) {
            const rc = lCodeField ? parseCode(readText(row, lCodeField)) : '';
            if (rc && !(rc in rowByCode)) rowByCode[rc] = row; else spare.push(row);
        }
        // Rows whose code isn't an org this manager actually manages → reuse fodder.
        for (const rc of Object.keys(rowByCode)) {
            if (!codes.includes(rc)) { spare.push(rowByCode[rc]); delete rowByCode[rc]; }
        }

        const nameStr = managerRecByMid[mid] && fName ? readText(managerRecByMid[mid], fName) : '';

        for (const code of codes) {
            if (rowByCode[code]) {
                // Correct row already exists → refresh Level/Status (+ fill blank email).
                const row = rowByCode[code];
                handledRowIds.add(row.id);
                const {fields, fillEmail} = buildFields(mid, code, row);
                if (fillEmail && lMailField) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toUpdate.push({id: row.id, fields});
                rowsRefreshed++;
            } else if (spare.length) {
                // OVERWRITE a mismatched/placeholder row with the real org.
                const row = spare.shift();
                handledRowIds.add(row.id);
                const {fields, orgStr, fillEmail} = buildFields(mid, code, row);
                if (CONFIG.leadersShortCodeField) fields[CONFIG.leadersShortCodeField] = orgStr;
                if (fName && nameStr) fields[CONFIG.leadersNameField] = nameStr;
                if (fillEmail && lMailField) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toUpdate.push({id: row.id, fields});
                orgsOverwritten++;
            } else {
                // CREATE a new row for this org (copy the manager's known email).
                const {fields, orgStr, fillEmail} = buildFields(mid, code, null);
                fields[CONFIG.leadersEmpIdField] = managerRecByMid[mid] ? readText(managerRecByMid[mid], fEmp) : mid;
                if (fName && nameStr) fields[CONFIG.leadersNameField] = nameStr;
                if (CONFIG.leadersShortCodeField) fields[CONFIG.leadersShortCodeField] = orgStr;
                if (fillEmail && lMailField) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toAdd.push({fields});
                rowsCreated++;
            }
        }

        // Leftover rows for this manager = orgs they no longer manage → flag only.
        for (const row of spare) {
            handledRowIds.add(row.id);
            if (lStatusField) { toUpdate.push({id: row.id, fields: {[CONFIG.leadersStatusField]: CONFIG.statusNotLeader}}); rowsFlagged++; }
        }
    }

    // Leader rows whose Leader ID never shows up as a manager in the table.
    for (const r of leadersQ.records) {
        if (handledRowIds.has(r.id)) continue;
        const mid = normKey(readText(r, lEmpField));
        const code = lCodeField ? parseCode(readText(r, lCodeField)) : '';
        const below = subtreeBelow(code);
        const fields = {};
        if (lLevelField && code) fields[CONFIG.leadersLevelField] = levelFor(code);
        if (lStatusField) {
            let status;
            if (mid && !(mid in emailByEmpId)) status = CONFIG.statusMissingEmail;
            else if (below > 0) status = `${CONFIG.statusUpdate} (${below} in org)`;
            else status = CONFIG.statusNotLeader;
            fields[CONFIG.leadersStatusField] = status;
        }
        if (Object.keys(fields).length) toUpdate.push({id: r.id, fields});
    }

    while (toUpdate.length > 0) { const b = toUpdate.splice(0, 50); await leadersTable.updateRecordsAsync(b); }
    while (toAdd.length > 0)    { const b = toAdd.splice(0, 50);    await leadersTable.createRecordsAsync(b); }

    // Re-read so the corrected orgs + copied emails drive the email-text write.
    leadersQ = await reloadLeaders();
}

// ── Write the output field for every position ───────────────────────────────
let filledByHierarchy = 0, filledByShortCode = 0, stillEmpty = 0;
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
            for (const e of shortCodeEmailsFor(r)) {
                const k = normEmail(e);
                if (!seen.has(k)) { seen.add(k); emails.push(e); }
            }
        } else if (!emails.length) {
            emails = shortCodeEmailsFor(r);
            via = emails.length ? 'shortcode' : null;
        }
    }

    // SELF: if this position's incumbent IS a leader, ensure their own email is on
    // their own seat — even when their position sits in a different org.
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
    `- ${filledByShortCode} via short code · ${filledByHierarchy} via hierarchy · **${stillEmpty} empty**\n` +
    `- leaders list (source of truth = positions): **${rowsCreated} row(s) created** · ` +
    `**${orgsOverwritten} org(s) overwritten** · ${rowsRefreshed} refreshed · ` +
    `${emailsCopied} email(s) copied · ${rowsFlagged} flagged "${CONFIG.statusNotLeader}"\n\n` +
    `### Positions per layer (short-code depth)\n` +
    layerLines.join('\n') + `\n\n` +
    `### Top leaders (top layer first) — employees in their subtree\n` +
    topLines.join('\n') +
    (leaderCounts.length > 25 ? `\n- … and ${leaderCounts.length - 25} more leaders` : ''),
);
