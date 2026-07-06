import {useMemo} from 'react';
import {sevColor, tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {type Impact, CHANGE_CATEGORIES} from '../utils/schema';
import {EmptyState} from './primitives/EmptyState';
import {HeatmapLegend} from './primitives/HeatmapLegend';
import {Panel} from './primitives/Panel';

interface Props {
    aggregations: DashboardAggregations;
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}

type SeverityBand = 'high' | 'medium' | 'low' | 'none';

function severityBandFromAvg(avg: number): SeverityBand {
    if (avg >= 2.5) return 'high';
    if (avg >= 1.5) return 'medium';
    if (avg > 0) return 'low';
    return 'none';
}

function severityHexFromAvg(avg: number): string {
    const band = severityBandFromAvg(avg);
    if (band === 'high') return sevColor('High');
    if (band === 'medium') return sevColor('Medium');
    if (band === 'low') return sevColor('Low');
    return tokens.colors.textFaint;
}

/**
 * Pick a text color that reads on top of a tint-shaded cell background.
 * Yellow (medium) always gets dark text — even solid yellow is too luminous
 * for white text to read cleanly. Others flip to white once shade is opaque.
 */
function cellTextColor(band: SeverityBand, intensity: number): string {
    if (band === 'medium') return tokens.colors.text;
    if (intensity >= 0.6) return '#FFFFFF';
    return tokens.colors.text;
}

function withAlpha(hex: string, alpha: number): string {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return `${hex}${a}`;
}

const CATEGORY_PALETTE: Record<string, string> = {
    'Process & Workflow': '#022366',
    'Technology & Integration': '#0B41CD',
    'Data Ownership & Integrity': '#1482FA',
    'Analytics & Measurements': '#00B458',
    'Roles & Responsibilities': '#FF1F26',
    'Skill & Capability': '#FFD60C',
    'Mindset & Cultural Sentiment': '#BC36F0',
    'Engagement & Communication': '#FF7D29',
};

export function HeatMap({aggregations, filtered, onDrill}: Props) {
    const {matrix, affiliateSlices: slices} = aggregations;

    const slicesMax = useMemo(
        () => slices.reduce((m, l) => Math.max(m, l.total), 0),
        [slices],
    );

    const max = matrix.maxCellCount || 1;

    return (
        <Panel
            eyebrow="Zone 02"
            title="Where the impact concentrates"
            subtitle="Change_Component × Role — cell shading by count, color by avg Change_Impact"
        >
            {matrix.components.length === 0 || matrix.rows.length === 0 ? (
                <EmptyState line="No components or roles in scope. Adjust filters to see the matrix." />
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.xl}}>
                    <HeatmapLegend
                        valueLabel="Count of impact records"
                        scaleMeaning="higher-worse"
                    />
                    <Matrix matrix={matrix} max={max} onDrill={onDrill} />
                    <div>
                        <SectionHeading title="By Affiliate" subtitle="Change_Category mix per affiliate" />
                        {slices.length === 0 ? (
                            <EmptyState line="No affiliate tagging in scope." />
                        ) : (
                            <AffiliateStack
                                slices={slices}
                                totalsMax={slicesMax}
                                filtered={filtered}
                                onDrill={onDrill}
                            />
                        )}
                    </div>
                </div>
            )}
        </Panel>
    );
}

function SectionHeading({title, subtitle}: {title: string; subtitle: string}) {
    return (
        <div style={{display: 'flex', alignItems: 'baseline', gap: tokens.space.md, marginBottom: tokens.space.sm}}>
            <h4
                style={{
                    margin: 0,
                    fontFamily: tokens.fonts.serif,
                    fontSize: 14,
                    fontWeight: 600,
                    color: tokens.colors.text,
                }}
            >
                {title}
            </h4>
            <span style={{fontSize: 11, color: tokens.colors.textMuted}}>{subtitle}</span>
        </div>
    );
}

interface MatrixProps {
    matrix: DashboardAggregations['matrix'];
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}

function Matrix({matrix, max, onDrill}: MatrixProps) {
    const rows = matrix.rows;
    const components = matrix.components;
    const colSize = `minmax(84px, 1fr)`;

    return (
        <div style={{overflowX: 'auto'}} className="cia-scroll">
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `160px repeat(${components.length}, ${colSize})`,
                    gap: 4,
                    minWidth: 160 + components.length * 84,
                }}
            >
                <div />
                {components.map(c => (
                    <ColHeader key={c} label={c} total={matrix.componentTotals.get(c) ?? 0} />
                ))}
                {rows.map(rowKey => (
                    <RowFragment
                        key={rowKey}
                        rowLabel={rowKey}
                        rowTotal={matrix.rowTotals.get(rowKey) ?? 0}
                        components={components}
                        cells={matrix.cells}
                        max={max}
                        onDrill={onDrill}
                    />
                ))}
            </div>
        </div>
    );
}

