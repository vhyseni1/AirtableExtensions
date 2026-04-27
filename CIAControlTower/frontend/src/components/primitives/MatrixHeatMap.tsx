import {useMemo} from 'react';
import {sevColor, tokens} from '../../styles/tokens';
import {SEVERITY_WEIGHT, type Impact, type Severity} from '../../utils/schema';
import {EmptyState} from './EmptyState';

export type Orientation = 'rotate' | 'flat' | 'wrap';

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
    onDrill: (records: Impact[], title: string) => void;
}

function severityHexFromAvg(avg: number): string {
    if (avg >= 2.5) return sevColor('High');
    if (avg >= 1.5) return sevColor('Medium');
    if (avg > 0) return sevColor('Low');
    return tokens.colors.textFaint;
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
        if (r.severity) {
            cell.avgSev = (cell.avgSev * (cell.count - 1) + SEVERITY_WEIGHT[r.severity as Severity]) / cell.count;
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
    onDrill,
}: MatrixHeatMapProps) {
    const {rows, cols, cells, rowTotals, colTotals, maxCount} = useMemo(
        () => build(records, rowKey, colKey, rowOrder, colOrder),
        [records, rowKey, colKey, rowOrder, colOrder],
    );

    if (rows.length === 0 || cols.length === 0) {
        return <EmptyState line="No data in scope for this matrix." />;
    }

    return (
        <div style={{overflowX: 'auto'}} className="cia-scroll">
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${cols.length}, minmax(${minColWidth}px, 1fr))`,
                    gap: 3,
                    minWidth: 120 + cols.length * minColWidth,
                }}
            >
                <div
                    style={{
                        fontSize: 9,
                        color: tokens.colors.textFaint,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        alignSelf: 'end',
                        paddingBottom: 4,
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
                        max={maxCount}
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
                    fontSize: 10,
                    color: tokens.colors.textMuted,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    padding: '4px 6px',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    minHeight: 28,
                }}
                title={`${label} · ${total}`}
            >
                <div style={{textTransform: 'uppercase'}}>{label}</div>
                <div className="cia-num" style={{color: tokens.colors.textFaint, fontSize: 9, marginTop: 2}}>
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
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}

function RowFragment({row, rowTotal, cols, cells, max, onDrill}: RowFragmentProps) {
    return (
        <>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 8px',
                    fontSize: 11,
                    color: tokens.colors.text,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderRight: `1px solid ${tokens.colors.ruleSoft}`,
                    minHeight: 36,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                title={row}
            >
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{row}</span>
                <span className="cia-num" style={{color: tokens.colors.textFaint, fontWeight: 500, marginLeft: 4}}>
                    {rowTotal}
                </span>
            </div>
            {cols.map(c => {
                const cell = cells.get(row)?.get(c);
                const count = cell?.count ?? 0;
                const intensity = count === 0 ? 0 : 0.18 + (count / max) * 0.7;
                const color = severityHexFromAvg(cell?.avgSev ?? 0);
                const bg = count === 0 ? tokens.colors.bgAlt : withAlpha(color, intensity);
                return (
                    <button
                        key={c}
                        type="button"
                        disabled={count === 0}
                        onClick={() => onDrill(cell?.records ?? [], `${row} · ${c}`)}
                        title={
                            count === 0
                                ? 'No impacts'
                                : `${count} impact${count === 1 ? '' : 's'} · avg severity ${(cell?.avgSev ?? 0).toFixed(1)}`
                        }
                        style={{
                            background: bg,
                            border: `1px solid ${count > 0 ? withAlpha(color, 0.4) : tokens.colors.ruleSoft}`,
                            borderRadius: tokens.radius.sm,
                            minHeight: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: tokens.fonts.mono,
                            fontSize: 11,
                            fontWeight: 600,
                            color: count === 0 ? tokens.colors.textFaint : intensity > 0.55 ? '#fff' : color,
                            cursor: count === 0 ? 'default' : 'pointer',
                            transition: 'transform 80ms ease',
                        }}
                        onMouseEnter={e => {
                            if (count > 0) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                        }}
                    >
                        {count > 0 ? count : ''}
                    </button>
                );
            })}
        </>
    );
}
