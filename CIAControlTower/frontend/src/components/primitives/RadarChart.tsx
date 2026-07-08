import {useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';

export interface RadarSeries {
    label: string;
    color: string;
    /** Per-spoke value. Same length as spokes prop. */
    values: number[];
    /** Per-spoke record bucket — used for drill-down. */
    records: Impact[][];
}

interface Props {
    spokes: ReadonlyArray<string>;
    series: ReadonlyArray<RadarSeries>;
    /** Override the scale's max. Defaults to max value across all series. */
    max?: number;
    valueFormatter?: (n: number) => string;
    onDrill?: (records: Impact[], title: string) => void;
    /** Natural (max) rendered width in px. The chart never grows beyond this. */
    maxRenderWidth?: number;
}

const DEFAULT_FORMATTER = (n: number) => String(Math.round(n));

/** Split a long label into up to two balanced lines at a space near the middle. */
function wrapLabel(label: string, maxChars = 16): string[] {
    if (label.length <= maxChars) return [label];
    const mid = Math.floor(label.length / 2);
    let bestSpace = -1;
    for (let i = 0; i < label.length; i++) {
        if (label[i] === ' ') {
            if (bestSpace === -1 || Math.abs(i - mid) < Math.abs(bestSpace - mid)) bestSpace = i;
        }
    }
    if (bestSpace === -1) return [label];
    return [label.slice(0, bestSpace), label.slice(bestSpace + 1)];
}

export function RadarChart({
    spokes,
    series,
    max,
    valueFormatter = DEFAULT_FORMATTER,
    onDrill,
    maxRenderWidth = 620,
}: Props) {
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const visibleSeries = useMemo(
        () => series.filter(s => !hidden.has(s.label)),
        [series, hidden],
    );

    const maxValue = useMemo(() => {
        if (typeof max === 'number') return max;
        let m = 0;
        for (const s of series) {
            for (const v of s.values) {
                if (v > m) m = v;
            }
        }
        return m || 1;
    }, [series, max]);

    if (spokes.length < 3 || series.length === 0) {
        return <EmptyState line="Not enough data for this radar." />;
    }

    // The plotting area is a square; side padding leaves room for spoke labels.
    const plot = 320;
    const SIDE_PAD = 150;
    const TOP_PAD = 40;
    const BOTTOM_PAD = 40;
    const viewBoxWidth = plot + SIDE_PAD * 2;
    const viewBoxHeight = plot + TOP_PAD + BOTTOM_PAD;
    const cx = viewBoxWidth / 2;
    const cy = TOP_PAD + plot / 2;
    const radius = plot * 0.42;

    const angleFor = (i: number) => (Math.PI * 2 * i) / spokes.length - Math.PI / 2;

    const ringCount = 4;
    const rings: number[] = [];
    for (let i = 1; i <= ringCount; i++) rings.push((i / ringCount) * radius);

    const polar = (i: number, value: number): {x: number; y: number} => {
        const a = angleFor(i);
        const r = (value / maxValue) * radius;
        return {x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r};
    };

    const labelPos = (i: number): {x: number; y: number; anchor: 'start' | 'end' | 'middle'} => {
        const a = angleFor(i);
        const r = radius + 18;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        let anchor: 'start' | 'end' | 'middle' = 'middle';
        if (Math.abs(Math.cos(a)) > 0.3) anchor = Math.cos(a) > 0 ? 'start' : 'end';
        return {x, y, anchor};
    };

    const toggleSeries = (label: string) => {
        setHidden(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md, width: '100%', alignItems: 'center'}}>
            <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                preserveAspectRatio="xMidYMid meet"
                style={{display: 'block', width: '100%', maxWidth: maxRenderWidth, height: 'auto'}}
            >
                {/* Concentric rings */}
                {rings.map((r, i) => (
                    <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={tokens.colors.ruleSoft}
                        strokeWidth={1}
                        strokeDasharray={i === rings.length - 1 ? undefined : '2 4'}
                    />
                ))}

                {/* Spokes */}
                {spokes.map((s, i) => {
                    const a = angleFor(i);
                    const x = cx + Math.cos(a) * radius;
                    const y = cy + Math.sin(a) * radius;
                    return (
                        <line
                            key={s}
                            x1={cx}
                            y1={cy}
                            x2={x}
                            y2={y}
                            stroke={tokens.colors.ruleSoft}
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Series polygons + vertices */}
                {visibleSeries.map(s => {
                    const allPoints = spokes.map((_, i) => polar(i, s.values[i] ?? 0));
                    const nonZeroPoints = spokes
                        .map((_, i) => ((s.values[i] ?? 0) > 0 ? allPoints[i] : null))
                        .filter((p): p is {x: number; y: number} => !!p);

                    let pathEl: React.ReactNode = null;
                    if (nonZeroPoints.length >= 3) {
                        const d = nonZeroPoints
                            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                            .join(' ') + ' Z';
                        pathEl = (
                            <path
                                d={d}
                                fill={s.color}
                                fillOpacity={0.16}
                                stroke={s.color}
                                strokeWidth={2}
                                strokeLinejoin="round"
                            />
                        );
                    }

                    return (
                        <g key={s.label}>
                            {pathEl}
                            {allPoints.map((p, i) => {
                                const value = s.values[i] ?? 0;
                                if (value === 0) return null;
                                const recs = s.records[i] ?? [];
                                const interactive = !!onDrill && recs.length > 0;
                                return (
                                    <circle
                                        key={i}
                                        cx={p.x}
                                        cy={p.y}
                                        r={4}
                                        fill={s.color}
                                        stroke="#fff"
                                        strokeWidth={1.5}
                                        style={{cursor: interactive ? 'pointer' : 'default'}}
                                        onClick={() => {
                                            if (interactive && onDrill) {
                                                onDrill(recs, `${s.label} · ${spokes[i] ?? ''}`);
                                            }
                                        }}
                                    >
                                        <title>{`${s.label} · ${spokes[i] ?? ''}: ${valueFormatter(value)}`}</title>
                                    </circle>
                                );
                            })}
                        </g>
                    );
                })}

                {/* Spoke labels (wrapped to 2 lines when long) */}
                {spokes.map((s, i) => {
                    const {x, y, anchor} = labelPos(i);
                    const lines = wrapLabel(s);
                    const lineH = 12;
                    const startY = y - ((lines.length - 1) * lineH) / 2 + 3;
                    return (
                        <text
                            key={s}
                            x={x}
                            y={startY}
                            fontSize={10.5}
                            fill={tokens.colors.text}
                            textAnchor={anchor}
                            fontWeight={600}
                        >
                            {lines.map((ln, li) => (
                                <tspan key={li} x={x} dy={li === 0 ? 0 : lineH}>
                                    {ln}
                                </tspan>
                            ))}
                        </text>
                    );
                })}

                {/* Axis scale labels along the top spoke */}
                {rings.map((r, i) => {
                    const v = ((i + 1) / ringCount) * maxValue;
                    return (
                        <text
                            key={i}
                            x={cx + 5}
                            y={cy - r + 3}
                            fontSize={9}
                            fill={tokens.colors.textFaint}
                            fontFamily={tokens.fonts.mono}
                        >
                            {valueFormatter(v)}
                        </text>
                    );
                })}
            </svg>

            {/* Series legend / toggles */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: tokens.space.sm,
                    justifyContent: 'center',
                    maxWidth: 640,
                }}
            >
                {series.map(s => {
                    const isHidden = hidden.has(s.label);
                    return (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => toggleSeries(s.label)}
                            title={s.label}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                background: isHidden ? 'transparent' : `${s.color}14`,
                                color: isHidden ? tokens.colors.textFaint : tokens.colors.text,
                                border: `1px solid ${isHidden ? tokens.colors.rule : s.color + '60'}`,
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                opacity: isHidden ? 0.55 : 1,
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <span
                                style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: '50%',
                                    background: s.color,
                                    flexShrink: 0,
                                }}
                            />
                            {s.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
