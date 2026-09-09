// Metrics behind the People Impact, Savings and Works Council views.
//
// All three read the same stacked org-design model (slides → levels → orgs →
// slots) that the deck renders, so a number shown on a dashboard and the same
// number on a slide can never disagree — they are the same aggregation.
//
// One subtlety worth stating up front: an org appears on several slides (a
// DLT-1 function slide and again on its DLT-2 detail slide). Summing slides
// would multiply-count it. Everything here therefore aggregates over the
// DEDUPLICATED set of (org, position, country) slots, keyed the same way the
// model keys them.

import {RATE_CARD, WORKS_COUNCIL} from '../config';

// Collapse the slide-partitioned model into one row per (level, org, position,
// country). Slides overlap by design; this is the set to do arithmetic on.
export function flattenSlots(model) {
    const seen = new Map();
    (model.slides || []).forEach(slide => {
        slide.levels.forEach(level => {
            level.orgs.forEach(org => {
                org.slots.forEach(slot => {
                    const key = `${level.level}||${org.org}||${slot.pos}||${slot.country}`;
                    // First writer wins: the same slot on a second slide carries
                    // identical figures, so overwriting would be a no-op anyway.
                    if (!seen.has(key)) {
                        seen.set(key, {...slot, level: level.level, org: org.org});
                    }
                });
            });
        });
    });
    return [...seen.values()];
}

// Primary country for a slot. The source stores a list ("CHE, DEU"); costing
// and consultation both need one, so the first is used and the rest are kept
// for display. Flagged rather than hidden — a multi-country slot is a modelling
// simplification, not a fact.
export function primaryCountry(slot) {
    const codes = String(slot.country || '')
        .split(/[;,]/).map(s => s.trim().toUpperCase()).filter(Boolean);
    return {primary: codes[0] || '', all: codes, split: codes.length > 1};
}

// ─── People impact ───────────────────────────────────────────────────────────

export function peopleImpact(model) {
    const slots = flattenSlots(model);

    const totals = {
        current: 0, future: 0, curFuture: 0,
        mapped: 0, selection: 0, posted: 0, risk: 0,
        multiCountrySlots: 0,
    };
    const byOrg = new Map();
    const byCountry = new Map();
    const byLevel = new Map();

    const bump = (map, key, patch) => {
        if (!key) return;
        const row = map.get(key) || {
            key, current: 0, future: 0, curFuture: 0,
            mapped: 0, selection: 0, posted: 0, risk: 0,
        };
        Object.entries(patch).forEach(([k, v]) => { row[k] += v; });
        map.set(key, row);
    };

    slots.forEach(slot => {
        const {primary, split} = primaryCountry(slot);
        if (split) totals.multiCountrySlots += 1;

        const patch = {
            current: slot.current,
            future: slot.future,
            // The outcome of today's population once the change lands. The gap
            // between `current` and this is the actual position reduction.
            curFuture: slot.curFuture,
            mapped: slot.mapFut,
            selection: slot.selFut,
            posted: slot.postFut,
            risk: slot.riskCur,
        };
        Object.entries(patch).forEach(([k, v]) => { totals[k] += v; });
        bump(byOrg, slot.org, patch);
        bump(byCountry, primary, patch);
        bump(byLevel, slot.level, patch);
    });

    const rank = map => [...map.values()].sort((a, b) => b.current - a.current || a.key.localeCompare(b.key));

    // The change bridge.
    //
    // The reduction is `current - curFuture`, NOT the at-risk count. "At risk"
    // is the POPULATION whose roles are in scope; some of them are redeployed
    // into surviving or new roles, so fewer positions come out than people are
    // affected. Using the at-risk figure here makes the bridge miss by exactly
    // the number of people redeployed, which then reads as a data-quality fault
    // when it is nothing of the kind.
    const removed = totals.current - totals.curFuture;
    const explained = totals.current - removed + totals.posted;
    const bridge = {
        current: totals.current,
        removed,
        posted: totals.posted,
        future: totals.future,
        // People affected minus positions actually removed: the redeployment.
        redeployed: totals.risk - removed,
        risk: totals.risk,
        residual: totals.future - explained,
    };

    return {
        slots,
        totals,
        bridge,
        byOrg: rank(byOrg),
        byCountry: rank(byCountry),
        byLevel: [...byLevel.values()].sort((a, b) => a.key.localeCompare(b.key)),
        impacted: totals.risk + totals.selection,
        netChange: totals.future - totals.current,
    };
}

// ─── Savings ─────────────────────────────────────────────────────────────────

export function costPerFte(slot) {
    const {primary} = primaryCountry(slot);
    const base = RATE_CARD.byCountry[primary] ?? RATE_CARD.defaultCostPerFte;
    const uplift = RATE_CARD.levelUplift[slot.level] ?? RATE_CARD.defaultUplift;
    return base * uplift;
}

