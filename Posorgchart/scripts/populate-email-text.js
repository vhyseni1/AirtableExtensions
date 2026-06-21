/**
 * populate-email-text.js — FUTURE branching access (name-based, no [E] columns)
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * For every position it writes into "[T] Email Text (Future Leaders)" the emails
 * of every LEADER in that position's management chain — INCLUDING the position
 * itself — by climbing the real parent→child relationship and identifying each
 * leader by the FUTURE NAME carried in the parent reference.
 *
 * WHY NAME-BASED (no [E]): the [E] columns describe the EXISTING org/incumbents.
 * In the future reorg a seat's FUTURE head is often a different person than its
 * current [E] incumbent, so matching by [E] Employee ID mis-identifies managers.
 * Structure comes only from the [F]/parent references + short code; identity comes
 * from the future name in "[F] Manager ID" — whose value matches the parent's
 * "Unique ID" and carries the name ("50472279 - Head of Quality Control (Kristina
 * Henthorn)" → Kristina Henthorn) — matched to the leaders list's "Leader Name".
 *
 * SOURCE OF TRUTH = the Employees & Positions table. Each manager (parent of ≥1
 * position) manages the supervisory orgs their DIRECT reports sit in. Reconcile:
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
    uniqueIdField:     'Unique ID',          // each record's own id
    // Parent pointer: this record's "[F] Manager ID" — its value matches the
    // PARENT's "Unique ID" (the join), and it also carries the parent's future
    // name ("50472279 - Head of Quality Control (Kristina Henthorn)") used to
    // identify the leader. (Resolved emoji/spacing-tolerantly.)
    managerIdField:    '[F] Manager ID 🔎',
    outputField:       '[T] Email Text (Future Leaders)',  // comma-separated emails (output)

    leadersTable:      'Future Leaders list',
    leadersEmpIdField: 'Leader ID',
    leadersNameField:  'Leader Name',        // matched to the future name in the pointer
    leadersEmailField: 'Email',
    // The leader's short code = the LEADING token of "Managing Organization".
    leadersShortCodeField: 'Managing Organization',

    // Also stamp a leader's OWN email on their OWN seat (so they see themselves).
    includeSelf:       true,

    // RECONCILE the leaders list against the positions table (source of truth):
    // overwrite mismatched "Managing Organization" values and split a multi-org
    // manager into one row per org. Status / Level are (re)written too.
    flagMissingLeaders: true,
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
    // 'always' = name chain FIRST, then UNION short-code leaders. 'only' = short
    // code only. 'empty' = chain, short code only when the chain found nothing.
    shortCodeMode:     'always',

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
// Person-name key: drop "(On Leave)"-style suffixes + diacritics + punctuation,
// uppercase, collapse spaces. So "Patrick Beer (On Leave)" and "Käfer" still match.
const normPerson = s => norm(s)
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// Future name carried in a parent pointer: the LAST parenthesised group that
// isn't all digits ("… - Title (Kristina Henthorn)" → "Kristina Henthorn").
const parseMgrName = raw => {
    const groups = [...String(raw == null ? '' : raw).matchAll(/\(([^()]+)\)/g)].map(m => norm(m[1]));
    for (let i = groups.length - 1; i >= 0; i--) if (groups[i] && !/^\d+$/.test(groups[i])) return groups[i];
    return '';
};

// Parent-id key: the first run of 3+ digits ("12345 - Title" → "12345"), else the
// whole normalized value.
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
const normName = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
// Resolve a field by exact name, then emoji/space-tolerant normalized name, then a
// predicate — so the manager pointer survives the icon characters in its name.
function resolveField(table, candidates, predicate) {
    for (const c of candidates) { if (!c) continue; try { return table.getField(c); } catch (e) { /* next */ } }
    const wanted = candidates.filter(Boolean).map(normName);
    for (const f of table.fields) if (wanted.includes(normName(f.name))) return f;
    if (predicate) for (const f of table.fields) if (predicate(f)) return f;
    throw new Error(`No field matching "${candidates[0]}" on "${table.name}"`);
}
// Level from a short code's length: 2→GOLT, 3→GOLT-1, 4→GOLT-2, 5+→Below Golt-2.
const levelFor = code => {
    const n = (code || '').length;
    if (n === 2) return 'GOLT';
    if (n === 3) return 'GOLT-1';
    if (n === 4) return 'GOLT-2';
    if (n >= 5) return 'Below Golt-2';
    return '';
};

