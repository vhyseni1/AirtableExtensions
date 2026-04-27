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
    positive: '#FF7D29',
    negative: '#1482FA',
    subtotal: '#022366',
    end: '#00B458',
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

export function WaterfallChart({steps, onDrill, emptyLine, height = 240}: Props) {
    const bars = useMemo(() => resolveBars(steps), [steps]);

    if (bars.length === 0) {
        return <EmptyState line={emptyLine ?? 'No data for this waterfall.'} />;
    }

    const maxValue = Math.max(1, ...bars.map(b => b.valueHigh));
    const padTop = 24;
    const padBottom = 56;
    const padLeft = 36;
    const padRight = 12;
    const innerHeight = height - padTop - padBottom;
    const barCount = bars.length;
    const barGap = 16;

    const yFor = (v: number): number => padTop + innerHeight * (1 - v / maxValue);

    const ticks = useMemo(() => {
        const stepCount = 4;
        const result: number[] = [];
        for (let i = 0; i <= stepCount; i++) {
            result.push(Math.round((maxValue / stepCount) * i));
        }
        return result;
    }, [maxValue]);

    return (
        <div style={{width: '100%'}}>
            <svg
                viewBox={`0 0 ${100 * barCount + 60} ${height}`}
                preserveAspectRatio="none"
                style={{width: '100%', height, display: 'block'}}
            >
                {ticks.map((t, i) => {
                    const y = yFor(t);
                    return (
                        <g key={i}>
                            <line
                                x1={padLeft}
                                y1={y}
                                x2={100 * barCount + 60 - padRight}
                                y2={y}
                                stroke={tokens.colors.ruleSoft}
                                strokeWidth={1}
                            />
                            <text
                                x={padLeft - 6}
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

                {bars.map((bar, i) => {
                    if (i === bars.length - 1) return null;
                    const next = bars[i + 1];
                    if (!next) return null;
                    const xRight = padLeft + (i + 1) * (100) - barGap / 2;
                    const xLeft = padLeft + (i + 1) * (100) + barGap / 2;
                    const yEnd = yFor(bar.valueHigh);
                    const yNextStart =
                        next.kind === 'positive'
                            ? yFor(next.valueLow)
                            : next.kind === 'negative'
                                ? yFor(next.valueHigh)
                                : yFor(bar.valueHigh);
                    return (
                        <line
                            key={`conn-${i}`}
                            x1={xRight - 60}
                            y1={yEnd}
                            x2={xLeft - 40}
                            y2={yNextStart}
                            stroke={tokens.colors.textFaint}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                        />
                    );
                })}

                {bars.map((bar, i) => {
                    const x = padLeft + i * 100 + barGap / 2;
                    const w = 100 - barGap;
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
                            {bar.kind === 'negative' ? (
                                <pattern
                                    id={`hatch-${i}`}
                                    patternUnits="userSpaceOnUse"
                                    width="6"
                                    height="6"
                                    patternTransform="rotate(45)"
                                >
                                    <rect width="6" height="6" fill={bar.color} fillOpacity={0.5} />
                                    <line x1="0" y1="0" x2="0" y2="6" stroke={bar.color} strokeWidth="3" />
                                </pattern>
                            ) : null}
                            <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={bar.kind === 'negative' ? `url(#hatch-${i})` : bar.color}
                                opacity={isFloating ? 0.92 : 1}
                                rx={2}
                            />
                            <text
                                x={x + w / 2}
                                y={y - 4}
                                fontSize={10}
                                fill={tokens.colors.text}
                                textAnchor="middle"
                                fontFamily={tokens.fonts.mono}
                                fontWeight={600}
                            >
                                {bar.kind === 'positive' ? `+${bar.value}` : bar.kind === 'negative' ? `−${bar.value}` : bar.value}
                            </text>
                            <foreignObject
                                x={x - 6}
                                y={padTop + innerHeight + 6}
                                width={w + 12}
                                height={padBottom - 10}
                            >
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: tokens.colors.text,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        lineHeight: 1.2,
                                        wordBreak: 'break-word',
                                    }}
                                    title={bar.note || `${bar.label}: ${bar.value}`}
                                >
                                    <div
                                        style={{
                                            fontSize: 8,
                                            color: tokens.colors.textFaint,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {bar.kind}
                                    </div>
                                    {bar.label}
                                </div>
                            </foreignObject>
                            <rect
                                x={x}
                                y={padTop}
                                width={w}
                                height={innerHeight}
                                fill="transparent"
                            >
                                <title>{bar.note || `${bar.label}: ${bar.value}`}</title>
                            </rect>
                        </g>
                    );
                })}

                <line
                    x1={padLeft}
                    y1={padTop + innerHeight}
                    x2={100 * barCount + 60 - padRight}
                    y2={padTop + innerHeight}
                    stroke={tokens.colors.rule}
                    strokeWidth={1}
                />
            </svg>
        </div>
    );
}
