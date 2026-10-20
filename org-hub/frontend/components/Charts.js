// Chart primitives for the impact views.
//
// Deliberately dependency-free: every form here is a small ranked list, a
// bridge, or a ring. A charting library would add ~150kb to the bundle to draw
// rectangles. Each mark carries a visible label and value, which is also what
// relieves the one sub-3:1 colour in the palette.

import {useState, useRef, useCallback} from 'react';
import {VIZ} from '../config';
import {fmtNum} from '../lib/orgMetrics';

// ─── Stat tile ───────────────────────────────────────────────────────────────
//
// A hero number. `trend` is a signed delta rendered as its own chip; `spark` is
// an optional array of magnitudes drawn as a baseline-anchored micro bar chart.

export function StatTile({label, value, sub, trend, tone, spark, accent}) {
    const max = spark && spark.length ? Math.max(...spark, 1) : 1;
    return (
        <div className={`tile${tone ? ` tile-${tone}` : ''}`}>
            <div className="tile-glow" style={accent ? {background: accent} : undefined} />
            <div className="tile-label">{label}</div>
            <div className="tile-value">{value}</div>
            <div className="tile-foot">
                {sub && <span className="tile-sub">{sub}</span>}
                {trend != null && trend !== 0 && (
                    <span className={`tile-trend ${trend > 0 ? 'up' : 'down'}`}>
                        {trend > 0 ? '▲' : '▼'} {fmtNum(Math.abs(trend))}
                    </span>
                )}
            </div>
            {spark && spark.length > 1 && (
                <div className="tile-spark" aria-hidden="true">
                    {spark.map((v, i) => (
                        <span key={i} style={{height: `${Math.max(6, (v / max) * 100)}%`}} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Bar list ────────────────────────────────────────────────────────────────
//
// rows: [{label, value, color?, segments?}]
// `segments` turns a row into a stacked bar: [{value, color, label}]. Segments
// are separated by a 2px surface gap so adjacent fills never blend into one.

export function BarList({title, subtitle, rows, limit = 8, unit = '', format = fmtNum, legend}) {
    const [expanded, setExpanded] = useState(false);
    const [hover, setHover] = useState(null);
    const shown = expanded ? rows : rows.slice(0, limit);
    const max = Math.max(...rows.map(r => (r.segments
        ? r.segments.reduce((n, s) => n + s.value, 0)
        : r.value)), 1);

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">{title}</div>
                    {subtitle && <div className="panel-sub">{subtitle}</div>}
                </div>
                {rows.length > limit && (
                    <button className="panel-more" onClick={() => setExpanded(v => !v)}>
                        {expanded ? `Top ${limit}` : `All ${rows.length}`}
                    </button>
                )}
            </div>

            {legend && (
                <div className="chart-legend">
                    {legend.map(l => (
                        <span key={l.label} className="chart-legend-item">
                            <span className="chart-legend-dot" style={{background: l.color}} />
                            {l.label}
                        </span>
                    ))}
                </div>
            )}

            {rows.length === 0 && <div className="panel-empty">No data</div>}

            <div className="bars">
                {shown.map(r => {
                    const total = r.segments ? r.segments.reduce((n, s) => n + s.value, 0) : r.value;
                    return (
                        <div
                            key={r.label}
                            className={`bar-row${hover === r.label ? ' hot' : ''}`}
                            onMouseEnter={() => setHover(r.label)}
                            onMouseLeave={() => setHover(null)}
                        >
                            <span className="bar-label" title={r.label}>{r.label}</span>
                            <span className="bar-track">
                                {r.segments ? r.segments.map((s, i) => (
                                    s.value > 0 && (
                                        <span
                                            key={i}
                                            className="bar-seg"
                                            style={{
                                                width: `${(s.value / max) * 100}%`,
                                                background: s.color,
                                            }}
                                            title={`${s.label}: ${format(s.value)}`}
                                        />
                                    )
                                )) : (
                                    <span
                                        className="bar-seg"
                                        style={{
                                            width: `${Math.max(1.5, (r.value / max) * 100)}%`,
                                            background: r.color || VIZ.magnitude,
                                        }}
                                    />
                                )}
                            </span>
                            <span className="bar-value">
                                {format(r.signedValue != null ? r.signedValue : total)}{unit}
                            </span>
                            {hover === r.label && r.segments && (
                                <div className="bar-tip">
                                    {r.segments.filter(s => s.value > 0).map(s => (
                                        <span key={s.label}>
                                            <i style={{background: s.color}} />
                                            {s.label}
                                            <b>{format(s.value)}</b>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Bridge (waterfall) ──────────────────────────────────────────────────────
//
// steps: [{label, value, kind}] where kind is 'base' | 'up' | 'down' | 'total'.
// Floating bars carry a connector to the next step so the eye follows the
// running total rather than comparing heights in isolation.

export function Bridge({title, subtitle, steps, format = fmtNum}) {
    const [hover, setHover] = useState(null);

    // Walk the steps to find each bar's floor, ceiling and the running total.
    let running = 0;
    const bars = steps.map(step => {
        if (step.kind === 'base' || step.kind === 'total') {
            const bar = {...step, from: 0, to: step.value, running: step.value};
            running = step.value;
            return bar;
        }
        const delta = step.kind === 'down' ? -Math.abs(step.value) : Math.abs(step.value);
        const from = running;
        running += delta;
        return {...step, from: Math.min(from, running), to: Math.max(from, running), running, delta};
    });

    const ceiling = Math.max(...bars.map(b => b.to), 1);

    const colorFor = kind => {
        if (kind === 'up') return VIZ.positive;
        if (kind === 'down') return VIZ.negative;
        return VIZ.magnitude;
    };

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">{title}</div>
                    {subtitle && <div className="panel-sub">{subtitle}</div>}
                </div>
            </div>
            <div className="bridge">
                {bars.map((b, i) => (
                    <div
                        key={b.label}
                        className={`bridge-col${hover === i ? ' hot' : ''}`}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                    >
                        <div className="bridge-plot">
                            <div
                                className={`bridge-bar ${b.kind}`}
                                style={{
                                    height: `${Math.max(2, ((b.to - b.from) / ceiling) * 100)}%`,
                                    bottom: `${(b.from / ceiling) * 100}%`,
                                    background: colorFor(b.kind),
                                }}
                            />
                            <span
                                className="bridge-link"
                                style={{bottom: `${(b.running / ceiling) * 100}%`}}
                            />
                            <span
                                className="bridge-mark"
                                style={{bottom: `${(b.to / ceiling) * 100}%`}}
                            >
                                {b.kind === 'up' ? '+' : b.kind === 'down' ? '−' : ''}
                                {format(b.kind === 'base' || b.kind === 'total' ? b.value : Math.abs(b.delta))}
                            </span>
                        </div>
                        <div className="bridge-label">{b.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Donut ring ──────────────────────────────────────────────────────────────
//
// segments: [{label, value, color}]. Drawn as one conic gradient — a pie chart
// is only defensible for a handful of parts of a whole, which is exactly this.

export function DonutRing({title, subtitle, segments, centerLabel, centerValue, format = fmtNum}) {
    const total = segments.reduce((n, s) => n + s.value, 0) || 1;
    let cursor = 0;
    const stops = segments.map(s => {
        const from = (cursor / total) * 360;
        cursor += s.value;
        const to = (cursor / total) * 360;
        return `${s.color} ${from}deg ${to}deg`;
    }).join(', ');

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">{title}</div>
                    {subtitle && <div className="panel-sub">{subtitle}</div>}
                </div>
            </div>
            <div className="donut-wrap">
                <div className="donut" style={{background: `conic-gradient(${stops})`}}>
                    <div className="donut-hole">
                        <span className="donut-value">{centerValue}</span>
                        <span className="donut-label">{centerLabel}</span>
                    </div>
                </div>
                <div className="donut-key">
                    {segments.map(s => (
                        <div key={s.label} className="donut-key-row">
                            <span className="donut-key-dot" style={{background: s.color}} />
                            <span className="donut-key-label">{s.label}</span>
                            <span className="donut-key-value">{format(s.value)}</span>
                            <span className="donut-key-pct">
                                {Math.round((s.value / total) * 100)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Count-up ────────────────────────────────────────────────────────────────
//
// Animates a number from 0 to `value` on mount. Used by the hero tiles and the
// export ceremony. Respects prefers-reduced-motion by jumping straight there.

export function useCountUp(value, duration = 900) {
    const [shown, setShown] = useState(0);
    const raf = useRef(0);
    const start = useCallback(() => {
        cancelAnimationFrame(raf.current);
        const reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !duration) { setShown(value); return; }
        const t0 = performance.now();
        const tick = now => {
            const p = Math.min(1, (now - t0) / duration);
            // Ease-out cubic: fast start, settles rather than stopping dead.
            setShown(value * (1 - Math.pow(1 - p, 3)));
            if (p < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
    }, [value, duration]);
    return [shown, start];
}

// ─── Cash curve ──────────────────────────────────────────────────────────────
//
// Cumulative cash position over the horizon. The job is "above or below the
// line, and when does it cross" — so the baseline is the zero line, the fill
// diverges around it, and the crossing is marked rather than left to be read
// off an axis. One series, so no legend: the title names it.
//
// The fill is split by a gradient with both stops at the zero offset rather
// than by clipping two paths, so the boundary lands exactly on zero at any
// aspect ratio.

export function CashCurve({title, subtitle, months, paybackMonths, format = fmtNum, horizonMonths}) {
    const id = useRef(`cc${Math.random().toString(36).slice(2, 9)}`).current;
    const [hover, setHover] = useState(null);

    if (!months || months.length === 0) {
        return (
            <div className="panel">
                <div className="panel-head"><div><div className="panel-title">{title}</div></div></div>
                <div className="panel-empty">No cash flow to show</div>
            </div>
        );
    }

    const W = 600, H = 170, PAD_L = 4, PAD_R = 4, PAD_T = 10, PAD_B = 4;
    const n = months.length;
    const values = months.map(m => m.cumulative);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const span = (max - min) || 1;

    const x = i => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L - PAD_R);
    const y = v => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);
    const zeroY = y(0);

    const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
    const zeroOffset = `${(((zeroY - PAD_T) / (H - PAD_T - PAD_B)) * 100).toFixed(2)}%`;

    const payX = paybackMonths != null && isFinite(paybackMonths)
        ? x(Math.min(n - 1, Math.max(0, paybackMonths - 1))) : null;

    const ticks = [12, 24, 36].filter(t => t <= (horizonMonths || n));
    const point = hover != null ? months[hover] : months[n - 1];

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">{title}</div>
                    {subtitle && <div className="panel-sub">{subtitle}</div>}
                </div>
                <div className="cc-readout">
                    <span className="cc-readout-month">Month {point.month}</span>
                    <span className={`cc-readout-value ${point.cumulative >= 0 ? 'pos' : 'neg'}`}>
                        {format(point.cumulative)}
                    </span>
                </div>
            </div>

            <div className="cash-curve">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
                    aria-label={`${title}: cumulative position reaches ${format(values[n - 1])} by month ${n}`}>
                    <defs>
                        <linearGradient id={id} x1="0" y1={PAD_T} x2="0" y2={H - PAD_B}
                            gradientUnits="userSpaceOnUse">
                            <stop offset={zeroOffset} stopColor={VIZ.positive} stopOpacity="0.20" />
                            <stop offset={zeroOffset} stopColor={VIZ.negative} stopOpacity="0.20" />
                        </linearGradient>
                    </defs>
                    <path d={area} fill={`url(#${id})`} />
                    <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY}
                        stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    {payX != null && (
                        <line x1={payX} x2={payX} y1={PAD_T} y2={H - PAD_B}
                            stroke={VIZ.magnitude} strokeWidth="1" strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke" />
                    )}
                    <path d={line} fill="none" stroke={VIZ.magnitude} strokeWidth="2"
                        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </svg>

                {payX != null && (
                    <span className="cc-payback" style={{left: `${(payX / W) * 100}%`}}>
                        Payback · month {paybackMonths.toFixed(1)}
                    </span>
                )}

                {/* Hover targets: one per month, invisible, wider than the mark. */}
                <div className="cc-hit-row">
                    {months.map((m, i) => (
                        <span key={m.month} className="cc-hit"
                            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                            title={`Month ${m.month}: ${format(m.cumulative)}`} />
                    ))}
                </div>
            </div>

            <div className="cc-axis">
                <span>Month 1</span>
                {ticks.map(t => <span key={t}>{t}</span>)}
            </div>
        </div>
    );
}

// ─── Baseline vs scenario ────────────────────────────────────────────────────
//
// Three rows in three different units, so a table rather than a chart — a
// shared axis would be meaningless across a headcount and two currencies.

export function CompareTable({title, subtitle, rows, baselineLabel, scenarioLabel, formatMoney, formatCount}) {
    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">{title}</div>
                    {subtitle && <div className="panel-sub">{subtitle}</div>}
                </div>
            </div>
            <table className="compare-table">
                <thead>
                    <tr>
                        <th />
                        <th className="num">{baselineLabel}</th>
                        <th className="num">{scenarioLabel}</th>
                        <th className="num">Change</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const fmt = r.kind === 'money' ? formatMoney : formatCount;
                        // Down is good for cost and headcount in a reduction, so
                        // the tone follows the direction, not the sign.
                        const tone = (r.neutral || r.delta === 0)
                            ? 'flat' : (r.delta < 0 ? 'good' : 'bad');
                        return (
                            <tr key={r.key}>
                                <td className="compare-label">{r.label}</td>
                                <td className="num">{fmt(r.baseline)}</td>
                                <td className="num strong">{fmt(r.scenario)}</td>
                                <td className="num">
                                    <span className={`delta-chip ${tone}`}>
                                        {r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}{fmt(Math.abs(r.delta))}
                                        <span className="delta-pct">
                                            {r.deltaPct > 0 ? '+' : r.deltaPct < 0 ? '−' : ''}
                                            {Math.abs(r.deltaPct).toFixed(1)}%
                                        </span>
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
