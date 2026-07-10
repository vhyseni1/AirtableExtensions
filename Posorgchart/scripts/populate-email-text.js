/**
 * populate-email-text.js — FUTURE branching access (employee-id based)
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * For every position it writes into "[T] Email Text (Future Leaders)" the emails
 * of every LEADER in that position's management chain — INCLUDING the position
 * itself — by climbing the manager pointer and matching each manager to the
 * Future Leaders list by EMPLOYEE ID.
 *
 * MANAGER POINTER = "[E] Managers Employee ID (for branching Org View)": the
 * manager's employee id (e.g. 30111926), which matches the leaders list's
 * "Leader ID" directly. We climb by resolving that id to the manager's own seat
 * ([E] Employee ID) and reading ITS manager pointer, and so on up the chain.
 *
 * SOURCE OF TRUTH = the Employees & Positions table. Each manager (referenced by
 * ≥1 report) manages the supervisory orgs their direct reports sit in. Reconcile:
 *   • overwrite a leader's "Managing Organization" when its code doesn't match an
 *     org they actually manage;
 *   • a manager who manages MORE THAN ONE org gets ONE ROW PER ORG;
 *   • a brand-new org row copies the manager's KNOWN email from their other row
 *     (only ever fills a BLANK email — never overwrites a curated one).
 * Reconcile runs BEFORE the email-text write and the list is re-read in between,
 * so corrected orgs + copied emails take effect in a SINGLE run.
 *
 * Writes the output field, plus the leaders list's Status / Level / Managing
 * Organization, and (only on rows where it is BLANK) the copied Email. Safe to
 * re-run.
 */

// ─── CONFIG — edit to match your base ────────────────────────────────────────
const CONFIG = {
    posTable:          'Employees & Positions',
    // Manager pointer: the MANAGER's employee id, matched to Leader ID directly.
    // (Resolved emoji/spacing-tolerantly.)
    managerIdField:    '[E] Managers Employee ID (for branching Org View)',
    employeeIdField:   '[E] Employee ID',    // a position's OWN incumbent id (to climb)
    outputField:       '[T] Email Text (Future Leaders)',  // comma-separated emails (output)

    leadersTable:      'Future Leaders list',
    leadersEmpIdField: 'Leader ID',
    leadersNameField:  'Leader Name',
    leadersEmailField: 'Email',
    // The leader's short code = the LEADING token of "Managing Organization".
    leadersShortCodeField: 'Managing Organization',

    // Also stamp a leader's OWN email on their OWN seat (so they see themselves).
    includeSelf:       true,

    // RECONCILE the leaders list against the positions table (source of truth):
    // overwrite mismatched "Managing Organization" values and split a multi-org
    // manager into one row per org. Status / Level are (re)written too.
    flagMissingLeaders: true,
    posNameField:       '[F] First Name, Last Name',     // → Leader Name on new rows (optional)
    posOrgField:        '[F] Supervisory Organization',  // the org a report SITS in
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
    // 'always' = manager-id chain FIRST, then UNION short-code leaders. 'only' =
    // short code only. 'empty' = chain, short code only when the chain found none.
    shortCodeMode:     'always',

    // EMAIL-TEXT SCOPE: write ONLY each position's GOLT + GOLT-1 leaders — i.e.
    // leaders whose short code is a PREFIX of the position's code AND whose code
    // length is in this set (3 = GOLT, 4 = GOLT-1). Set null/[] to disable and
    // fall back to the full management chain + short-code union.
    emailCodeLengths:  [3, 4],

    // TEST MODE: when true, write ONLY each position's TOP-of-branch leader(s).
    topLeadersOnly:    false,
};
// ─────────────────────────────────────────────────────────────────────────────

const norm      = s => String(s == null ? '' : s).normalize('NFKC').trim();
const normKey   = s => norm(s).toUpperCase();
const normEmail = s => norm(s).toLowerCase();
const normCode  = s => norm(s).replace(/\s+/g, '').toUpperCase();
// Leading code token, e.g. "DOCAA Production Rotkreuz" → "DOCAA".
const parseCode = s => {
    const m = norm(s).match(/^[A-Za-z0-9]+/);
    return m ? m[0].toUpperCase() : '';
};
// Employee-id key: the first run of 3+ digits ("276355 - Name" → "276355"), else
// the whole normalized value.
const empId = s => {
    const str = String(s == null ? '' : s);
    const m = str.match(/\d{3,}/);
    return m ? m[0] : normKey(str);
};

