// The stacked org-design model — the Airtable port of the Apps Script
// `buildStackedOrgModel_` (orgdesiger/Code.gs).
//
// Shape, outermost first:
//
//   slide   one deck page, grouped by Slide Title
//    └ level    one band per DLT level, labelled on the left
//       └ org      one cluster per supervisory organization
//          └ slot     one position (+ country), carrying current & future counts
//
// Each slot also carries the status split that colours it and feeds the KPI
// table: riskCur/selCur/mapCur on the current side, selFut/mapFut/postFut on
// the future side.

import {readText, readNumber, findFieldByName, normName} from './fields';

// ─── Status bucketing ────────────────────────────────────────────────────────
//
// Ported verbatim in behaviour from `bucketForStatus_`: exact matches on a
// normalised value first, then a substring fallback, so free-typed status
// values ("Potentially at risk", "To be posted") still land in a bucket.

export function bucketForStatus(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const t = s.toLowerCase().replace(/[\s_]+/g, '').replace(/-+/g, '');

    if (t === 'mapped' || t === 'directlymapped' || t === 'directmapped') return 'mapped';
    if (['selection', 'inselectionprocess', 'inselection', 'forselection',
        'selectionprocess', 'selected', 'underselection'].includes(t)) return 'selection';
    if (['posted', 'tobeposted', 'topost', 'open', 'openposition',
        'tobefilled', 'vacant', 'newposition', 'new'].includes(t)) return 'posted';
    if (['risk', 'atrisk', 'potentiallyatrisk', 'potentially',
        'impacted', 'redundant', 'atriskemployee', 'atriskemployees'].includes(t)) return 'risk';

    if (t.includes('mapped')) return 'mapped';
    if (t.includes('selection') || t.includes('selected')) return 'selection';
    if (t.includes('posted') || t.includes('vacant') || t.includes('tobefilled')) return 'posted';
    if (t.includes('risk') || t.includes('impacted') || t.includes('redundan')) return 'risk';
    return null;
}

// ─── Config resolution ───────────────────────────────────────────────────────

export function resolveOrgDesignConfig(table, ORG_DESIGN) {
    const dltFields = (ORG_DESIGN.dltFields || [])
        .map(name => ({name, field: findFieldByName(table, name)}))
        .filter(d => d.field);
    return {
        slideTitleField: findFieldByName(table, ORG_DESIGN.slideTitleField),
        sectionNameField: findFieldByName(table, ORG_DESIGN.sectionNameField),
        sectionLevelField: findFieldByName(table, ORG_DESIGN.sectionLevelField),
        levelField: findFieldByName(table, ORG_DESIGN.levelField),
        orgField: findFieldByName(table, ORG_DESIGN.orgField),
        positionField: findFieldByName(table, ORG_DESIGN.positionField),
        currentField: findFieldByName(table, ORG_DESIGN.currentField),
        futureField: findFieldByName(table, ORG_DESIGN.futureField),
        fteField: findFieldByName(table, ORG_DESIGN.fteField),
        countryField: findFieldByName(table, ORG_DESIGN.countryField),
        stackField: findFieldByName(table, ORG_DESIGN.stackField),
        statusField: findFieldByName(table, ORG_DESIGN.statusField),
        positionIdField: findFieldByName(table, ORG_DESIGN.positionIdField),
        dltFields,
    };
}

export function resolveNotesConfig(table, ORG_DESIGN) {
    if (!table) return null;
    return {
        keyField: findFieldByName(table, ORG_DESIGN.notesKeyField),
        subtitleField: findFieldByName(table, ORG_DESIGN.notesSubtitleField),
        peopleImpactField: findFieldByName(table, ORG_DESIGN.notesPeopleImpactField),
        ambitionField: findFieldByName(table, ORG_DESIGN.notesAmbitionField),
    };
}

export function buildNotesMap(records, cfg) {
    const map = {};
    if (!cfg || !cfg.keyField) return map;
    records.forEach(r => {
        const key = readText(r, cfg.keyField).trim();
        if (!key) return;
        map[normName(key)] = {
            subtitle: readText(r, cfg.subtitleField),
            peopleImpact: readText(r, cfg.peopleImpactField),
            ambition: readText(r, cfg.ambitionField),
        };
    });
    return map;
}

