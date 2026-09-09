// Smoke-test the org models against the sample CSVs, without Airtable.
//
// Fakes just enough of the Blocks SDK record/table API for `lib/people.js` and
// `lib/suporg.js` to run, then asserts the two files really do describe one
// consistent organization: every manager resolves, there is exactly one root,
// no cycles, and the supervisory tree spans every org.
//
// Run:  node scripts/check-sample-data.mjs

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'sample-data');

// ─── Minimal CSV reader (quoted fields, embedded commas/newlines) ────────────

function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; }
                else quoted = false;
            } else cell += c;
            continue;
        }
        if (c === '"') { quoted = true; continue; }
        if (c === ',') { row.push(cell); cell = ''; continue; }
        if (c === '\r') continue;
        if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
        cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [header, ...body] = rows.filter(r => r.length > 1 || r[0] !== '');
    return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ─── Fake SDK objects ────────────────────────────────────────────────────────

function makeTable(name, csvRows, {primary, links = {}}) {
    const fieldNames = Object.keys(csvRows[0]);
    const fields = fieldNames.map((n, i) => ({
        id: `fld${i}`,
        name: n,
        type: links[n] ? 'multipleRecordLinks' : 'singleLineText',
        options: null,
    }));
    const byName = new Map(fields.map(f => [f.name, f]));

    // Link fields resolve to record ids via the target table's primary field.
    const recordsById = new Map();
    const records = csvRows.map((r, i) => {
        const id = `rec${name.slice(0, 3)}${String(i).padStart(4, '0')}`;
        const rec = {
            id,
            name: r[primary],
            raw: r,
            getCellValueAsString(field) {
                const f = typeof field === 'string' ? byName.get(field) : field;
                if (!f) throw new Error(`no field ${field}`);
                return r[f.name] ?? '';
            },
            getCellValue(field) {
                const f = typeof field === 'string' ? byName.get(field) : field;
                if (!f) throw new Error(`no field ${field}`);
                const v = r[f.name] ?? '';
                if (links[f.name]) {
                    if (!v) return null;
                    const target = links[f.name]();
                    const hit = target.find(t => t.name === v);
                    return hit ? [{id: hit.id, name: hit.name}] : null;
                }
                return v === '' ? null : v;
            },
        };
        recordsById.set(id, rec);
        return rec;
    });

    return {
        name,
        fields,
        records,
        getFieldByNameIfExists: n => byName.get(n) || null,
    };
}

const colorUtils = {getHexForColor: () => null, shouldUseLightTextOnColor: () => false};

// ─── Load ────────────────────────────────────────────────────────────────────

const {PEOPLE, SUP_ORG} = await import('../frontend/config.js');
const {resolvePeopleConfig, buildOrg, depthByNode} = await import('../frontend/lib/people.js');
const {resolveSupOrgConfig, buildSupOrgTree} = await import('../frontend/lib/suporg.js');

const peopleRows = parseCSV(readFileSync(join(dataDir, 'Employees & Positions.csv'), 'utf8'));
const soRows = parseCSV(readFileSync(join(dataDir, 'Supervisory Organizations.csv'), 'utf8'));

let peopleTable;
peopleTable = makeTable('Employees & Positions', peopleRows, {
    primary: 'Position ID',
    links: {'Future Manager': () => peopleTable.records},
});
let soTable;
soTable = makeTable('Supervisory Organizations', soRows, {
    primary: 'Supervisory Organization',
    links: {'Parent Supervisory Organization': () => soTable.records},
});

// ─── Assertions ──────────────────────────────────────────────────────────────

const failures = [];
const check = (label, ok, detail = '') => {
    if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const peopleCfg = resolvePeopleConfig(peopleTable, PEOPLE);
for (const [key, value] of Object.entries(peopleCfg)) {
    // statusField / leaderEmailField / visibleLeadersField are intentionally
    // unset in config.js; everything else must resolve against the sample data.
    if (['statusField', 'leaderEmailField', 'visibleLeadersField'].includes(key)) continue;
    check(`people config: ${key} resolves`, !!value);
}

const org = buildOrg(peopleTable.records, peopleCfg, colorUtils);
const nodes = Object.values(org.nodeMap);

check('people: every row became a node', nodes.length === peopleRows.length,
    `${nodes.length} of ${peopleRows.length}`);
check('people: exactly one root', org.rootIds.length === 1,
    org.rootIds.map(id => org.nodeMap[id].displayName).join(', '));
check('people: every non-root resolved a manager',
    nodes.filter(n => !n.parentId).length === 1);

const depths = depthByNode(org.nodeMap);
const maxDepth = Math.max(...Object.values(depths));
check('people: hierarchy is deeper than one level', maxDepth >= 3, `max depth ${maxDepth}`);
check('people: total reports under the root equals everyone else',
    org.totals[org.rootIds[0]] === nodes.length - 1,
    `${org.totals[org.rootIds[0]]} vs ${nodes.length - 1}`);

const vacant = nodes.filter(n => n.vacant);
check('people: sample includes vacant positions', vacant.length > 0, `${vacant.length} vacant`);
check('people: at least one vacant seat is a manager',
    vacant.some(n => n.childIds.length > 0));

const soCfg = resolveSupOrgConfig(soTable, SUP_ORG);
for (const [key, value] of Object.entries(soCfg)) {
    if (key === 'nameField') continue; // null ⇒ use the primary field
    check(`sup-org config: ${key} resolves`, !!value);
}

const tree = buildSupOrgTree(soTable.records, soCfg);
check('sup-org: no conflicts', tree.conflicts.length === 0,
    tree.conflicts.map(c => c.detail).join('; '));
check('sup-org: exactly one root', tree.roots.length === 1,
    tree.roots.map(r => r.teamName).join(', '));

const spanned = new Set();
const walk = n => { spanned.add(n.id); n.children.forEach(walk); };
tree.roots.forEach(walk);
check('sup-org: tree spans every organization', spanned.size === soRows.length,
    `${spanned.size} of ${soRows.length}`);
check('sup-org: names parsed into team/manager/org id',
    Object.values(tree.nodeMap).every(n => n.teamName && n.orgId));
check('sup-org: headcount rollup is populated',
    Object.values(tree.nodeMap).every(n => n.headcount > 0));

// Cross-file consistency: every short code on a person exists as a sup org.
const soCodes = new Set(Object.values(tree.nodeMap).map(n => n.shortCode));
const orphanCodes = [...new Set(nodes.map(n => n.shortCode))].filter(c => c && !soCodes.has(c));
check('cross-check: every person\'s short code names a real supervisory org',
    orphanCodes.length === 0, orphanCodes.join(', '));

// The rollup on each sup org should equal the FTE of its direct members.
const fteByCode = {};
nodes.forEach(n => { fteByCode[n.shortCode] = (fteByCode[n.shortCode] || 0) + n.fte; });
const rollupMismatches = Object.values(tree.nodeMap)
    .filter(n => Math.abs((fteByCode[n.shortCode] || 0) - n.headcount) > 0.001)
    .map(n => `${n.shortCode}: ${n.headcount} vs ${fteByCode[n.shortCode]}`);
check('cross-check: headcount rollup matches member FTE',
    rollupMismatches.length === 0, rollupMismatches.join('; '));

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`}`);
process.exit(failures.length === 0 ? 0 : 1);
