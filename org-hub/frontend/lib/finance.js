// The money over time: when the benefit actually lands, what it is worth
// today, and how the answer moves if the assumptions are wrong.
//
// `savings()` in orgMetrics.js answers "what does the target state cost once we
// are in it?". That is a run-rate — a single annual number that silently
// assumes the change is already complete. It is the right number for the
// bridge and the wrong number for a CFO, because it hides the two things that
// decide whether a change is worth doing: the benefit arrives gradually, and
// the cost of getting there is committed before any of it shows up.
//
// So everything here is built on a monthly cash flow rather than on an annual
// figure scaled up and down.

import {RATE_CARD, FINANCE} from '../config';

// Annual rate → monthly, compounded. Dividing by twelve overstates the
// discount, and over a three-year horizon the error is not cosmetic.
export function monthlyRate(annual) {
    return Math.pow(1 + annual, 1 / 12) - 1;
}

// What fraction of the full run-rate benefit is being earned in month `m`.
// Zero before the ramp starts, one after it ends, linear in between.
export function benefitFraction(m, startMonth, endMonth) {
    if (m < startMonth) return 0;
    if (m >= endMonth) return 1;
    const span = endMonth - startMonth;
    if (span <= 0) return 1;
    return (m - startMonth) / span;
}

// The monthly cash flow of one scenario.
//
// `grossAnnual` is the fully-realised annual run-rate benefit; `oneOff` is the
// total cost of executing. Returns one row per month plus the derived headline
// numbers, so every number downstream traces back to the same series.
export function cashflow({grossAnnual, oneOff}, opts = {}) {
    const horizon = opts.horizonMonths ?? FINANCE.horizonMonths;
    const rampStart = (opts.benefitRampStartMonth ?? FINANCE.benefitRampStartMonth)
        + (opts.rampShiftMonths || 0);
    const rampEnd = (opts.benefitRampEndMonth ?? FINANCE.benefitRampEndMonth)
        + (opts.rampShiftMonths || 0);
    const spread = Math.max(1, opts.oneOffSpreadMonths ?? FINANCE.oneOffSpreadMonths);
    const rM = monthlyRate(opts.discountRateAnnual ?? FINANCE.discountRateAnnual);

    const months = [];
    let cumulative = 0;
    let npv = 0;

    for (let m = 1; m <= horizon; m++) {
        const benefit = (grossAnnual / 12) * benefitFraction(m, rampStart, rampEnd);
        // One-off cost is committed evenly across the spread window, starting
        // immediately — it is the price of starting, not of finishing.
        const cost = m <= spread ? oneOff / spread : 0;
        const net = benefit - cost;
        cumulative += net;
        npv += net / Math.pow(1 + rM, m);
        months.push({month: m, benefit, cost, net, cumulative});
    }

    return {
        months,
        npv,
        // First twelve months of the ACTUAL flow. The run-rate shortcut
        // (grossAnnual − oneOff) answers a different question — it assumes the
        // benefit runs at full rate from day one — and the two were showing up
        // under the same label in different places.
        netYearOne: months.slice(0, 12).reduce((n, r) => n + r.net, 0),
        // Undiscounted payback, read off the cumulative series rather than
        // computed as oneOff / (grossAnnual / 12). That shortcut assumes the
        // benefit is running at full rate from month one, which is exactly the
        // assumption the ramp exists to remove — it flatters payback.
        paybackMonths: crossingMonth(months),
        cumulativeAtHorizon: cumulative,
        // What a naive run-rate calculation would have claimed, kept so the view
        // can show the difference rather than quietly correcting it.
        naivePaybackMonths: grossAnnual > 0 ? oneOff / (grossAnnual / 12) : null,
        horizonMonths: horizon,
    };
}

// The month the cumulative position first turns positive, interpolated within
// the month so the number does not jump in whole months. null if it never does.
export function crossingMonth(months) {
    for (let i = 0; i < months.length; i++) {
        if (months[i].cumulative >= 0) {
            if (i === 0) return months[0].net > 0 ? 1 : 1;
            const prev = months[i - 1].cumulative;
            const step = months[i].cumulative - prev;
            if (step <= 0) return months[i].month;
            return months[i - 1].month + (-prev / step);
        }
    }
    return null;
}

