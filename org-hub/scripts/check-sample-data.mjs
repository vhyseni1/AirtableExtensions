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

const {PEOPLE, SUP_ORG, ORG_DESIGN} = await import('../frontend/config.js');
const {resolvePeopleConfig, buildOrg, depthByNode} = await import('../frontend/lib/people.js');
const {resolveSupOrgConfig, buildSupOrgTree} = await import('../frontend/lib/suporg.js');
const {
    resolveOrgDesignConfig, resolveNotesConfig, buildNotesMap, buildStackedModel,
    paginateLevels, buildFilterTree, computeKpis, bucketForStatus,
} = await import('../frontend/lib/stacked.js');

const peopleRows = parseCSV(readFileSync(join(dataDir, 'Employees & Positions.csv'), 'utf8'));
const soRows = parseCSV(readFileSync(join(dataDir, 'Supervisory Organizations.csv'), 'utf8'));
const designRows = parseCSV(readFileSync(join(dataDir, 'Org Design Data.csv'), 'utf8'));
const notesRows = parseCSV(readFileSync(join(dataDir, 'Org Design Notes.csv'), 'utf8'));

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

// ─── Org design deck ─────────────────────────────────────────────────────────

const designTable = makeTable('Org Design Data', designRows, {primary: 'Slide Title'});
const notesTable = makeTable('Org Design Notes', notesRows, {primary: 'Slide'});

const designCfg = resolveOrgDesignConfig(designTable, ORG_DESIGN);
for (const [key, value] of Object.entries(designCfg)) {
    if (key === 'dltFields') {
        check('design config: DLT ladder resolves', value.length >= 2, `${value.length} levels`);
        continue;
    }
    check(`design config: ${key} resolves`, !!value);
}

const notesCfg = resolveNotesConfig(notesTable, ORG_DESIGN);
const notesMap = buildNotesMap(notesTable.records, notesCfg);
check('design: notes resolved for every slide',
    Object.keys(notesMap).length === notesRows.length,
    `${Object.keys(notesMap).length} of ${notesRows.length}`);

const model = buildStackedModel(designTable.records, designCfg, notesMap);
check('design: model built', !model.unresolved);
check('design: one slide per Slide Title',
    model.slides.length === new Set(designRows.map(r => r['Slide Title'])).size,
    `${model.slides.length} slides`);
check('design: every slide has a subtitle from Notes',
    model.slides.every(s => s.notes && s.notes.subtitle));
check('design: every slide has at least one level with an org',
    model.slides.every(s => s.levels.length > 0 && s.levels.every(l => l.orgs.length > 0)));
check('design: every slot carries a status bucket',
    designRows.every(r => bucketForStatus(r.Status) !== null),
    designRows.filter(r => bucketForStatus(r.Status) === null).map(r => r.Status).join(', '));

// Both sides must be non-empty, or the deck renders half-blank pages.
const emptySide = model.slides.filter(s => s.totals.current === 0 || s.totals.future === 0)
    .map(s => s.slideTitle);
check('design: every slide has both a current and a future side',
    emptySide.length === 0, emptySide.join(', '));

// The scenario must actually be visible: at-risk on the current side, posted
// on the future side. Without these the KPI columns would all read zero.
const totalRisk = model.slides.reduce((n, s) => n + s.totals.riskCur, 0);
const totalPosted = model.slides.reduce((n, s) => n + s.totals.postFut, 0);
const totalSelection = model.slides.reduce((n, s) => n + s.totals.selCur, 0);
check('design: scenario produces at-risk headcount', totalRisk > 0, `${totalRisk}`);
check('design: scenario produces posted headcount', totalPosted > 0, `${totalPosted}`);
check('design: scenario produces a selection population', totalSelection > 0, `${totalSelection}`);

// KPI identity: "Proposed" must equal mapped + selection + posted on the future
// side. A drift here means the status buckets and the totals disagree.
const kpiDrift = model.slides.filter(s => {
    const k = computeKpis(s.totals, 'future');
    return k.toBe !== s.totals.mapFut + s.totals.selFut + s.totals.postFut;
});
check('design: future KPI "Proposed" reconciles with its buckets', kpiDrift.length === 0);

// Pagination must terminate and cover every org exactly once per side.
let pageCount = 0;
let paginationOk = true;
model.slides.forEach(slide => {
    ['current', 'future'].forEach(mode => {
        const pages = paginateLevels(slide.levels, mode);
        pageCount += pages.length;
        const paged = pages.flat().reduce((n, lv) => n + lv.orgs.length, 0);
        const expected = slide.levels.reduce((n, lv) =>
            n + lv.orgs.filter(o => o.slots.some(s =>
                (mode === 'current' ? s.current : s.future) > 0)).length, 0);
        if (paged !== expected) paginationOk = false;
    });
});
check('design: pagination covers every org exactly once', paginationOk);
check('design: deck paginates to a sensible page count',
    pageCount >= model.slides.length * 2, `${pageCount} pages`);

const filterTree = buildFilterTree(model.slides, model.dltLabels);
check('design: filter tree has a single root', filterTree.length === 1,
    filterTree.map(n => n.label).join(', '));
check('design: filter tree root covers every slide',
    filterTree[0] && filterTree[0].slideTitles.length === model.slides.length);
check('design: filter tree nests below the root',
    filterTree[0] && filterTree[0].children.length > 1,
    filterTree[0] ? `${filterTree[0].children.length} branches` : '');

// Cross-check: current headcount in the deck must equal the filled positions in
// the people table, per organization. This is the claim that the two files
// describe the same company.
const filledByOrg = {};
peopleRows.forEach(r => {
    if (r['[E] Position Status'] === 'Vacant') return;
    const org = r['[F] Supervisory Organization 🔗'].replace(/\s*\([^)]*\)\s*\([^)]*\)\s*$/, '').trim();
    filledByOrg[org] = (filledByOrg[org] || 0) + 1;
});
const deckCurrentByOrg = {};
designRows.forEach(r => {
    const stack = String(r.Stack || '').toLowerCase();
    if (stack.includes('future')) return;
    const org = r['Supervisory Organization'];
    deckCurrentByOrg[org] = (deckCurrentByOrg[org] || 0) + Number(r['Current HC'] || 0);
});
// Each org appears on several slides, so divide out how many slides carry it.
const slidesPerOrg = {};
designRows.forEach(r => {
    const org = r['Supervisory Organization'];
    slidesPerOrg[org] = slidesPerOrg[org] || new Set();
    slidesPerOrg[org].add(r['Slide Title']);
});
const orgDrift = Object.keys(filledByOrg).filter(org => {
    const n = slidesPerOrg[org] ? slidesPerOrg[org].size : 0;
    if (!n) return false;
    return Math.round((deckCurrentByOrg[org] || 0) / n) !== filledByOrg[org];
});
check('cross-check: deck current headcount matches filled positions per org',
    orgDrift.length === 0,
    orgDrift.map(o => `${o}: ${Math.round((deckCurrentByOrg[o] || 0) / slidesPerOrg[o].size)} vs ${filledByOrg[o]}`).join('; '));

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`}`);
process.exit(failures.length === 0 ? 0 : 1);