function readText(record, field) {
    let s = '';
    try { s = record.getCellValueAsString(field); } catch (e) { s = ''; }
    return (s || '').trim();
}
const fieldOrNull = (table, name) => { try { return name ? table.getField(name) : null; } catch (e) { return null; } };
const normName = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
// Resolve a field by exact name, then emoji/space-tolerant normalized name, then a
// predicate — so a field survives icon characters / spacing in its name.
function resolveField(table, candidates, predicate) {
    for (const c of candidates) { if (!c) continue; try { return table.getField(c); } catch (e) { /* next */ } }
    const wanted = candidates.filter(Boolean).map(normName);
    for (const f of table.fields) if (wanted.includes(normName(f.name))) return f;
    if (predicate) for (const f of table.fields) if (predicate(f)) return f;
    throw new Error(`No field matching "${candidates[0]}" on "${table.name}"`);
}
const resolveOrNull = (table, candidates, predicate) => { try { return resolveField(table, candidates, predicate); } catch (e) { return null; } };
// Level from a short code's length: 2→GOLT, 3→GOLT-1, 4→GOLT-2, 5+→Below Golt-2.
const levelFor = code => {
    const n = (code || '').length;
    if (n === 2) return 'GOLT';
    if (n === 3) return 'GOLT-1';
    if (n === 4) return 'GOLT-2';
    if (n >= 5) return 'Below Golt-2';
    return '';
};

// ── Leaders: Leader ID → email, plus (code,email) for short-code matching ────
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lNameField = leadersTable.getField(CONFIG.leadersNameField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;

const emailByEmpId = {};   // Leader ID → email (mutated by reload)
const leadersByCode = [];  // {code, email} (mutated by reload)

async function reloadLeaders() {
    const fields = [lEmpField, lNameField, lMailField];
    if (lCodeField) fields.push(lCodeField);
    const q = await leadersTable.selectRecordsAsync({fields});
    for (const k of Object.keys(emailByEmpId)) delete emailByEmpId[k];
    leadersByCode.length = 0;
    const seen = new Set();
    for (const r of q.records) {
        const id = empId(readText(r, lEmpField));
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
    `Loaded ${Object.keys(emailByEmpId).length} leader email(s) by id; ` +
    `${leadersByCode.length} have a short code on "${CONFIG.leadersTable}".`,
);

// ── Positions: index by employee id; read the manager pointer ───────────────
const posTable = base.getTable(CONFIG.posTable);
const fMgr = resolveField(posTable, [
    CONFIG.managerIdField,
    '[E] Managers Employee ID (for branching Org View)',
    '[E] Manager ID',
], f => { const n = normName(f.name); return n.includes('managersemployeeid') || n.includes('managerid'); });
const fEmp = posTable.getField(CONFIG.employeeIdField);
const fOut = posTable.getField(CONFIG.outputField);
const fCode = CONFIG.shortCodeField ? posTable.getField(CONFIG.shortCodeField) : null;
const fName = CONFIG.flagMissingLeaders
    ? resolveOrNull(posTable, [CONFIG.posNameField, '[F] First Name, Last Name', '[E] First Name, Last Name'],
        f => normName(f.name).includes('firstname'))
    : null;
const fOrg  = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posOrgField) : null;
const posFields = [fMgr, fEmp, fOut];
for (const f of [fCode, fName, fOrg]) if (f && !posFields.includes(f)) posFields.push(f);
const posQ = await posTable.selectRecordsAsync({fields: posFields});

const recByEmpId   = {};   // own [E] Employee ID → record (to climb)
const mgrRawByRec  = {};   // record id → raw manager-pointer text
const empKeyByRec  = {};   // record id → own employee-id key
const codeByRec    = {};   // record id → short code
for (const r of posQ.records) {
    mgrRawByRec[r.id] = readText(r, fMgr);
    empKeyByRec[r.id] = empId(readText(r, fEmp));
    if (empKeyByRec[r.id] && !(empKeyByRec[r.id] in recByEmpId)) recByEmpId[empKeyByRec[r.id]] = r;
    codeByRec[r.id]   = fCode ? normCode(readText(r, fCode)) : '';
}

// A position's manager = its "[E] Managers Employee ID …" value.
const mgrEmpIdOf = r => empId(mgrRawByRec[r.id]);
const parentOf = r => {
    const mid = mgrEmpIdOf(r);
    const p = mid ? recByEmpId[mid] : null;
    return (p && p.id !== r.id) ? p : null;
};

// Short-code leaders whose code is a PREFIX of this record's code, top-first.
const shortCodeEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    const matches = leadersByCode
        .filter(L => code.startsWith(L.code))
        .sort((a, b) => a.code.length - b.code.length);
    const out = [];
    const seen = new Set();
    for (const L of matches) { const k = normEmail(L.email); if (!seen.has(k)) { seen.add(k); out.push(L.email); } }
    return out;
};

