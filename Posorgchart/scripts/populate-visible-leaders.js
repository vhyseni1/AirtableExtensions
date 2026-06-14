/**
 * populate-visible-leaders.js
 * ----------------------------------------------------------------------------
 * One-off (re-runnable) Airtable **Scripting extension** script.
 *
 * For every record it writes the *ancestor-leader chain* into a multi-collaborator
 * field. A record with short code "DSGAB" becomes visible to the leaders of
 * "DSGAB", "DSGA" and "DSG" (every leader whose short code is a PREFIX of the
 * record's code). That collaborator field is what powers true, enforced
 * row-level security on a NATIVE interface element filtered by
 * `Visible to leaders = current user` — and it also drives the org-chart
 * extension's own per-leader scoping (collaborator-field-first).
 *
 * HOW TO RUN
 *   1. Open your interface base → Extensions → add a "Scripting" extension.
 *   2. Paste this file in, set the CONFIG names below to match your table, and
 *      ensure the "Visible to leaders" field exists as a **Multiple collaborators**
 *      field. Every leader must be a real collaborator on the base.
 *   3. Click "Run". Re-run whenever the org structure or leaders change.
 *
 * NOTE: collaborator cells are set by user id. Leaders are matched to base
 * collaborators by email (case-insensitive). Any leader email that is not a base
 * collaborator is reported and skipped.
 */

// ─── CONFIG — edit to match your base ────────────────────────────────────────
const CONFIG = {
    tableName: 'Employees & Positions',
    shortCodeField: 'Short Code',     // hierarchical code, e.g. DSG / DSGA
    leaderEmailField: 'Leader Email', // a leader's email (blank for non-leaders)
    visibleLeadersField: 'Visible to leaders', // Multiple collaborators (output)
};
// ─────────────────────────────────────────────────────────────────────────────

const normCode = s => String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
const normEmail = s => String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();

// Read a field as a plain string (handles lookups / linked records).
function readText(record, field) {
    let s = '';
    try { s = record.getCellValueAsString(field); } catch (e) { s = ''; }
    return (s || '').trim();
}

const table = base.getTable(CONFIG.tableName);
const shortCodeField = table.getField(CONFIG.shortCodeField);
const leaderEmailField = table.getField(CONFIG.leaderEmailField);
const visibleField = table.getField(CONFIG.visibleLeadersField);

// email → userId for everyone who can be assigned (base collaborators).
const userIdByEmail = {};
for (const c of base.activeCollaborators) {
    if (c.email) userIdByEmail[normEmail(c.email)] = c.id;
}

const query = await table.selectRecordsAsync({
    fields: [shortCodeField, leaderEmailField, visibleField],
});

// Collect leaders: {code, userId}. Warn on leaders missing a code or collaborator.
const leaders = [];
const missingCollaborators = new Set();
for (const record of query.records) {
    const email = normEmail(readText(record, leaderEmailField));
    if (!email) continue;
    const code = normCode(readText(record, shortCodeField));
    if (!code) continue;
    const userId = userIdByEmail[email];
    if (!userId) { missingCollaborators.add(email); continue; }
    leaders.push({code, userId});
}

output.text(`Found ${leaders.length} leader(s) with a short code and a base account.`);
if (missingCollaborators.size > 0) {
    output.markdown(
        `⚠️ **${missingCollaborators.size} leader email(s) are not base collaborators** and were skipped:\n\n` +
        [...missingCollaborators].map(e => `- ${e}`).join('\n'),
    );
}

// For each record, the leaders whose code is a prefix of the record's code.
const updates = [];
for (const record of query.records) {
    const code = normCode(readText(record, shortCodeField));
    const seen = new Set();
    const collaborators = [];
    if (code) {
        for (const leader of leaders) {
            if (code.startsWith(leader.code) && !seen.has(leader.userId)) {
                seen.add(leader.userId);
                collaborators.push({id: leader.userId});
            }
        }
    }
    updates.push({id: record.id, fields: {[visibleField.id]: collaborators}});
}

// Airtable caps batch writes at 50 records.
let written = 0;
while (updates.length > 0) {
    const batch = updates.splice(0, 50);
    await table.updateRecordsAsync(batch);
    written += batch.length;
}
output.text(`Updated "${CONFIG.visibleLeadersField}" on ${written} record(s). Done.`);
