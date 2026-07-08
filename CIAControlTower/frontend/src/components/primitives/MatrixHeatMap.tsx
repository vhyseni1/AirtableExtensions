import {useMemo} from 'react';
import {tokens} from '../../styles/tokens';
import {CHANGE_IMPACT_WEIGHT, type ChangeImpact, type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';

export type Orientation = 'rotate' | 'flat' | 'wrap';

export type Tint = 'high' | 'medium' | 'low' | 'neutral';

export interface MetricResult {
    /** Display string in the cell (e.g. "12" or "2.3"). */
    display: string;
    /** Raw number used for intensity scaling across cells. */
    raw: number;
    /** Color category — drives the cell tint. */
    tint: Tint;
}

interface Cell {
    count: number;
    avgSev: number;
    records: Impact[];
}

export interface MatrixHeatMapProps {
    records: Impact[];
    rowKey: (r: Impact) => string | null;
    colKey: (r: Impact) => string | null;
    rowOrder?: ReadonlyArray<string>;
    colOrder?: ReadonlyArray<string>;
    rowLabel?: string;
    colLabel?: string;
    colOrientation?: Orientation;
    minColWidth?: number;
    /** Override cell value and color. Default: count + severity tint. */
    metricFn?: (records: Impact[]) => MetricResult;
    onDrill: (records: Impact[], title: string) => void;
}

function withAlpha(hex: string, alpha: number): string {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return `${hex}${a}`;
}

function build(
    records: Impact[],
    rowKey: (r: Impact) => string | null,
    colKey: (r: Impact) => string | null,
    rowOrder?: ReadonlyArray<string>,
    colOrder?: ReadonlyArray<string>,
) {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const cells = new Map<string, Map<string, Cell>>();
    const rowTotals = new Map<string, number>();
    const colTotals = new Map<string, number>();

    for (const r of records) {
        const rk = rowKey(r);
        const ck = colKey(r);
        if (!rk || !ck) continue;
        rowSet.add(rk);
        colSet.add(ck);
        let row = cells.get(rk);
        if (!row) {
            row = new Map();
            cells.set(rk, row);
        }
        let cell = row.get(ck);
        if (!cell) {
            cell = {count: 0, avgSev: 0, records: []};
            row.set(ck, cell);
        }
        cell.count += 1;
        cell.records.push(r);
        if (r.changeImpact) {
            cell.avgSev = (cell.avgSev * (cell.count - 1) + CHANGE_IMPACT_WEIGHT[r.changeImpact as ChangeImpact]) / cell.count;
        }
        rowTotals.set(rk, (rowTotals.get(rk) ?? 0) + 1);
        colTotals.set(ck, (colTotals.get(ck) ?? 0) + 1);
    }

    const rows = rowOrder
        ? rowOrder.filter(k => rowSet.has(k))
        : [...rowSet].sort((a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0) || a.localeCompare(b));
    const cols = colOrder
        ? colOrder.filter(k => colSet.has(k))
        : [...colSet].sort((a, b) => (colTotals.get(b) ?? 0) - (colTotals.get(a) ?? 0) || a.localeCompare(b));

    let maxCount = 0;
    for (const row of cells.values()) {
        for (const cell of row.values()) {
            if (cell.count > maxCount) maxCount = cell.count;
        }
    }

    return {rows, cols, cells, rowTotals, colTotals, maxCount};
}

function tintColor(tint: Tint): string {
    if (tint === 'high') return '#FF1F26';
    if (tint === 'medium') return '#FFD60C';
    if (tint === 'low') return '#00B458';
    return tokens.colors.accent;
}

/**
 * Pick a text color that contrasts well against a tint-shaded cell background.
 * Yellow is the tough case: even at high intensity it's too luminous for white
 * text, so it always gets dark text. Red/green/blue flip to white once the
 * background is opaque enough.
 */
function cellTextColor(tint: Tint, intensity: number): string {
    if (tint === 'medium') return tokens.colors.text;
    if (intensity >= 0.6) return '#FFFFFF';
    return tokens.colors.text;
}

function defaultMetric(records: Impact[]): MetricResult {
    if (records.length === 0) return {display: '', raw: 0, tint: 'neutral'};
    const sevs: number[] = [];
    for (const r of records) {
        if (r.changeImpact) sevs.push(CHANGE_IMPACT_WEIGHT[r.changeImpact as ChangeImpact]);
    }
    const avg = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
    const tint: Tint = avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : avg > 0 ? 'low' : 'neutral';
    return {display: String(records.length), raw: records.length, tint};
}

export function MatrixHeatMap({
    records,
    rowKey,
    colKey,
    rowOrder,
    colOrder,
    rowLabel,
    colLabel,
    colOrientation = 'wrap',
    minColWidth = 84,
    metricFn,
    onDrill,
}: MatrixHeatMapProps) {
    const {rows, cols, cells, rowTotals, colTotals} = useMemo(
        () => build(records, rowKey, colKey, rowOrder, colOrder),
        [records, rowKey, colKey, rowOrder, colOrder],
    );

    const fn = metricFn ?? defaultMetric;

    const {cellMetrics, maxRaw} = useMemo(() => {
        const m = new Map<string, Map<string, MetricResult>>();
        let max = 0;
        for (const row of rows) {
            const inner = new Map<string, MetricResult>();
            for (const col of cols) {
                const cell = cells.get(row)?.get(col);
                const recs = cell?.records ?? [];
                const result = fn(recs);
                inner.set(col, result);
                if (result.raw > max) max = result.raw;
            }
            m.set(row, inner);
        }
        return {cellMetrics: m, maxRaw: max || 1};
    }, [rows, cols, cells, fn]);

    if (rows.length === 0 || cols.length === 0) {
        return <EmptyState line="No data in scope for this matrix." />;
    }

    return (
        <div style={{overflowX: 'auto'}} className="cia-scroll">
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `140px repeat(${cols.length}, minmax(${minColWidth}px, 1fr))`,
                    gap: 6,
                    minWidth: 140 + cols.length * minColWidth,
                    padding: '4px 2px 8px 2px',
                }}
            >
                <div
                    style={{
                        fontSize: 9,
                        color: tokens.colors.textFaint,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        alignSelf: 'end',
                        paddingBottom: 6,
                        paddingLeft: 8,
                    }}
                >
                    {rowLabel ?? ''} ↓ / {colLabel ?? ''} →
                </div>
                {cols.map(c => (
                    <ColHeader key={c} label={c} total={colTotals.get(c) ?? 0} orientation={colOrientation} />
                ))}
                {rows.map(r => (
                    <RowFragment
                        key={r}
                        row={r}
                        rowTotal={rowTotals.get(r) ?? 0}
                        cols={cols}
                        cells={cells}
                        cellMetrics={cellMetrics.get(r) ?? new Map()}
                        maxRaw={maxRaw}
                        onDrill={onDrill}
                    />
                ))}
            </div>
        </div>
    );
}