function ColHeader({label, total}: {label: string; total: number}) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                fontSize: 10,
                color: tokens.colors.textMuted,
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '4px 6px',
                textAlign: 'center',
                lineHeight: 1.2,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                textTransform: 'uppercase',
                minHeight: 28,
                gap: 2,
            }}
            title={`${label} · ${total}`}
        >
            <span>{label}</span>
            <span className="cia-num" style={{color: tokens.colors.textFaint, fontSize: 9}}>
                {total}
            </span>
        </div>
    );
}

interface RowFragmentProps {
    rowLabel: string;
    rowTotal: number;
    components: string[];
    cells: DashboardAggregations['matrix']['cells'];
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}

function RowFragment({rowLabel, rowTotal, components, cells, max, onDrill}: RowFragmentProps) {
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
                    borderRight: `1px solid ${tokens.colors.ruleSoft}`,
                    gap: 6,
                    overflow: 'hidden',
                }}
                title={rowLabel}
            >
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {rowLabel}
                </span>
                <span className="cia-num" style={{color: tokens.colors.textFaint, fontWeight: 500}}>
                    {rowTotal}
                </span>
            </div>
            {components.map(c => {
                const cell = cells.get(c)?.get(rowLabel);
                const count = cell?.count ?? 0;
                const intensity = count === 0 ? 0 : 0.15 + (count / max) * 0.7;
                const band = severityBandFromAvg(cell?.avgSev ?? 0);
                const color = severityHexFromAvg(cell?.avgSev ?? 0);
                const bg = count === 0 ? tokens.colors.bgAlt : withAlpha(color, intensity);
                return (
                    <button
                        key={c}
                        type="button"
                        disabled={count === 0}
                        onClick={() => onDrill(cell?.records ?? [], `${rowLabel} · ${c}`)}
                        title={
                            count === 0
                                ? 'No impacts'
                                : `${count} impact${count === 1 ? '' : 's'} · avg severity ${(cell?.avgSev ?? 0).toFixed(1)}`
                        }
                        style={{
                            background: bg,
                            border: `1px solid ${count > 0 ? withAlpha(color, 0.4) : tokens.colors.ruleSoft}`,
                            borderRadius: tokens.radius.sm,
                            minHeight: 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: tokens.fonts.mono,
                            fontSize: 12,
                            fontWeight: 700,
                            color: count === 0 ? tokens.colors.textFaint : cellTextColor(band, intensity),
                            cursor: count === 0 ? 'default' : 'pointer',
                            transition: 'transform 80ms ease',
                        }}
                        onMouseEnter={e => {
                            if (count > 0) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
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

function AffiliateStack({
    slices,
    totalsMax,
    filtered,
    onDrill,
}: {
    slices: DashboardAggregations['affiliateSlices'];
    totalsMax: number;
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
            {slices.map(slice => {
                const widthPct = totalsMax ? (slice.total / totalsMax) * 100 : 0;
                return (
                    <div
                        key={slice.label}
                        style={{display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: tokens.space.md, alignItems: 'center'}}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: tokens.colors.text,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {slice.label}
                        </span>
                        <div
                            style={{
                                position: 'relative',
                                height: 22,
                                background: tokens.colors.bgAlt,
                                borderRadius: tokens.radius.sm,
                                overflow: 'hidden',
                                width: `${widthPct}%`,
                                minWidth: 4,
                                display: 'flex',
                            }}
                        >
                            {CHANGE_CATEGORIES.map(cat => {
                                const segCount = slice.byCategory.get(cat) ?? 0;
                                if (segCount === 0) return null;
                                const segPct = (segCount / slice.total) * 100;
                                const color = CATEGORY_PALETTE[cat] ?? tokens.colors.accent;
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        title={`${cat}: ${segCount}`}
                                        onClick={() =>
                                            onDrill(
                                                filtered.filter(
                                                    r => r.affiliate === slice.label && r.changeCategory === cat,
                                                ),
                                                `${slice.label} · ${cat}`,
                                            )
                                        }
                                        style={{
                                            width: `${segPct}%`,
                                            background: color,
                                            border: 'none',
                                            cursor: 'pointer',
                                        }}
                                    />
                                );
                            })}
                        </div>
                        <span
                            className="cia-num"
                            style={{
                                fontSize: 12,
                                color: tokens.colors.text,
                                fontWeight: 600,
                                textAlign: 'right',
                            }}
                        >
                            {slice.total}
                        </span>
                    </div>
                );
            })}
            <div
                style={{
                    marginTop: tokens.space.sm,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: tokens.space.md,
                    fontSize: 10,
                    color: tokens.colors.textMuted,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                }}
            >
                {CHANGE_CATEGORIES.map(c => (
                    <span key={c} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                background: CATEGORY_PALETTE[c],
                                borderRadius: 1,
                                display: 'inline-block',
                            }}
                        />
                        {c}
                    </span>
                ))}
            </div>
        </div>
    );
}