// GOLT + GOLT-1 leaders for a record: prefix-matching leaders whose code length
// is in CONFIG.emailCodeLengths (3 = GOLT, 4 = GOLT-1), top-first.
const allowedCodeLens = new Set(CONFIG.emailCodeLengths || []);
const goltEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    const matches = leadersByCode
        .filter(L => allowedCodeLens.has(L.code.length) && code.startsWith(L.code))
        .sort((a, b) => a.code.length - b.code.length);
    const out = [];
    const seen = new Set();
    for (const L of matches) { const k = normEmail(L.email); if (!seen.has(k)) { seen.add(k); out.push(L.email); } }
    return out;
};

// TEST: only the TOP-of-branch leader(s) — the shortest prefix code.
const topLeaderEmailsFor = r => {
    const code = codeByRec[r.id];
    if (!code) return [];
    let minLen = Infinity;
    const matches = [];
    for (const L of leadersByCode) {
        if (code.startsWith(L.code)) { matches.push(L); if (L.code.length < minLen) minLen = L.code.length; }
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

// Leader emails for the chain, TOP-FIRST: climb the manager pointer and at each
// seat take the incumbent's email if they're a leader (Leader ID match).
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
        r = parentOf(r);   // climb via the manager employee id
    }
    out.reverse();   // top leader first → … → direct manager (→ self last)
    return out;
}