function ColHeader({label, total, orientation}: {label: string; total: number; orientation: Orientation}) {
    if (orientation === 'wrap') {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    fontSize: 10.5,
                    color: tokens.colors.text,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    padding: '4px 6px 8px',
                    textAlign: 'center',
                    lineHeight: 1.25,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    minHeight: 32,
                    gap: 4,
                }}
                title={`${label} · ${total}`}
            >
                <div style={{textTransform: 'uppercase', letterSpacing: '0.06em'}}>{label}</div>
                <div
                    className="cia-num"
                    style={{
                        color: tokens.colors.textMuted,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        background: tokens.colors.bgAlt,
                        borderRadius: 999,
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {total}
                </div>
            </div>
        );
    }
    if (orientation === 'flat') {
        return (
            <div
                style={{
                    fontSize: 10,
                    color: tokens.colors.textMuted,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    padding: '4px 4px',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
                title={`${label} · ${total}`}
            >
                <div style={{textTransform: 'uppercase'}}>{label}</div>
                <div className="cia-num" style={{color: tokens.colors.textFaint, fontSize: 9}}>{total}</div>
            </div>
        );
    }
    return (
        <div
            style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: 10,
                color: tokens.colors.textMuted,
                fontWeight: 600,
                letterSpacing: '0.06em',
                padding: '6px 0',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                minHeight: 80,
                gap: 6,
            }}
            title={`${label} · ${total}`}
        >
            <span className="cia-num" style={{color: tokens.colors.textFaint}}>{total}</span>
            <span style={{textTransform: 'uppercase'}}>{label}</span>
        </div>
    );
}