// ─── Model ───────────────────────────────────────────────────────────────────

// A slot is keyed by position + country, so the same role in two countries
// stays two slots (each with its own flag chips) rather than merging.
function slotKey(pos, country) {
    return `${normName(pos)}||${normName(country)}`;
}

const emptySlot = (pos, country, posId) => ({
    pos, country, posId,
    current: 0, future: 0, curFuture: 0,
    currentFte: 0, futureFte: 0, curFutureFte: 0,
    riskCur: 0, selCur: 0, mapCur: 0,
    selFut: 0, mapFut: 0, postFut: 0,
});

export function buildStackedModel(records, cfg, notesMap = {}) {
    const {slideTitleField, sectionNameField, sectionLevelField, levelField,
        orgField, positionField, currentField, futureField, fteField,
        countryField, stackField, statusField, positionIdField, dltFields} = cfg;

    if (!slideTitleField || !levelField || !orgField || !positionField) {
        return {slides: [], dltLabels: [], unresolved: true};
    }

    const bySlide = new Map();

    records.forEach(record => {
        const slideTitle = readText(record, slideTitleField).trim();
        if (!slideTitle) return;
        const level = readText(record, levelField).trim();
        const org = readText(record, orgField).trim();
        const pos = readText(record, positionField).trim();
        if (!level || !org || !pos) return;

        const country = readText(record, countryField);
        const stack = readText(record, stackField).toLowerCase().trim();
        // A blank Stack means the row counts on both sides — that is how the
        // source decks encode "unchanged", and dropping it would empty them.
        const isCurrentRow = !stack || stack.includes('current');
        const isFutureRow = !stack || stack.includes('future');

        const current = Math.max(0, readNumber(record, currentField));
        const future = Math.max(0, readNumber(record, futureField));
        // FTE is a weight, scaled by headcount presence, so an FTE diff mirrors
        // the headcount diff instead of drifting from it.
        const fteRaw = fteField ? readNumber(record, fteField) : 0;
        const currentFte = current > 0 ? fteRaw : 0;
        const futureFte = future > 0 ? fteRaw : 0;

        const bucket = bucketForStatus(readText(record, statusField));
        const dltPath = {};
        dltFields.forEach(d => { dltPath[d.name] = readText(record, d.field).trim(); });

        const sKey = normName(slideTitle);
        if (!bySlide.has(sKey)) {
            bySlide.set(sKey, {
                slideTitle,
                sectionName: readText(record, sectionNameField).trim(),
                sectionLevel: readText(record, sectionLevelField).trim(),
                dltPath,
                levels: new Map(),
                records: [],
            });
        }
        const slide = bySlide.get(sKey);
        if (!slide.sectionName) slide.sectionName = readText(record, sectionNameField).trim();
        if (!slide.sectionLevel) slide.sectionLevel = readText(record, sectionLevelField).trim();
        slide.records.push(record);

        const lKey = normName(level);
        if (!slide.levels.has(lKey)) slide.levels.set(lKey, {level, orgs: new Map()});
        const lvl = slide.levels.get(lKey);

        const oKey = normName(org);
        if (!lvl.orgs.has(oKey)) lvl.orgs.set(oKey, {org, dltPath, slots: new Map()});
        const orgObj = lvl.orgs.get(oKey);

        const pKey = slotKey(pos, country);
        if (!orgObj.slots.has(pKey)) {
            orgObj.slots.set(pKey, emptySlot(pos, country, readText(record, positionIdField)));
        }
        const slot = orgObj.slots.get(pKey);
        slot.record = slot.record || record;

        if (isCurrentRow) {
            slot.current += current;
            slot.curFuture += future;
            slot.currentFte += currentFte;
            slot.curFutureFte += futureFte;
        }
        if (isFutureRow) {
            slot.future += future;
            slot.futureFte += futureFte;
        }
        if (bucket) {
            if (isCurrentRow) {
                if (bucket === 'risk') slot.riskCur += current;
                else if (bucket === 'selection') slot.selCur += current;
                else if (bucket === 'mapped') slot.mapCur += current;
            }
            if (isFutureRow) {
                if (bucket === 'selection') slot.selFut += future;
                else if (bucket === 'mapped') slot.mapFut += future;
                else if (bucket === 'posted') slot.postFut += future;
            }
        }
    });

    // Materialise the maps into sorted arrays and roll totals up each level.
    const slides = [...bySlide.values()].map(slide => {
        const levels = [...slide.levels.values()]
            .sort((a, b) => dltRank(a.level) - dltRank(b.level) || a.level.localeCompare(b.level))
            .map(lvl => ({
                level: lvl.level,
                orgs: [...lvl.orgs.values()]
                    .map(o => ({
                        org: o.org,
                        dltPath: o.dltPath,
                        slots: [...o.slots.values()].sort((a, b) => a.pos.localeCompare(b.pos)),
                    }))
                    .sort((a, b) => a.org.localeCompare(b.org)),
            }));

        const totals = {
            current: 0, future: 0, curFuture: 0,
            riskCur: 0, selCur: 0, mapCur: 0, selFut: 0, mapFut: 0, postFut: 0,
        };
        levels.forEach(l => l.orgs.forEach(o => o.slots.forEach(s => {
            totals.current += s.current;
            totals.future += s.future;
            totals.curFuture += s.curFuture;
            totals.riskCur += s.riskCur;
            totals.selCur += s.selCur;
            totals.mapCur += s.mapCur;
            totals.selFut += s.selFut;
            totals.mapFut += s.mapFut;
            totals.postFut += s.postFut;
        })));

        return {
            slideTitle: slide.slideTitle,
            sectionName: slide.sectionName,
            sectionLevel: slide.sectionLevel,
            dltPath: slide.dltPath,
            notes: notesMap[normName(slide.slideTitle)] || null,
            levels,
            totals,
        };
    }).sort((a, b) => a.slideTitle.localeCompare(b.slideTitle));

    const dltLabels = dltFields.map(d => d.name);
    return {slides, dltLabels, unresolved: false};
}

