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
    height?: number;
}

const DEFAULT_FORMATTER = (n: number) => String(Math.round(n));

export function RadarChart({
    spokes,
    series,
    max,
    valueFormatter = DEFAULT_FORMATTER,
    onDrill,
    height = 360,
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

    const size = height;
    const SIDE_PAD = 180;
    const viewBoxWidth = size + SIDE_PAD * 2;
    const cx = viewBoxWidth / 2;
    const cy = size / 2;
    const radius = size * 0.34;

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
        const r = radius + 22;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        let anchor: 'start' | 'end' | 'middle' = 'middle';
        if (Math.abs(Math.cos(a)) > 0.3) anchor = Math.cos(a) > 0 ? 'start' : 'end';
        return {x, y: y + 3, anchor};
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
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md, width: '100%'}}>
            <svg
                viewBox={`0 0 ${viewBoxWidth} ${size}`}
                preserveAspectRatio="xMidYMid meet"
                style={{display: 'block', maxWidth: '100%', height: 'auto'}}
            >
                <g>
                    {rings.map((r, i) => (
                        <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={tokens.colors.ruleSoft}
                            strokeWidth={1}
                        />
                    ))}

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

                    {visibleSeries.map(s => {
                        const allPoints = spokes.map((_, i) => polar(i, s.values[i] ?? 0));
                        const nonZeroIndices: number[] = [];
                        spokes.forEach((_, i) => {
                            if ((s.values[i] ?? 0) > 0) nonZeroIndices.push(i);
                        });
                        const nonZeroPoints = nonZeroIndices
                            .map(i => allPoints[i])
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
                                    fillOpacity={0.18}
                                    stroke={s.color}
                                    strokeWidth={1.5}
                                    strokeLinejoin="round"
                                />
                            );
                        } else if (nonZeroPoints.length === 2) {
                            const a = nonZeroPoints[0]!;
                            const b = nonZeroPoints[1]!;
                            pathEl = (
                                <line
                                    x1={a.x}
                                    y1={a.y}
                                    x2={b.x}
                                    y2={b.y}
                                    stroke={s.color}
                                    strokeWidth={1.5}
                                    strokeLinecap="round"
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
                                            r={3.5}
                                            fill={s.color}
                                            stroke="#fff"
                                            strokeWidth={1.5}
                                            style={{cursor: interactive ? 'pointer' : 'default'}}
                                            onClick={() => {
                                                if (interactive && onDrill) {
                                                    onDrill(
                                                        recs,
                                                        `${s.label} · ${spokes[i] ?? ''}`,
                                                    );
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

                    {spokes.map((s, i) => {
                        const {x, y, anchor} = labelPos(i);
                        return (
                            <text
                                key={s}
                                x={x}
                                y={y}
                                fontSize={10}
                                fill={tokens.colors.text}
                                textAnchor={anchor}
                                fontWeight={600}
                            >
                                {s}
                            </text>
                        );
                    })}

                    {/* axis scale labels along the top spoke */}
                    {rings.map((r, i) => {
                        const v = ((i + 1) / ringCount) * maxValue;
                        return (
                            <text
                                key={i}
                                x={cx + 4}
                                y={cy - r + 2}
                                fontSize={9}
                                fill={tokens.colors.textFaint}
                                fontFamily={tokens.fonts.mono}
                            >
                                {valueFormatter(v)}
                            </text>
                        );
                    })}
                </g>
            </svg>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: tokens.space.sm,
                    justifyContent: 'center',
                }}
            >
                {series.map(s => {
                    const isHidden = hidden.has(s.label);
                    return (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => toggleSeries(s.label)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 9px',
                                background: isHidden ? 'transparent' : `${s.color}12`,
                                color: isHidden ? tokens.colors.textFaint : tokens.colors.text,
                                border: `1px solid ${isHidden ? tokens.colors.rule : s.color + '60'}`,
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                opacity: isHidden ? 0.55 : 1,
                            }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
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
