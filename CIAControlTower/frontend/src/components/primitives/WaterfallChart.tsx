import {useMemo} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';

export type StepKind = 'start' | 'positive' | 'negative' | 'subtotal' | 'end';

export interface WaterfallStep {
    label: string;
    value: number;
    kind: StepKind;
    color?: string;
    records?: Impact[];
    drillTitle?: string;
    note?: string;
}

interface Props {
    steps: ReadonlyArray<WaterfallStep>;
    onDrill: (records: Impact[], title: string) => void;
    emptyLine?: string;
    height?: number;
}

const KIND_COLOR: Record<StepKind, string> = {
    start: '#0B41CD',
    positive: '#00B458',
    negative: '#C40000',
    subtotal: '#1482FA',
    end: '#022366',
};

interface ResolvedBar {
    label: string;
    kind: StepKind;
    value: number;
    valueLow: number;
    valueHigh: number;
    color: string;
    records: Impact[];
    drillTitle: string;
    note: string;
}

function resolveBars(steps: ReadonlyArray<WaterfallStep>): ResolvedBar[] {
    let running = 0;
    return steps.map(step => {
        const color = step.color ?? KIND_COLOR[step.kind];
        let valueLow = 0;
        let valueHigh = 0;
        if (step.kind === 'start' || step.kind === 'subtotal' || step.kind === 'end') {
            valueLow = 0;
            valueHigh = step.value;
            running = step.value;
        } else if (step.kind === 'positive') {
            valueLow = running;
            valueHigh = running + step.value;
            running = valueHigh;
        } else {
            valueLow = Math.max(0, running - step.value);
            valueHigh = running;
            running = valueLow;
        }
        return {
            label: step.label,
            kind: step.kind,
            value: step.value,
            valueLow,
            valueHigh,
            color,
            records: step.records ?? [],
            drillTitle: step.drillTitle ?? step.label,
            note: step.note ?? '',
        };
    });
}

export function WaterfallChart({steps, onDrill, emptyLine, height = 300}: Props) {
    const bars = useMemo(() => resolveBars(steps), [steps]);

    if (bars.length === 0) {
        return <EmptyState line={emptyLine ?? 'No data for this waterfall.'} />;
    }

    const barCount = bars.length;
    const padTop = 28;
    const padBottom = 64;
    const padLeft = 44;
    const padRight = 16;

    // Slot per bar; bar occupies the middle, gaps on both sides.
    const slotW = 116;
    const barGap = 34;
    const barW = slotW - barGap;
    const width = padLeft + padRight + slotW * barCount;
    const innerHeight = height - padTop - padBottom;
    const chartRight = width - padRight;

    const maxValue = Math.max(1, ...bars.map(b => b.valueHigh));
    const yFor = (v: number): number => padTop + innerHeight * (1 - v / maxValue);
    const slotCenter = (i: number): number => padLeft + slotW * i + slotW / 2;

    const tickCount = 4;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) ticks.push(Math.round((maxValue / tickCount) * i));

    return (
        <div style={{width: '100%', display: 'flex', justifyContent: 'center'}}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                style={{width: '100%', maxWidth: Math.max(460, width), height: 'auto', display: 'block'}}
            >
                {/* Gridlines + value axis */}
                {ticks.map((t, i) => {
                    const y = yFor(t);
                    return (
                        <g key={i}>
                            <line
                                x1={padLeft}
                                y1={y}
                                x2={chartRight}
                                y2={y}
                                stroke={tokens.colors.ruleSoft}
                                strokeWidth={1}
                                strokeDasharray={i === 0 ? undefined : '2 4'}
                            />
                            <text
                                x={padLeft - 8}
                                y={y + 3}
                                fontSize={9}
                                fill={tokens.colors.textFaint}
                                textAnchor="end"
                                fontFamily={tokens.fonts.mono}
                            >
                                {t}
                            </text>
                        </g>
                    );
                })}

                {/* Connectors between consecutive bar tops */}
                {bars.map((bar, i) => {
                    if (i === bars.length - 1) return null;
                    const next = bars[i + 1];
                    if (!next) return null;
                    const xRight = slotCenter(i) + barW / 2;
                    const xLeft = slotCenter(i + 1) - barW / 2;
                    // Level where this bar leaves off (running total after it):
                    // negative bars end at their bottom, everything else at their top.
                    const yEnd = bar.kind === 'negative' ? yFor(bar.valueLow) : yFor(bar.valueHigh);
                    // Level where the next bar begins:
                    // positive rises from its low edge; all others meet at their top.
                    const yNextStart = next.kind === 'positive' ? yFor(next.valueLow) : yFor(next.valueHigh);
                    return (
                        <line
                            key={`conn-${i}`}
                            x1={xRight}
                            y1={yEnd}
                            x2={xLeft}
                            y2={yNextStart}
                            stroke={tokens.colors.textFaint}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Bars */}
                {bars.map((bar, i) => {
                    const x = slotCenter(i) - barW / 2;
                    const y = yFor(bar.valueHigh);
                    const h = Math.max(2, yFor(bar.valueLow) - y);
                    const interactive = bar.records.length > 0;
                    const isFloating = bar.kind === 'positive' || bar.kind === 'negative';
                    return (
                        <g
                            key={`bar-${i}`}
                            style={{cursor: interactive ? 'pointer' : 'default'}}
                            onClick={() => interactive && onDrill(bar.records, bar.drillTitle)}
                        >
                            <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={h}
                                fill={bar.color}
                                opacity={isFloating ? 0.9 : 1}
                                rx={3}
                                style={{
                                    filter: `drop-shadow(0 1px 2px ${bar.color}44)`,
                                    transition: 'opacity 120ms ease',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as SVGRectElement).style.opacity = '1';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as SVGRectElement).style.opacity = isFloating ? '0.9' : '1';
                                }}
                            >
                                <title>{bar.note || `${bar.label}: ${bar.value}`}</title>
                            </rect>
                            <text
                                x={x + barW / 2}
                                y={y - 6}
                                fontSize={12}
                                fill={tokens.colors.text}
                                textAnchor="middle"
                                fontFamily={tokens.fonts.mono}
                                fontWeight={700}
                            >
                                {bar.kind === 'positive' ? `+${bar.value}` : bar.kind === 'negative' ? `−${bar.value}` : bar.value}
                            </text>
                            <foreignObject
                                x={slotCenter(i) - slotW / 2}
                                y={padTop + innerHeight + 8}
                                width={slotW}
                                height={padBottom - 12}
                            >
                                <div
                                    style={{
                                        fontSize: 10.5,
                                        color: tokens.colors.text,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        lineHeight: 1.25,
                                        wordBreak: 'break-word',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 2,
                                    }}
                                    title={bar.note || `${bar.label}: ${bar.value}`}
                                >
                                    <span
                                        style={{
                                            fontSize: 8,
                                            color: bar.color,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {bar.kind}
                                    </span>
                                    <span>{bar.label}</span>
                                </div>
                            </foreignObject>
                        </g>
                    );
                })}

                {/* Baseline */}
                <line
                    x1={padLeft}
                    y1={padTop + innerHeight}
                    x2={chartRight}
                    y2={padTop + innerHeight}
                    stroke={tokens.colors.rule}
                    strokeWidth={1.5}
                />
            </svg>
        </div>
    );
}