// "DLT" ranks above "DLT-1", which ranks above "DLT-2", …
export function dltRank(label) {
    const m = String(label || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

// ─── Mode helpers ────────────────────────────────────────────────────────────

// Does this slot appear on the given side at all?
export function slotMatchesMode(slot, mode) {
    return mode === 'current' ? slot.current > 0 : slot.future > 0;
}

// The number printed on a slot. On the current side that is the *outcome* of
// the current population (curFuture), which is what makes the red "−N" badge
// meaningful; on the future side it is simply the future headcount.
export function slotValue(slot, mode, countMode) {
    const fte = countMode === 'fte';
    if (mode === 'current') {
        return fte
            ? (slot.curFutureFte != null ? slot.curFutureFte : slot.futureFte)
            : (slot.curFuture != null ? slot.curFuture : slot.future);
    }
    return fte ? slot.futureFte : slot.future;
}

export function slotBase(slot, mode, countMode) {
    const fte = countMode === 'fte';
    if (mode === 'current') return fte ? slot.currentFte : slot.current;
    return fte ? slot.currentFte : slot.current;
}

// The status bucket that decides a slot's colour on this side.
export function slotBucket(slot, mode) {
    if (mode === 'current') {
        if (slot.riskCur > 0) return 'risk';
        if (slot.selCur > 0) return 'selection';
        return slot.mapCur > 0 ? 'mapped' : null;
    }
    if (slot.postFut > 0) return 'posted';
    if (slot.selFut > 0) return 'selection';
    return slot.mapFut > 0 ? 'mapped' : null;
}

// KPI row for a whole slide (the "Org" row in the deck's KPI table).
export function computeKpis(totals, mode) {
    const t = totals || {};
    if (mode === 'current') {
        return {
            asIs: (t.riskCur || 0) + (t.selCur || 0) + (t.mapCur || 0),
            impacted: t.riskCur || 0,
            newPos: 0,
            toBe: (t.mapCur || 0) + (t.selCur || 0),
            total: t.curFuture || 0,
        };
    }
    return {
        asIs: (t.selFut || 0) + (t.mapFut || 0) + (t.postFut || 0),
        impacted: 0,
        newPos: t.postFut || 0,
        toBe: (t.mapFut || 0) + (t.selFut || 0) + (t.postFut || 0),
        total: t.future || 0,
    };
}

// KPI row for one rendered page (the "Slide" row), aggregated from its slots.
export function computePageKpis(pageLevels, mode) {
    const t = {
        current: 0, future: 0, curFuture: 0,
        riskCur: 0, selCur: 0, mapCur: 0, selFut: 0, mapFut: 0, postFut: 0,
    };
    (pageLevels || []).forEach(l => (l.orgs || []).forEach(o => (o.slots || []).forEach(s => {
        if (!slotMatchesMode(s, mode)) return;
        t.current += s.current;
        t.future += s.future;
        t.curFuture += s.curFuture;
        t.riskCur += s.riskCur;
        t.selCur += s.selCur;
        t.mapCur += s.mapCur;
        t.selFut += s.selFut;
        t.mapFut += s.mapFut;
        t.postFut += s.postFut;
    })));
    return computeKpis(t, mode);
}

// ─── Layout & pagination ─────────────────────────────────────────────────────
//
// Ported from the Apps Script so a rendered slide breaks in the same places
// the deck does. Slots stack three to a column; three columns make a band; a
// cluster is as wide as its bands.

export const LAYOUT = {
    slotH: 48, slotGap: 6, orgHead: 22, orgPad: 12, orgBorder: 2,
    clusterGap: 8, colW: 180, colGap: 10, levelGap: 10,
    // A single-side slide gives the clusters the full content width; the
    // side-by-side slide splits it, so its rows wrap sooner.
    sideW: 1178, splitSideW: 578,
    availH: 450,
};

// Which side(s) a view counts. 'both' is the side-by-side slide: an org is
// visible if it appears on either side, and its height is the taller of the two.
export function visibleOnSide(slot, mode) {
    if (mode === 'both') return slot.current > 0 || slot.future > 0;
    return slotMatchesMode(slot, mode);
}

export function clusterWidth(totalCols) {
    if (!totalCols) return 0;
    const c = Math.min(3, totalCols);
    return c * LAYOUT.colW + (c - 1) * LAYOUT.colGap + 2 * 6 + 2;
}

export function estimateOrgHeight(slotCount) {
    if (slotCount === 0) return 0;
    const cols = Math.max(1, Math.ceil(slotCount / 3));
    const colsPerBand = Math.min(3, cols);
    const bands = Math.ceil(cols / colsPerBand);
    let bodyH = 0;
    for (let b = 0; b < bands; b++) {
        const colsThisBand = Math.min(colsPerBand, cols - b * colsPerBand);
        let maxCol = 0;
        for (let c = 0; c < colsThisBand; c++) {
            const start = (b * colsPerBand + c) * 3;
            const n = Math.min(3, slotCount - start);
            if (n <= 0) break;
            maxCol = Math.max(maxCol, n * LAYOUT.slotH + (n - 1) * LAYOUT.slotGap);
        }
        bodyH += maxCol;
        if (b < bands - 1) bodyH += LAYOUT.slotGap;
    }
    return LAYOUT.orgHead + LAYOUT.orgPad + bodyH + LAYOUT.orgBorder;
}

// Greedily pack clusters into rows no wider than the slide's content area.
export function layoutOrgRows(orgs, maxWidth = LAYOUT.sideW) {
    const items = orgs.map(o => {
        const n = (o.slots || []).length;
        return {org: o, w: clusterWidth(Math.max(1, Math.ceil(n / 3))), h: estimateOrgHeight(n)};
    });
    const rows = [];
    let row = [], width = 0;
    items.forEach(d => {
        if (row.length && width + LAYOUT.clusterGap + d.w > maxWidth) {
            rows.push(row);
            row = [d];
            width = d.w;
        } else {
            if (row.length) width += LAYOUT.clusterGap;
            row.push(d);
            width += d.w;
        }
    });
    if (row.length) rows.push(row);
    return rows;
}

const rowHeight = row => row.reduce((mx, d) => Math.max(mx, d.h), 0);

// For the side-by-side slide, pack against whichever side wraps first and size
// each row by the taller of the two — the level band is as tall as its worst
// side, so paginating on the current side alone would overflow the canvas.
function layoutOrgRowsSplit(orgs, maxWidth) {
    const perSide = ['current', 'future'].map(mode =>
        layoutOrgRows(
            orgs.filter(o => o.slots.some(s => slotMatchesMode(s, mode)))
                .map(o => ({...o, slots: o.slots.filter(s => slotMatchesMode(s, mode))})),
            maxWidth,
        ));
    const rowCount = Math.max(...perSide.map(rows => rows.length), 0);
    const merged = [];
    for (let i = 0; i < rowCount; i++) {
        const h = Math.max(...perSide.map(rows => (rows[i] ? rowHeight(rows[i]) : 0)));
        // Carry the unfiltered orgs through: the renderer re-filters per side.
        const orgsInRow = new Set();
        perSide.forEach(rows => (rows[i] || []).forEach(d => orgsInRow.add(d.org.org)));
        merged.push([...orgsInRow]
            .map(name => orgs.find(o => o.org === name))
            .filter(Boolean)
            .map(org => ({org, h})));
    }
    return merged;
}

// Split a slide's levels into pages that each fit the slide canvas.
//
// `mode` is 'current', 'future', or 'both' (the side-by-side slide). In 'both'
// the slots are NOT filtered — each side filters as it renders — so the height
// estimate is the worst case of the two, which is what has to fit.
//
// Packing is per ROW, not per level band: a level whose clusters wrap onto
// several rows can continue on the next page (its label simply repeats), which
// keeps pages full instead of pushing a whole tall band onto a page of its own.
export function paginateLevels(slideLevels, mode) {
    const split = mode === 'both';
    const maxWidth = split ? LAYOUT.splitSideW : LAYOUT.sideW;

    // Flatten to [{level, orgs, h}] — one entry per rendered cluster row.
    const units = [];
    (slideLevels || []).forEach(lvl => {
        const orgs = (lvl.orgs || [])
            .map(o => (split ? o : {...o, slots: o.slots.filter(s => slotMatchesMode(s, mode))}))
            .filter(o => o.slots.some(s => visibleOnSide(s, mode)));
        if (!orgs.length) return;
        const rows = split
            ? layoutOrgRowsSplit(orgs, maxWidth)
            : layoutOrgRows(orgs, maxWidth);
        rows.forEach(row => units.push({
            level: lvl.level,
            orgs: row.map(d => d.org),
            h: rowHeight(row),
        }));
    });

    const pages = [];
    let page = [], pageH = 0;
    const flush = () => { if (page.length) pages.push(page); page = []; pageH = 0; };

    units.forEach(unit => {
        // A single row taller than the canvas still gets its own page — better
        // a clipped page than an infinite loop.
        const gap = page.length ? LAYOUT.levelGap : 0;
        if (page.length && pageH + gap + unit.h > LAYOUT.availH) flush();
        // Merge into the previous band on this page when it's the same level,
        // so consecutive rows render under one label.
        const last = page[page.length - 1];
        if (last && last.level === unit.level) {
            last.orgs = last.orgs.concat(unit.orgs);
        } else {
            page.push({level: unit.level, orgs: unit.orgs.slice()});
        }
        pageH += (page.length ? gap : 0) + unit.h;
    });
    flush();

    return pages;
}

// ─── Filter tree (DLT → DLT-1 → … → supervisory org) ─────────────────────────
//
// One node per distinct value at each DLT level, nested by the path the rows
// actually take. Leaves are slide titles, which is what the filter selects.

export function buildFilterTree(slides, dltLabels) {
    const root = {label: '', children: new Map(), slideTitles: new Set()};
    slides.forEach(slide => {
        const path = dltLabels
            .map(l => (slide.dltPath && slide.dltPath[l] ? slide.dltPath[l].trim() : ''))
            .filter(Boolean);
        let node = root;
        node.slideTitles.add(slide.slideTitle);
        path.forEach((value, depth) => {
            if (!node.children.has(value)) {
                node.children.set(value, {
                    label: value,
                    level: dltLabels[depth],
                    children: new Map(),
                    slideTitles: new Set(),
                });
            }
            node = node.children.get(value);
            node.slideTitles.add(slide.slideTitle);
        });
    });

    const toArray = node => ({
        label: node.label,
        level: node.level,
        slideTitles: [...node.slideTitles],
        children: [...node.children.values()]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(toArray),
    });
    return toArray(root).children;
}