export function savings(model) {
    const slots = flattenSlots(model);

    let currentCost = 0;
    let futureCost = 0;
    let severance = 0;
    let recruitment = 0;
    let transition = 0;
    let riskFte = 0;
    let postedFte = 0;
    const byOrg = new Map();
    const byCountry = new Map();

    slots.forEach(slot => {
        const rate = costPerFte(slot);
        const cur = slot.current * rate;
        const fut = slot.future * rate;
        currentCost += cur;
        futureCost += fut;

        // One-off costs attach to the people actually moving, not to headcount
        // at large: severance to the at-risk population, recruitment to newly
        // posted roles, transition cost to everyone whose role changes.
        severance += slot.riskCur * rate * (RATE_CARD.severanceMonths / 12);
        recruitment += slot.postFut * RATE_CARD.recruitmentCostPerHire;
        transition += (slot.riskCur + slot.selFut + slot.postFut) * RATE_CARD.transitionCostPerFte;
        riskFte += slot.riskCur;
        postedFte += slot.postFut;

        const {primary} = primaryCountry(slot);
        [[byOrg, slot.org], [byCountry, primary]].forEach(([map, key]) => {
            if (!key) return;
            const row = map.get(key) || {key, current: 0, future: 0, saving: 0, headcount: 0};
            row.current += cur;
            row.future += fut;
            row.saving += cur - fut;
            row.headcount += slot.current;
            map.set(key, row);
        });
    });

    const grossAnnual = currentCost - futureCost;
    const oneOff = severance + recruitment + transition;
    const netYearOne = grossAnnual - oneOff;
    // Only meaningful when the change actually saves money; a cost-increasing
    // design has no payback period and must not render as a huge or negative one.
    const paybackMonths = grossAnnual > 0 ? (oneOff / (grossAnnual / 12)) : null;

    const rank = map => [...map.values()].sort((a, b) => b.saving - a.saving || a.key.localeCompare(b.key));

    return {
        currentCost, futureCost, grossAnnual, oneOff, netYearOne, paybackMonths,
        severance, recruitment, transition, riskFte, postedFte,
        byOrg: rank(byOrg),
        byCountry: rank(byCountry),
        assumptions: RATE_CARD,
    };
}

// ─── Works council ───────────────────────────────────────────────────────────

export function worksCouncil(model) {
    const impact = peopleImpact(model);

    const rows = impact.byCountry
        .filter(row => row.key)
        .map(row => {
            const rule = WORKS_COUNCIL.byCountry[row.key] || {
                body: WORKS_COUNCIL.defaultBody,
                noticeWeeks: WORKS_COUNCIL.defaultNoticeWeeks,
                threshold: WORKS_COUNCIL.defaultThreshold,
                thresholdPct: WORKS_COUNCIL.defaultThresholdPct,
            };
            const affected = row.risk + row.selection;
            // The duty bites at the LOWER of the absolute floor and the
            // percentage of local headcount, so a small site is not silently
            // exempt. At least one person must be affected either way.
            const pctThreshold = Math.max(1, Math.ceil((rule.thresholdPct || 0) * row.current));
            const effectiveThreshold = Math.min(rule.threshold, pctThreshold);
            const consultationRequired = affected >= effectiveThreshold;
            return {
                country: row.key,
                body: rule.body,
                noticeWeeks: rule.noticeWeeks,
                threshold: effectiveThreshold,
                thresholdAbs: rule.threshold,
                thresholdPct: rule.thresholdPct,
                headcount: row.current,
                affected,
                atRisk: row.risk,
                inSelection: row.selection,
                newRoles: row.posted,
                consultationRequired,
                obligation: consultationRequired ? 'Consultation' : 'Information',
            };
        })
        .sort((a, b) => b.affected - a.affected || a.country.localeCompare(b.country));

    return {
        rows,
        totalAffected: rows.reduce((n, r) => n + r.affected, 0),
        consultingCountries: rows.filter(r => r.consultationRequired).length,
        longestNoticeWeeks: rows.reduce(
            (n, r) => (r.consultationRequired ? Math.max(n, r.noticeWeeks) : n), 0),
    };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function fmtMoney(v, currency = RATE_CARD.currency, compact = true) {
    const n = Number(v || 0);
    if (compact && Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}m`;
    if (compact && Math.abs(n) >= 1_000) return `${currency} ${Math.round(n / 1000)}k`;
    return `${currency} ${Math.round(n).toLocaleString()}`;
}

export function fmtNum(v, digits = 0) {
    const n = Number(v || 0);
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(undefined, {minimumFractionDigits: digits, maximumFractionDigits: digits});
}