// ── Reconcile the leaders list to the positions table (SOURCE OF TRUTH) ──────
// Managers are identified by EMPLOYEE ID (manager pointer → Leader ID). Runs
// BEFORE the email-text write; the list is re-read afterward so writes apply now.
let orgsOverwritten = 0, rowsCreated = 0, emailsCopied = 0, rowsFlagged = 0, rowsRefreshed = 0;
if (CONFIG.flagMissingLeaders) {
    const lLevelField  = fieldOrNull(leadersTable, CONFIG.leadersLevelField);
    const lStatusField = fieldOrNull(leadersTable, CONFIG.leadersStatusField);

    // Managed orgs per MANAGER EMPLOYEE ID: distinct supervisory-org codes their
    // direct reports sit in, with a representative full string + per-(mid,code)
    // count, and the manager's own record (for name on new rows).
    const reportsByMidCode = {};   // mid → { code → count }
    const managerRecByMid  = {};   // mid → manager position record
    const orgStrCount      = {};   // code → { fullString → count }
    for (const r of posQ.records) {
        const mid = mgrEmpIdOf(r);
        if (!mid) continue;
        if (!managerRecByMid[mid] && recByEmpId[mid]) managerRecByMid[mid] = recByEmpId[mid];
        const orgStr = fOrg ? readText(r, fOrg) : '';
        const code = parseCode(orgStr);
        if (!code) continue;
        (reportsByMidCode[mid] = reportsByMidCode[mid] || {});
        reportsByMidCode[mid][code] = (reportsByMidCode[mid][code] || 0) + 1;
        (orgStrCount[code] = orgStrCount[code] || {});
        if (orgStr) orgStrCount[code][orgStr] = (orgStrCount[code][orgStr] || 0) + 1;
    }
    const orgStrByCode = {};
    for (const code of Object.keys(orgStrCount)) {
        orgStrByCode[code] = Object.keys(orgStrCount[code])
            .sort((a, b) => orgStrCount[code][b] - orgStrCount[code][a])[0] || code;
    }

    // Index existing leader rows by Leader ID.
    const rowsByMid = {};
    for (const r of leadersQ.records) {
        const mid = empId(readText(r, lEmpField));
        if (mid) (rowsByMid[mid] = rowsByMid[mid] || []).push(r);
    }

    const allCodes = posQ.records.map(r => codeByRec[r.id]).filter(Boolean);
    const subtreeBelow = C => C ? allCodes.reduce((s, c) => (c.length > C.length && c.startsWith(C) ? s + 1 : s), 0) : 0;

    const toUpdate = [];
    const toAdd = [];
    const handledRowIds = new Set();

    const buildFields = (direct, code, row, knownEmail) => {
        const orgStr   = orgStrByCode[code] || code;
        const rowEmail = row ? norm(readText(row, lMailField)) : '';
        const fillEmail = (!rowEmail && knownEmail && CONFIG.copyEmailToNewRows) ? knownEmail : '';
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

        let knownEmail = emailByEmpId[mid] || '';
        for (const row of existing) { const e = norm(readText(row, lMailField)); if (e) { knownEmail = e; break; } }
        const nameStr = managerRecByMid[mid] && fName ? readText(managerRecByMid[mid], fName) : '';

        const rowByCode = {};
        const spare = [];
        for (const row of existing) {
            const rc = lCodeField ? parseCode(readText(row, lCodeField)) : '';
            if (rc && !(rc in rowByCode)) rowByCode[rc] = row; else spare.push(row);
        }
        for (const rc of Object.keys(rowByCode)) {
            if (!codes.includes(rc)) { spare.push(rowByCode[rc]); delete rowByCode[rc]; }
        }

        for (const code of codes) {
            const direct = reportsByMidCode[mid][code];
            if (rowByCode[code]) {
                const row = rowByCode[code];
                handledRowIds.add(row.id);
                const {fields, fillEmail} = buildFields(direct, code, row, knownEmail);
                if (fillEmail) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toUpdate.push({id: row.id, fields});
                rowsRefreshed++;
            } else if (spare.length) {
                const row = spare.shift();
                handledRowIds.add(row.id);
                const {fields, orgStr, fillEmail} = buildFields(direct, code, row, knownEmail);
                if (CONFIG.leadersShortCodeField) fields[CONFIG.leadersShortCodeField] = orgStr;
                if (fName && nameStr) fields[CONFIG.leadersNameField] = nameStr;
                if (fillEmail) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toUpdate.push({id: row.id, fields});
                orgsOverwritten++;
            } else {
                const {fields, orgStr, fillEmail} = buildFields(direct, code, null, knownEmail);
                fields[CONFIG.leadersEmpIdField] = mid;
                if (fName && nameStr) fields[CONFIG.leadersNameField] = nameStr;
                if (CONFIG.leadersShortCodeField) fields[CONFIG.leadersShortCodeField] = orgStr;
                if (fillEmail) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toAdd.push({fields});
                rowsCreated++;
            }
        }

        for (const row of spare) {
            handledRowIds.add(row.id);
            if (lStatusField) { toUpdate.push({id: row.id, fields: {[CONFIG.leadersStatusField]: CONFIG.statusNotLeader}}); rowsFlagged++; }
        }
    }

    // Leader rows whose Leader ID never appears as a manager in the table.
    for (const r of leadersQ.records) {
        if (handledRowIds.has(r.id)) continue;
        const mid = empId(readText(r, lEmpField));
        const code = lCodeField ? parseCode(readText(r, lCodeField)) : '';
        const below = subtreeBelow(code);
        const rowEmail = norm(readText(r, lMailField));
        const fields = {};
        if (lLevelField && code) fields[CONFIG.leadersLevelField] = levelFor(code);
        if (lStatusField) {
            let status;
            if (!rowEmail) status = CONFIG.statusMissingEmail;
            else if (below > 0) status = `${CONFIG.statusUpdate} (${below} in org)`;
            else status = CONFIG.statusNotLeader;
            fields[CONFIG.leadersStatusField] = status;
        }
        if (Object.keys(fields).length) toUpdate.push({id: r.id, fields});
    }

    while (toUpdate.length > 0) { const b = toUpdate.splice(0, 50); await leadersTable.updateRecordsAsync(b); }
    while (toAdd.length > 0)    { const b = toAdd.splice(0, 50);    await leadersTable.createRecordsAsync(b); }

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

    // GOLT + GOLT-1 only (short codes of length 3 / 4), per CONFIG.emailCodeLengths.
    if (allowedCodeLens.size > 0) {
        const emails = goltEmailsFor(r);
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
    `- ${filledByShortCode} via short code · ${filledByHierarchy} via manager chain · **${stillEmpty} empty**\n` +
    `- leaders list (source of truth = positions): **${rowsCreated} row(s) created** · ` +
    `**${orgsOverwritten} org(s) overwritten** · ${rowsRefreshed} refreshed · ` +
    `${emailsCopied} email(s) copied · ${rowsFlagged} flagged "${CONFIG.statusNotLeader}"\n\n` +
    `### Positions per layer (short-code depth)\n` +
    layerLines.join('\n') + `\n\n` +
    `### Top leaders (top layer first) — employees in their subtree\n` +
    topLines.join('\n') +
    (leaderCounts.length > 25 ? `\n- … and ${leaderCounts.length - 25} more leaders` : ''),
);
