import {useId, useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';

export interface SankeyDimension {
    label: string;
    extract: (r: Impact) => string | null;
    order?: ReadonlyArray<string>;
    /** Optional per-value color override. Falls back to a deterministic palette. */
    colorOf?: (value: string) => string;
}

interface Props {
    records: Impact[];
    columns: [SankeyDimension, SankeyDimension, SankeyDimension];
    onDrill: (records: Impact[], title: string) => void;
    height?: number;
    /** Natural (max) rendered width in px. */
    maxRenderWidth?: number;
}

const PALETTE: ReadonlyArray<string> = [
    '#0B41CD',
    '#1482FA',
    '#022366',
    '#FF7D29',
    '#BC36F0',
    '#00B458',
    '#FFD60C',
    '#C40000',
    '#7D0096',
    '#ED4A0D',
    '#5C544A',
];

function paletteFor(values: ReadonlyArray<string>): Map<string, string> {
    const m = new Map<string, string>();
    values.forEach((v, i) => m.set(v, PALETTE[i % PALETTE.length] ?? '#5C544A'));
    return m;
}

const WIDTH = 1200;
const MARGIN_X = 190;
const NODE_W = 16;

interface NodeLayout {
    column: number;
    key: string;
    label: string;
    y: number;
    h: number;
    total: number;
    color: string;
    records: Impact[];
}

interface BandLayout {
    sourceCol: number;
    sourceKey: string;
    targetKey: string;
    sourceY: number;
    targetY: number;
    h: number;
    sourceColor: string;
    targetColor: string;
    records: Impact[];
}

export function SankeyChart({records, columns, onDrill, height = 380, maxRenderWidth = 1100}: Props) {
    const [hovered, setHovered] = useState<string | null>(null);
    const uid = useId().replace(/:/g, '');
    const gradId = (i: number) => `sankey-grad-${uid}-${i}`;

    const {nodes, bands, totalsByCol} = useMemo(() => {
        return buildLayout(records, columns, height);
    }, [records, columns, height]);

    if (nodes.length === 0) {
        return <EmptyState line="No data in scope for this flow." />;
    }

    const colXCenter = (col: number) => MARGIN_X + (col / 2) * (WIDTH - MARGIN_X * 2);
    const HEADER_Y = 16;

    const nodeId = (col: number, key: string) => `${col}${key}`;
    const bandTouchesHover = (b: BandLayout): boolean => {
        if (!hovered) return false;
        return hovered === nodeId(b.sourceCol, b.sourceKey) || hovered === nodeId(b.sourceCol + 1, b.targetKey);
    };

    return (
        <div style={{width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <svg
                viewBox={`0 0 ${WIDTH} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                style={{width: '100%', maxWidth: maxRenderWidth, height: 'auto', display: 'block'}}
            >
                <defs>
                    {bands.map((b, i) => {
                        const x1 = colXCenter(b.sourceCol) + NODE_W / 2;
                        const x2 = colXCenter(b.sourceCol + 1) - NODE_W / 2;
                        return (
                            <linearGradient
                                key={i}
                                id={gradId(i)}
                                gradientUnits="userSpaceOnUse"
                                x1={x1}
                                y1={0}
                                x2={x2}
                                y2={0}
                            >
                                <stop offset="0%" stopColor={b.sourceColor} />
                                <stop offset="100%" stopColor={b.targetColor} />
                            </linearGradient>
                        );
                    })}
                </defs>

                {[0, 1, 2].map(col => (
                    <text
                        key={col}
                        x={colXCenter(col)}
                        y={HEADER_Y}
                        fontSize={12}
                        fill={tokens.colors.textMuted}
                        textAnchor="middle"
                        fontWeight={700}
                        letterSpacing="0.14em"
                    >
                        {(columns[col]?.label ?? '').toUpperCase()}
                    </text>
                ))}

                {/* Bands (gradient source→target) */}
                {bands.map((b, i) => {
                    const x1 = colXCenter(b.sourceCol) + NODE_W / 2;
                    const x2 = colXCenter(b.sourceCol + 1) - NODE_W / 2;
                    const cx1 = x1 + (x2 - x1) * 0.5;
                    const cx2 = x1 + (x2 - x1) * 0.5;
                    const y1Top = b.sourceY;
                    const y1Bot = b.sourceY + b.h;
                    const y2Top = b.targetY;
                    const y2Bot = b.targetY + b.h;
                    const d = `M ${x1} ${y1Top} C ${cx1} ${y1Top}, ${cx2} ${y2Top}, ${x2} ${y2Top} L ${x2} ${y2Bot} C ${cx2} ${y2Bot}, ${cx1} ${y1Bot}, ${x1} ${y1Bot} Z`;
                    const opacity = hovered ? (bandTouchesHover(b) ? 0.66 : 0.08) : 0.34;
                    return (
                        <path
                            key={i}
                            d={d}
                            fill={`url(#${gradId(i)})`}
                            fillOpacity={opacity}
                            stroke="none"
                            style={{cursor: 'pointer', transition: 'fill-opacity 140ms ease'}}
                            onMouseEnter={() => setHovered(nodeId(b.sourceCol, b.sourceKey))}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => onDrill(b.records, `${b.sourceKey} → ${b.targetKey}`)}
                        >
                            <title>{`${b.sourceKey} → ${b.targetKey}: ${b.records.length}`}</title>
                        </path>
                    );
                })}

                {/* Nodes */}
                {nodes.map(n => {
                    const x = colXCenter(n.column) - NODE_W / 2;
                    const isRight = n.column === 2;
                    const labelX = n.column === 0 ? x - 10 : x + NODE_W + 10;
                    const maxChars = n.column === 1 ? 24 : 22;
                    const dim = hovered && hovered !== nodeId(n.column, n.key);
                    return (
                        <g
                            key={`${n.column}-${n.key}`}
                            style={{cursor: 'pointer', opacity: dim ? 0.45 : 1, transition: 'opacity 140ms ease'}}
                            onMouseEnter={() => setHovered(nodeId(n.column, n.key))}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => onDrill(n.records, `${columns[n.column]?.label ?? ''} · ${n.label}`)}
                        >
                            <rect
                                x={x}
                                y={n.y}
                                width={NODE_W}
                                height={Math.max(2, n.h)}
                                fill={n.color}
                                rx={3}
                                style={{filter: `drop-shadow(0 1px 2px ${n.color}55)`}}
                            >
                                <title>{`${n.label}: ${n.total}`}</title>
                            </rect>
                            <text
                                x={labelX}
                                y={n.y + n.h / 2 + 4}
                                fontSize={12.5}
                                fill={tokens.colors.text}
                                textAnchor={isRight ? 'start' : n.column === 0 ? 'end' : 'start'}
                                fontWeight={600}
                            >
                                <tspan>{truncate(n.label, maxChars)}</tspan>
                                <tspan
                                    dx={7}
                                    fill={tokens.colors.textFaint}
                                    fontFamily={tokens.fonts.mono}
                                    fontSize={11}
                                >
                                    {n.total}
                                </tspan>
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    maxWidth: maxRenderWidth,
                    marginTop: 8,
                    fontSize: 10,
                    color: tokens.colors.textFaint,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                }}
            >
                <span>{totalsByCol[0]} {columns[0].label.toLowerCase()}</span>
                <span>Hover to trace · click to drill</span>
                <span>{totalsByCol[2]} {columns[2].label.toLowerCase()}</span>
            </div>
        </div>
    );
}

function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function buildLayout(
    records: Impact[],
    columns: [SankeyDimension, SankeyDimension, SankeyDimension],
    height: number,
) {
    const padTop = 34;
    const padBottom = 16;
    const inner = height - padTop - padBottom;
    const NODE_GAP = 7;

    const valuesPerCol: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
    const triples: Array<{a: string; b: string; c: string; record: Impact}> = [];

    for (const rec of records) {
        const a = columns[0].extract(rec);
        const b = columns[1].extract(rec);
        const c = columns[2].extract(rec);
        if (!a || !b || !c) continue;
        valuesPerCol[0].add(a);
        valuesPerCol[1].add(b);
        valuesPerCol[2].add(c);
        triples.push({a, b, c, record: rec});
    }

    const colTotals: Array<Map<string, number>> = [new Map(), new Map(), new Map()];
    for (const t of triples) {
        colTotals[0]?.set(t.a, (colTotals[0]?.get(t.a) ?? 0) + 1);
        colTotals[1]?.set(t.b, (colTotals[1]?.get(t.b) ?? 0) + 1);
        colTotals[2]?.set(t.c, (colTotals[2]?.get(t.c) ?? 0) + 1);
    }

    const totalsByCol: [number, number, number] = [triples.length, triples.length, triples.length];

    const orderColumn = (col: 0 | 1 | 2): string[] => {
        const fromData = [...valuesPerCol[col]];
        const order = columns[col].order;
        if (order) return order.filter(v => valuesPerCol[col].has(v));
        return fromData.sort(
            (a, b) => (colTotals[col]?.get(b) ?? 0) - (colTotals[col]?.get(a) ?? 0) || a.localeCompare(b),
        );
    };

    const orderedValues: [string[], string[], string[]] = [orderColumn(0), orderColumn(1), orderColumn(2)];

    const palettes: [Map<string, string>, Map<string, string>, Map<string, string>] = [
        applyCustomOrPalette(columns[0], orderedValues[0]),
        applyCustomOrPalette(columns[1], orderedValues[1]),
        applyCustomOrPalette(columns[2], orderedValues[2]),
    ];

    const recordsByValue: Array<Map<string, Impact[]>> = [new Map(), new Map(), new Map()];
    for (const t of triples) {
        appendToRecords(recordsByValue[0]!, t.a, t.record);
        appendToRecords(recordsByValue[1]!, t.b, t.record);
        appendToRecords(recordsByValue[2]!, t.c, t.record);
    }

    const yPositions: Array<Map<string, {y: number; h: number}>> = [new Map(), new Map(), new Map()];
    for (let col = 0; col < 3; col++) {
        const values = orderedValues[col] ?? [];
        const total = triples.length || 1;
        const nodeGapTotal = NODE_GAP * Math.max(0, values.length - 1);
        const heightForNodes = inner - nodeGapTotal;
        let cursor = padTop;
        for (const v of values) {
            const c = colTotals[col]?.get(v) ?? 0;
            const h = Math.max(3, (c / total) * heightForNodes);
            yPositions[col]?.set(v, {y: cursor, h});
            cursor += h + NODE_GAP;
        }
    }

    const nodes: NodeLayout[] = [];
    for (let col = 0; col < 3; col++) {
        for (const v of orderedValues[col] ?? []) {
            const pos = yPositions[col]?.get(v);
            if (!pos) continue;
            nodes.push({
                column: col,
                key: v,
                label: v,
                y: pos.y,
                h: pos.h,
                total: colTotals[col]?.get(v) ?? 0,
                color: palettes[col]?.get(v) ?? '#5C544A',
                records: recordsByValue[col]?.get(v) ?? [],
            });
        }
    }

    const bands: BandLayout[] = [];
    for (const link of [{from: 0, to: 1} as const, {from: 1, to: 2} as const]) {
        const flows = new Map<string, {source: string; target: string; records: Impact[]}>();
        for (const t of triples) {
            const src = link.from === 0 ? t.a : t.b;
            const tgt = link.to === 1 ? t.b : t.c;
            const k = src + '' + tgt;
            let entry = flows.get(k);
            if (!entry) {
                entry = {source: src, target: tgt, records: []};
                flows.set(k, entry);
            }
            entry.records.push(t.record);
        }

        const flowArr = [...flows.values()].sort((a, b) => {
            const ai = (orderedValues[link.from] ?? []).indexOf(a.source);
            const bi = (orderedValues[link.from] ?? []).indexOf(b.source);
            if (ai !== bi) return ai - bi;
            const aj = (orderedValues[link.to] ?? []).indexOf(a.target);
            const bj = (orderedValues[link.to] ?? []).indexOf(b.target);
            return aj - bj;
        });

        const sourceOffsets = new Map<string, number>();
        const targetOffsets = new Map<string, number>();

        for (const f of flowArr) {
            const srcPos = yPositions[link.from]?.get(f.source);
            const tgtPos = yPositions[link.to]?.get(f.target);
            const srcTotal = colTotals[link.from]?.get(f.source) ?? 1;
            const tgtTotal = colTotals[link.to]?.get(f.target) ?? 1;
            if (!srcPos || !tgtPos) continue;
            const flowFrac = f.records.length;
            const srcH = (flowFrac / srcTotal) * srcPos.h;
            const tgtH = (flowFrac / tgtTotal) * tgtPos.h;
            const sOffset = sourceOffsets.get(f.source) ?? 0;
            const tOffset = targetOffsets.get(f.target) ?? 0;
            const bandH = Math.min(srcH, tgtH);
            bands.push({
                sourceCol: link.from,
                sourceKey: f.source,
                targetKey: f.target,
                sourceY: srcPos.y + sOffset,
                targetY: tgtPos.y + tOffset,
                h: bandH,
                sourceColor: palettes[link.from]?.get(f.source) ?? '#5C544A',
                targetColor: palettes[link.to]?.get(f.target) ?? '#5C544A',
                records: f.records,
            });
            sourceOffsets.set(f.source, sOffset + srcH);
            targetOffsets.set(f.target, tOffset + tgtH);
        }
    }

    return {nodes, bands, totalsByCol};
}

function appendToRecords(map: Map<string, Impact[]>, key: string, record: Impact): void {
    let arr = map.get(key);
    if (!arr) {
        arr = [];
        map.set(key, arr);
    }
    arr.push(record);
}

function applyCustomOrPalette(dim: SankeyDimension, values: ReadonlyArray<string>): Map<string, string> {
    if (dim.colorOf) {
        const m = new Map<string, string>();
        for (const v of values) m.set(v, dim.colorOf(v));
        return m;
    }
    return paletteFor(values);
}
