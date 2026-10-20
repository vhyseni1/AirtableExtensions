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

const {PEOPLE, SUP_ORG, ORG_DESIGN, tierLabel} = await import('../frontend/config.js');
const {resolvePeopleConfig, buildOrg, depthByNode} = await import('../frontend/lib/people.js');
const {resolveSupOrgConfig, buildSupOrgTree} = await import('../frontend/lib/suporg.js');
const {
    resolveOrgDesignConfig, resolveNotesConfig, buildNotesMap, buildStackedModel,
    paginateLevels, buildFilterTree, computeKpis, bucketForStatus,
} = await import('../frontend/lib/stacked.js');
const {collectSubtreeIds, canReparent, reparentFields, wouldStick} =
    await import('../frontend/lib/reparent.js');
const {monthlyRate, benefitFraction, cashflow, crossingMonth, baselineVsScenario,
    variant, variants, sensitivity} = await import('../frontend/lib/finance.js');
const {FINANCE} = await import('../frontend/config.js');
const {savings, peopleImpact} = await import('../frontend/lib/orgMetrics.js');

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
    if (key === 'tierFields') {
        check('design config: tier ladder resolves', value.length >= 2, `${value.length} tiers`);
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

const filterTree = buildFilterTree(model.slides, model.tierLabels);
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

// ─── Tier labels ─────────────────────────────────────────────────────────────

check('tier labels: DLT maps to Level 1', tierLabel('DLT') === 'Level 1', tierLabel('DLT'));
check('tier labels: DLT-1 maps to Level 2', tierLabel('DLT-1') === 'Level 2', tierLabel('DLT-1'));
check('tier labels: DLT-6 maps to Level 7', tierLabel('DLT-6') === 'Level 7', tierLabel('DLT-6'));
check('tier labels: an unmatched value passes through',
    tierLabel('Band A') === 'Band A' && tierLabel('Level 3') === 'Level 3');
check('tier labels: blank stays blank', tierLabel('') === '' && tierLabel(null) === '');

// Every tier value in the data must relabel — a value that falls through would
// print raw DLT text on a slide.
const tierValues = [...new Set(designRows.flatMap(r => [r.Level, r['Section Level']]))].filter(Boolean);
const unmapped = tierValues.filter(v => tierLabel(v) === v);
check('tier labels: every tier value in the data is relabelled',
    unmapped.length === 0, unmapped.join(', '));

// ─── Reparenting (drag to change a reporting line) ──────────────────────────
//
// The write path has one failure mode worth pinning down: buildOrg resolves a
// manager from the manager-id TEXT field before the link field, so an update
// that moves only the link is silently undone on the next rebuild.

const F_LINK = {id: 'fldLink', type: 'multipleRecordLinks'};
const F_MGRID = {id: 'fldMgrId', type: 'singleLineText'};
const F_EMPID = {id: 'fldEmpId', type: 'singleLineText'};
const F_LOOKUP = {id: 'fldLookup', type: 'multipleLookupValues'};

// Stand-in for an Airtable record: answers by field id.
const rpRec = (id, empId) => ({
    id,
    getCellValue: f => (f.id === 'fldEmpId' ? empId : null),
    getCellValueAsString: f => (f.id === 'fldEmpId' ? empId : ''),
});
const rpNode = (id, empId, parentId, childIds = []) => ({
    id, parentId, childIds, displayName: id, record: rpRec(id, empId),
});

// ceo → vp → mgr → ic
const rpMap = {
    ceo: rpNode('ceo', 'E1', null, ['vp']),
    vp: rpNode('vp', 'E2', 'ceo', ['mgr']),
    mgr: rpNode('mgr', 'E3', 'vp', ['ic']),
    ic: rpNode('ic', 'E4', 'mgr', []),
};

check('reparent: subtree includes self and all descendants',
    [...collectSubtreeIds(rpMap, 'vp')].sort().join(',') === 'ic,mgr,vp');
check('reparent: cannot report to yourself', !canReparent(rpMap, 'mgr', 'mgr').ok);
check('reparent: cannot report to your own descendant (would loop)',
    !canReparent(rpMap, 'vp', 'ic').ok);
check('reparent: refuses a move that changes nothing', !canReparent(rpMap, 'ic', 'mgr').ok);
check('reparent: a genuine move up the tree is allowed', canReparent(rpMap, 'ic', 'ceo').ok);
check('reparent: moving a whole subtree sideways is allowed', canReparent(rpMap, 'mgr', 'ceo').ok);

// The central one: BOTH fields must move, or the change does not stick.
const rpCfg = {parentField: F_LINK, managerIdField: F_MGRID, employeeIdField: F_EMPID};
const rpBoth = reparentFields(rpCfg, rpMap.ceo);
check('reparent: writes the link field',
    Array.isArray(rpBoth.fldLink) && rpBoth.fldLink[0].id === 'ceo');
check('reparent: writes the manager employee id, not the record id',
    rpBoth.fldMgrId === 'E1', String(rpBoth.fldMgrId));
check('reparent: blanks the manager id when the new manager has none',
    reparentFields(rpCfg, rpNode('tmp', '', null)).fldMgrId === '');

// A lookup parent field is computed, so only the manager id can carry it.
const rpLookup = reparentFields(
    {parentField: F_LOOKUP, managerIdField: F_MGRID, employeeIdField: F_EMPID}, rpMap.ceo);
check('reparent: never tries to write a computed lookup parent field',
    !('fldLookup' in rpLookup) && rpLookup.fldMgrId === 'E1', JSON.stringify(rpLookup));
check('reparent: returns null when no field can carry the change',
    reparentFields({parentField: F_LOOKUP, managerIdField: null, employeeIdField: F_EMPID},
        rpMap.ceo) === null);

// A link-only write while a non-writable manager id still holds a value is
// exactly the silent-revert case.
const rpStaleChild = {...rpMap.ic, record: {
    id: 'ic',
    getCellValue: f => (f.id === 'fldLookup' ? 'E3' : null),
    getCellValueAsString: f => (f.id === 'fldLookup' ? 'E3' : ''),
}};
check('reparent: detects a move the stale manager id would override',
    !wouldStick({parentField: F_LINK, managerIdField: F_LOOKUP, employeeIdField: F_EMPID},
        rpStaleChild, {fldLink: [{id: 'ceo'}]}));
check('reparent: a write that includes the manager id always sticks',
    wouldStick(rpCfg, rpMap.ic, rpBoth));

// ─── Financial model ────────────────────────────────────────────────────────

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// Monthly rate must compound to the annual one, not be a twelfth of it.
check('finance: monthly rate compounds to the annual rate',
    near(Math.pow(1 + monthlyRate(0.08), 12) - 1, 0.08, 1e-9),
    (Math.pow(1 + monthlyRate(0.08), 12) - 1).toFixed(9));
check('finance: monthly rate is NOT annual/12',
    monthlyRate(0.08) < 0.08 / 12, monthlyRate(0.08).toFixed(6));

// The benefit ramp.
check('finance: no benefit before the ramp starts', benefitFraction(1, 3, 12) === 0);
check('finance: full benefit after the ramp ends', benefitFraction(99, 3, 12) === 1);
check('finance: ramp is linear at its midpoint',
    near(benefitFraction(7.5, 3, 12), 0.5), String(benefitFraction(7.5, 3, 12)));

// A clean case with known arithmetic: 1.2m/yr benefit, 600k one-off.
const fx = cashflow({grossAnnual: 1200000, oneOff: 600000});
check('finance: cash flow runs the whole horizon',
    fx.months.length === FINANCE.horizonMonths, String(fx.months.length));
check('finance: one-off is fully charged and no more',
    near(fx.months.reduce((n, r) => n + r.cost, 0), 600000, 1e-6));
check('finance: benefit never exceeds the annual run-rate in a month',
    fx.months.every(r => r.benefit <= 1200000 / 12 + 1e-9));
check('finance: cumulative equals the running sum of net',
    near(fx.months[fx.months.length - 1].cumulative,
        fx.months.reduce((n, r) => n + r.net, 0), 1e-6));
check('finance: the position starts negative (cost lands before benefit)',
    fx.months[0].cumulative < 0, fx.months[0].cumulative.toFixed(0));

// The point of the whole module: phasing makes payback LATER than the
// run-rate shortcut claims. If this ever inverts, the model is flattering.
check('finance: phased payback is later than the naive run-rate payback',
    fx.paybackMonths > fx.naivePaybackMonths,
    `${fx.paybackMonths.toFixed(1)} vs ${fx.naivePaybackMonths.toFixed(1)}`);

// NPV must sit below the undiscounted total but stay positive here.
check('finance: NPV is less than the undiscounted cumulative',
    fx.npv < fx.cumulativeAtHorizon, `${Math.round(fx.npv)} < ${Math.round(fx.cumulativeAtHorizon)}`);
check('finance: a zero discount rate makes NPV equal the cumulative',
    near(cashflow({grossAnnual: 1200000, oneOff: 600000}, {discountRateAnnual: 0}).npv,
        fx.cumulativeAtHorizon, 1e-6));

// A design that saves nothing can never pay back.
const noSave = cashflow({grossAnnual: 0, oneOff: 500000});
check('finance: no benefit means no payback', noSave.paybackMonths === null);
check('finance: no benefit means no naive payback either', noSave.naivePaybackMonths === null);

check('finance: crossing month is null when the series never turns positive',
    crossingMonth([{month: 1, cumulative: -5}, {month: 2, cumulative: -3}]) === null);
check('finance: crossing month interpolates within the month',
    near(crossingMonth([{month: 1, cumulative: -10}, {month: 2, cumulative: 10}]), 1.5),
    String(crossingMonth([{month: 1, cumulative: -10}, {month: 2, cumulative: 10}])));

// Baseline comparison must report real deltas against the impact totals.
const cmpImpact = {totals: {current: 100, future: 80}};
const cmpMoney = {currentCost: 10000000, futureCost: 8000000};
const cmp = baselineVsScenario(cmpImpact, cmpMoney);
check('finance: comparison reports the position delta',
    cmp[0].delta === -20 && near(cmp[0].deltaPct, -20), JSON.stringify(cmp[0].delta));
check('finance: comparison reports cost per position on both sides',
    near(cmp[2].baseline, 100000) && near(cmp[2].scenario, 100000),
    `${cmp[2].baseline} / ${cmp[2].scenario}`);

// Scenario variants.
const vMoney = {grossAnnual: 1200000, severance: 400000, recruitment: 150000,
    transition: 50000, oneOff: 600000};
const vs = variants(vMoney);
check('finance: every configured variant is modelled',
    vs.length === FINANCE.variants.length, String(vs.length));
const designed = vs.find(v => v.key === 'designed');
const phased = vs.find(v => v.key === 'phased');
const deeper = vs.find(v => v.key === 'deeper');
const attrition = vs.find(v => v.key === 'attrition');
check('finance: the designed variant reproduces the unscaled benefit',
    near(designed.grossAnnual, 1200000));
check('finance: delaying the ramp pushes payback out, benefit unchanged',
    near(phased.grossAnnual, designed.grossAnnual)
        && phased.paybackMonths > designed.paybackMonths,
    `${phased.paybackMonths.toFixed(1)} vs ${designed.paybackMonths.toFixed(1)}`);
check('finance: delaying the ramp lowers NPV', phased.npv < designed.npv);
check('finance: a deeper cut raises the benefit and the severance together',
    deeper.grossAnnual > designed.grossAnnual && deeper.severance > designed.severance);
check('finance: attrition-led costs less to execute than the designed case',
    attrition.oneOff < designed.oneOff,
    `${Math.round(attrition.oneOff)} < ${Math.round(designed.oneOff)}`);
check('finance: scaling scope leaves recruitment and transition alone',
    near(deeper.oneOff - deeper.severance, designed.oneOff - designed.severance, 1e-6));

// Sensitivity.
const sens = sensitivity(vMoney);
check('finance: every configured sensitivity is modelled',
    sens.length === FINANCE.sensitivities.length, String(sens.length));
check('finance: sensitivities are ordered by exposure, biggest first',
    sens.every((r, i) => i === 0 || sens[i - 1].swing >= r.swing));
check('finance: every sensitivity brackets the base case',
    sens.every(r => r.worst <= r.base + 1e-6 && r.best >= r.base - 1e-6));
check('finance: a swing is a real span, not zero',
    sens.every(r => r.swing > 0));

// Net year one is reported in two places (a tile and the scenario table) and
// must come from one source. The run-rate shortcut is a different, flattering
// number; pin the gap so the two cannot silently diverge again.
const nyFlow = cashflow({grossAnnual: 1200000, oneOff: 600000});
check('finance: net year one equals the first twelve months of the flow',
    near(nyFlow.netYearOne, nyFlow.months.slice(0, 12).reduce((n, r) => n + r.net, 0), 1e-9));
check('finance: net year one is worse than the run-rate shortcut',
    nyFlow.netYearOne < 1200000 - 600000,
    `${Math.round(nyFlow.netYearOne)} < ${1200000 - 600000}`);
check('finance: the designed variant reports the same net year one as its flow',
    near(designed.netYearOne, designed.flow.netYearOne, 1e-9));
check('finance: cost per position is marked neutral, not a failure',
    baselineVsScenario({totals: {current: 100, future: 80}},
        {currentCost: 1e7, futureCost: 8e6})[2].neutral === true);

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`}`);
process.exit(failures.length === 0 ? 0 : 1);