// Baseline (today) against the designed target state, as rows a reader can
// scan. Every row is a real measured quantity — nothing here is an estimate on
// top of an estimate.
export function baselineVsScenario(impact, money) {
    const b = impact.totals;
    const costPer = (cost, heads) => (heads > 0 ? cost / heads : 0);

    const rows = [
        {
            key: 'positions', label: 'Positions',
            baseline: b.current, scenario: b.future, kind: 'count',
        },
        {
            key: 'runrate', label: 'Run-rate cost', unit: RATE_CARD.currency,
            baseline: money.currentCost, scenario: money.futureCost, kind: 'money',
        },
        {
            // Neutral on purpose: a rising average is what you expect when a
            // reduction takes out proportionally more junior roles. It is worth
            // seeing, but it is not a failure, and colouring it red says it is.
            key: 'costper', label: 'Average cost per position', unit: RATE_CARD.currency,
            baseline: costPer(money.currentCost, b.current),
            scenario: costPer(money.futureCost, b.future),
            kind: 'money', neutral: true,
        },
    ];

    return rows.map(r => {
        const delta = r.scenario - r.baseline;
        return {...r, delta, deltaPct: r.baseline ? (delta / r.baseline) * 100 : 0};
    });
}

// The same design, varied. Each variant scales the modelled change — it is NOT
// a separately designed target state, and the view says so. Scaling the scope
// scales the run-rate benefit and the severance with it (fewer exits cost less
// to execute), while recruitment and transition are left alone because they
// attach to the new roles, which the scope lever does not move.
export function variant(money, v) {
    const scope = v.scope ?? 1;
    const grossAnnual = money.grossAnnual * scope;
    const severance = money.severance * scope * (v.severanceFactor ?? 1);
    const oneOff = severance + money.recruitment + money.transition;
    const flow = cashflow({grossAnnual, oneOff}, {rampShiftMonths: v.rampShiftMonths || 0});
    return {
        ...v,
        grossAnnual,
        oneOff,
        severance,
        netYearOne: flow.netYearOne,
        paybackMonths: flow.paybackMonths,
        npv: flow.npv,
        cumulativeAtHorizon: flow.cumulativeAtHorizon,
        flow,
    };
}

export function variants(money, list = FINANCE.variants) {
    return list.map(v => variant(money, v));
}

// One-at-a-time swings, reported against the designed case. Each returns the
// better and worse side so the reader sees the span, not a single direction.
export function sensitivity(money, list = FINANCE.sensitivities) {
    const base = variant(money, {key: 'base', scope: 1, rampShiftMonths: 0, severanceFactor: 1});

    const apply = (key, signedDelta) => {
        switch (key) {
        // A different cost per FTE moves the benefit and the severance together
        // — both are priced off the same rate card.
        case 'costPerFte':
            return variant({...money,
                grossAnnual: money.grossAnnual * (1 + signedDelta),
                severance: money.severance * (1 + signedDelta)},
            {scope: 1, rampShiftMonths: 0, severanceFactor: 1});
        case 'severanceMonths':
            return variant(money, {scope: 1, rampShiftMonths: 0, severanceFactor: 1 + signedDelta});
        case 'scope':
            return variant(money, {scope: 1 + signedDelta, rampShiftMonths: 0, severanceFactor: 1});
        // Timing moves in months, not percent: a positive delta means later.
        case 'ramp':
            return variant(money, {scope: 1, severanceFactor: 1,
                rampShiftMonths: Math.round(signedDelta * 12)});
        default:
            return base;
        }
    };

    return list.map(s => {
        const up = apply(s.key, s.delta);
        const down = apply(s.key, -s.delta);
        const spread = [up.netYearOne, down.netYearOne];
        return {
            ...s,
            base: base.netYearOne,
            best: Math.max(...spread),
            worst: Math.min(...spread),
            swing: Math.abs(spread[0] - spread[1]),
            paybackBest: Math.min(
                up.paybackMonths ?? Infinity, down.paybackMonths ?? Infinity),
            paybackWorst: Math.max(
                up.paybackMonths ?? Infinity, down.paybackMonths ?? Infinity),
        };
    // Biggest exposure first: that is the assumption worth arguing about.
    }).sort((a, b) => b.swing - a.swing);
}

export function fmtMonths(m) {
    if (m == null || !isFinite(m)) return 'never';
    if (m < 12) return `${m.toFixed(1)} mo`;
    return `${(m / 12).toFixed(1)} yr`;
}