interface RowFragmentProps {
    row: string;
    rowTotal: number;
    cols: ReadonlyArray<string>;
    cells: Map<string, Map<string, Cell>>;
    cellMetrics: Map<string, MetricResult>;
    maxRaw: number;
    onDrill: (records: Impact[], title: string) => void;
}

function RowFragment({row, rowTotal, cols, cells, cellMetrics, maxRaw, onDrill}: RowFragmentProps) {
    return (
        <>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px 0 10px',
                    fontSize: 11.5,
                    color: tokens.colors.text,
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    borderRight: `1px solid ${tokens.colors.ruleSoft}`,
                    minHeight: 44,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    gap: 8,
                }}
                title={row}
            >
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{row}</span>
                <span
                    className="cia-num"
                    style={{
                        color: tokens.colors.textMuted,
                        fontWeight: 700,
                        fontSize: 11,
                        marginLeft: 4,
                        padding: '2px 6px',
                        background: tokens.colors.bgAlt,
                        borderRadius: 999,
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {rowTotal}
                </span>
            </div>
            {cols.map(c => {
                const cell = cells.get(row)?.get(c);
                const metric = cellMetrics.get(c);
                const empty = !metric || metric.raw === 0;
                const intensity = empty ? 0 : 0.18 + (metric.raw / maxRaw) * 0.72;
                const color = empty ? tokens.colors.textFaint : tintColor(metric.tint);
                const bgSolid = empty ? tokens.colors.bgAlt : withAlpha(color, intensity);
                const bgHighlight = empty ? tokens.colors.bgAlt : withAlpha(color, Math.min(1, intensity + 0.08));
                const gradient = empty
                    ? tokens.colors.bgAlt
                    : `linear-gradient(155deg, ${bgHighlight} 0%, ${bgSolid} 55%, ${withAlpha(color, Math.min(1, intensity + 0.04))} 100%)`;
                const records = cell?.records ?? [];
                return (
                    <button
                        key={c}
                        type="button"
                        disabled={empty}
                        onClick={() => onDrill(records, `${row} · ${c}`)}
                        title={empty ? 'No data' : `${row} · ${c}: ${metric?.display ?? ''}`}
                        style={{
                            background: gradient,
                            border: 'none',
                            borderRadius: 8,
                            minHeight: 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: tokens.fonts.mono,
                            fontSize: 14,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: empty
                                ? tokens.colors.textFaint
                                : cellTextColor(metric.tint, intensity),
                            cursor: empty ? 'default' : 'pointer',
                            boxShadow: empty
                                ? 'none'
                                : `0 1px 2px rgba(2,35,102,0.06), inset 0 1px 0 rgba(255,255,255,0.14)`,
                            transition: 'transform 140ms cubic-bezier(0.4,0,0.2,1), box-shadow 140ms ease',
                        }}
                        onMouseEnter={e => {
                            if (!empty) {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.transform = 'translateY(-1px) scale(1.03)';
                                el.style.boxShadow = `0 6px 14px ${withAlpha(color, 0.28)}, 0 2px 4px rgba(2,35,102,0.10), inset 0 1px 0 rgba(255,255,255,0.2)`;
                            }
                        }}
                        onMouseLeave={e => {
                            const el = e.currentTarget as HTMLButtonElement;
                            el.style.transform = 'translateY(0) scale(1)';
                            el.style.boxShadow = empty
                                ? 'none'
                                : `0 1px 2px rgba(2,35,102,0.06), inset 0 1px 0 rgba(255,255,255,0.14)`;
                        }}
                    >
                        {metric?.display ?? ''}
                    </button>
                );
            })}
        </>
    );
}