// ── Leaders: Leader Name → email, plus (code,email) for short-code matching ──
const leadersTable = base.getTable(CONFIG.leadersTable);
const lEmpField  = leadersTable.getField(CONFIG.leadersEmpIdField);
const lNameField = leadersTable.getField(CONFIG.leadersNameField);
const lMailField = leadersTable.getField(CONFIG.leadersEmailField);
const lCodeField = CONFIG.leadersShortCodeField ? leadersTable.getField(CONFIG.leadersShortCodeField) : null;

const emailByName  = {};   // normPerson(Leader Name) → email (mutated by reload)
const leadersByCode = [];  // {code, email} (mutated by reload)

async function reloadLeaders() {
    const fields = [lEmpField, lNameField, lMailField];
    if (lCodeField) fields.push(lCodeField);
    const q = await leadersTable.selectRecordsAsync({fields});
    for (const k of Object.keys(emailByName)) delete emailByName[k];
    leadersByCode.length = 0;
    const seen = new Set();
    for (const r of q.records) {
        const name = normPerson(readText(r, lNameField));
        const email = norm(readText(r, lMailField));
        if (name && email && !(name in emailByName)) emailByName[name] = email;
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
    `Loaded ${Object.keys(emailByName).length} leader email(s) by name; ` +
    `${leadersByCode.length} have a short code on "${CONFIG.leadersTable}".`,
);

// ── Positions: index by Unique ID; read parent pointer ──────────────────────
const posTable = base.getTable(CONFIG.posTable);
const fUid = posTable.getField(CONFIG.uniqueIdField);
const fMgr = resolveField(posTable, [
    CONFIG.managerIdField,
    '[F] Manager ID 🔎',
    '[F] Manager ID',
    'Organization Manager (from [F] Supervisory Organization 🔗)',
    'Organization Manager (from [F] Supervisory Organization)',
], f => { const n = normName(f.name); return n.includes('fmanagerid') || (n.includes('organizationmanager') && n.includes('supervisoryorganization')); });
const fOut = posTable.getField(CONFIG.outputField);
const fCode = CONFIG.shortCodeField ? posTable.getField(CONFIG.shortCodeField) : null;
const fOrg  = CONFIG.flagMissingLeaders ? fieldOrNull(posTable, CONFIG.posOrgField) : null;
const posFields = [fUid, fMgr, fOut];
for (const f of [fCode, fOrg]) if (f && !posFields.includes(f)) posFields.push(f);
const posQ = await posTable.selectRecordsAsync({fields: posFields});

const recByUid     = {};   // unique-id key → record (keyed by raw AND leading-number)
const mgrRawByRec  = {};   // record id → raw parent-pointer text
const codeByRec    = {};   // record id → short code
const occupantNameById = {};   // position id → its FUTURE head's name (from pointers)
for (const r of posQ.records) {
    const uidRaw = readText(r, fUid);
    for (const k of [normKey(uidRaw), idKey(uidRaw)]) {
        if (k && !(k in recByUid)) recByUid[k] = r;
    }
    mgrRawByRec[r.id] = readText(r, fMgr);
    codeByRec[r.id]   = fCode ? normCode(readText(r, fCode)) : '';
}
for (const r of posQ.records) {
    const raw = mgrRawByRec[r.id];
    if (!raw) continue;
    const pid = idKey(raw), pname = parseMgrName(raw);
    if (pid && pname && !(pid in occupantNameById)) occupantNameById[pid] = pname;
}

const parentOf = r => {
    const raw = mgrRawByRec[r.id];
    if (!raw) return null;
    const p = recByUid[normKey(raw)] || recByUid[idKey(raw)] || null;
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

// Leader emails for the chain, TOP-FIRST. We climb the parent references and
// identify each ancestor by the FUTURE NAME in the pointer (→ emailByName); SELF
// is this seat's own future head (someone points to it as their parent).
function leaderEmailsFor(startRec) {
    const out = [];
    const seen = new Set();
    const guard = new Set();
    // SELF first (ends up LAST after reverse).
    if (CONFIG.includeSelf) {
        const selfName = occupantNameById[idKey(readText(startRec, fUid))];
        const e = selfName ? emailByName[normPerson(selfName)] : '';
        if (e) { const k = normEmail(e); if (!seen.has(k)) { seen.add(k); out.push(e); } }
    }
    let cur = startRec;
    while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        const pname = parseMgrName(mgrRawByRec[cur.id]);
        const e = pname ? emailByName[normPerson(pname)] : '';
        if (e) { const k = normEmail(e); if (!seen.has(k)) { seen.add(k); out.push(e); } }
        cur = parentOf(cur);   // climb via position id — through vacant seats
    }
    out.reverse();   // top leader first → … → direct manager (→ self last)
    return out;
}

// ── Reconcile the leaders list to the positions table (SOURCE OF TRUTH) ──────
// Managers/leaders are identified by FUTURE NAME (never [E]). Runs BEFORE the
// email-text write; the list is re-read afterward so writes take effect this run.
let orgsOverwritten = 0, rowsCreated = 0, emailsCopied = 0, rowsFlagged = 0, rowsRefreshed = 0;
if (CONFIG.flagMissingLeaders) {
    const lLevelField  = fieldOrNull(leadersTable, CONFIG.leadersLevelField);
    const lStatusField = fieldOrNull(leadersTable, CONFIG.leadersStatusField);

    // Managed orgs per MANAGER NAME: distinct supervisory-org codes their direct
    // reports sit in, with a representative full string + per-(name,code) count.
    const reportsByNameCode = {};   // nameKey → { code → count }
    const nameMeta          = {};   // nameKey → { display }
    const orgStrCount       = {};   // code → { fullString → count }
    for (const r of posQ.records) {
        const raw = mgrRawByRec[r.id];
        if (!raw) continue;
        const display = parseMgrName(raw);
        if (!display) continue;
        const nameKey = normPerson(display);
        if (!nameKey) continue;
        const orgStr = fOrg ? readText(r, fOrg) : '';
        const code = parseCode(orgStr);
        if (!code) continue;
        (reportsByNameCode[nameKey] = reportsByNameCode[nameKey] || {});
        reportsByNameCode[nameKey][code] = (reportsByNameCode[nameKey][code] || 0) + 1;
        if (!nameMeta[nameKey]) nameMeta[nameKey] = {display};
        (orgStrCount[code] = orgStrCount[code] || {});
        if (orgStr) orgStrCount[code][orgStr] = (orgStrCount[code][orgStr] || 0) + 1;
    }
    const orgStrByCode = {};
    for (const code of Object.keys(orgStrCount)) {
        orgStrByCode[code] = Object.keys(orgStrCount[code])
            .sort((a, b) => orgStrCount[code][b] - orgStrCount[code][a])[0] || code;
    }

    // Index existing leader rows by Leader Name.
    const rowsByName = {};
    for (const r of leadersQ.records) {
        const nm = normPerson(readText(r, lNameField));
        if (nm) (rowsByName[nm] = rowsByName[nm] || []).push(r);
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

    for (const nameKey of Object.keys(reportsByNameCode)) {
        const codes = Object.keys(reportsByNameCode[nameKey]);
        const existing = (rowsByName[nameKey] || []).slice();
        const display = nameMeta[nameKey].display;

        let knownEmail = '';
        for (const row of existing) { const e = norm(readText(row, lMailField)); if (e) { knownEmail = e; break; } }

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
            const direct = reportsByNameCode[nameKey][code];
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
                if (fillEmail) { fields[CONFIG.leadersEmailField] = fillEmail; emailsCopied++; }
                toUpdate.push({id: row.id, fields});
                orgsOverwritten++;
            } else {
                const {fields, orgStr, fillEmail} = buildFields(direct, code, null, knownEmail);
                fields[CONFIG.leadersNameField] = display;
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

    // Leader rows whose name never appears as a manager in the table.
    for (const r of leadersQ.records) {
        if (handledRowIds.has(r.id)) continue;
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
    `- ${filledByShortCode} via short code · ${filledByHierarchy} via name chain · **${stillEmpty} empty**\n` +
    `- leaders list (source of truth = positions): **${rowsCreated} row(s) created** · ` +
    `**${orgsOverwritten} org(s) overwritten** · ${rowsRefreshed} refreshed · ` +
    `${emailsCopied} email(s) copied · ${rowsFlagged} flagged "${CONFIG.statusNotLeader}"\n\n` +
    `### Positions per layer (short-code depth)\n` +
    layerLines.join('\n') + `\n\n` +
    `### Top leaders (top layer first) — employees in their subtree\n` +
    topLines.join('\n') +
    (leaderCounts.length > 25 ? `\n- … and ${leaderCounts.length - 25} more leaders` : ''),
);
