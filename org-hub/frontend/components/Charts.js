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
