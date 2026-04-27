import {useMemo} from 'react';
import {sevColor, tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {type Impact, type Persona, CATEGORIES} from '../utils/schema';
import {EmptyState} from './primitives/EmptyState';
import {Panel} from './primitives/Panel';

interface Props {
    aggregations: DashboardAggregations;
    filtered: Impact[];
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

const CATEGORY_PALETTE: Record<string, string> = {
    'Process & Workflow': '#0A3D62',
    'Technology & Integration': '#1F5A85',
    'Data Ownership & Integrity': '#5C3A8A',
    'Analytics & Measurements': '#3B7A5A',
    'Role & Responsibility': '#B23A3A',
    'Skill & Capability': '#C7882C',
    'Mindset & Cultural Sentiment': '#A8324A',
    'Engagement & Communication': '#D4592C',
};

export function HeatMap({aggregations, filtered, onDrill}: Props) {
    const {matrix, lenses} = aggregations;

    const lensTotalsMax = useMemo(
        () => lenses.reduce((m, l) => Math.max(m, l.total), 0),
        [lenses],
    );

    const max = matrix.maxCellCount || 1;

    return (
        <Panel
            eyebrow="Zone 02"
            title="Where the impact concentrates"
            subtitle="Component × Persona — cell shading by count, color by average severity"
        >
            {matrix.components.length === 0 ? (
                <EmptyState line="No components in scope. Adjust filters to see the matrix." />
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.xl}}>
                    <Matrix matrix={matrix} max={max} onDrill={onDrill} />
                    <div>
                        <SectionHeading title="By Lens" subtitle="Categorical pillar mix per Global / MWM / Affiliate" />
                        {lenses.length === 0 ? (
                            <EmptyState line="No lens tagging in scope." />
                        ) : (
                            <LensStack
                                lenses={lenses}
                                totalsMax={lensTotalsMax}
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
    const personas = matrix.personas;
    const components = matrix.components;
    const colSize = `minmax(84px, 1fr)`;

    return (
        <div style={{overflowX: 'auto'}} className="cia-scroll">
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${components.length}, ${colSize})`,
                    gap: 4,
                    minWidth: 120 + components.length * 84,
                }}
            >
                <div />
                {components.map(c => (
                    <ColHeader key={c} label={c} total={matrix.componentTotals.get(c) ?? 0} />
                ))}
                {personas.map(p => (
                    <RowFragment
                        key={p}
                        persona={p}
                        personaTotal={matrix.personaTotals.get(p) ?? 0}
                        components={components}
                        cells={matrix.cells}
                        max={max}
                        onDrill={onDrill}
                    />
                ))}
            </div>
            <Legend />
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
    persona: Persona;
    personaTotal: number;
    components: string[];
    cells: DashboardAggregations['matrix']['cells'];
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}

function RowFragment({persona, personaTotal, components, cells, max, onDrill}: RowFragmentProps) {
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
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderRight: `1px solid ${tokens.colors.ruleSoft}`,
                }}
            >
                <span>{persona}</span>
                <span className="cia-num" style={{color: tokens.colors.textFaint, fontWeight: 500}}>
                    {personaTotal}
                </span>
            </div>
            {components.map(c => {
                const cell = cells.get(c)?.get(persona);
                const count = cell?.count ?? 0;
                const intensity = count === 0 ? 0 : 0.15 + (count / max) * 0.7;
                const color = severityHexFromAvg(cell?.avgSev ?? 0);
                const bg = count === 0 ? tokens.colors.bgAlt : withAlpha(color, intensity);
                return (
                    <button
                        key={c}
                        type="button"
                        disabled={count === 0}
                        onClick={() => onDrill(cell?.records ?? [], `${persona} · ${c}`)}
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
                            fontWeight: 600,
                            color: count === 0 ? tokens.colors.textFaint : intensity > 0.55 ? '#fff' : color,
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

function Legend() {
    return (
        <div
            style={{
                display: 'flex',
                gap: tokens.space.lg,
                marginTop: tokens.space.md,
                fontSize: 10,
                color: tokens.colors.textMuted,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                alignItems: 'center',
            }}
        >
            <span>Severity</span>
            {(['Low', 'Medium', 'High'] as const).map(s => (
                <span key={s} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            background: sevColor(s),
                            borderRadius: 2,
                            display: 'inline-block',
                        }}
                    />
                    {s}
                </span>
            ))}
            <span style={{marginLeft: 'auto'}}>Cell shade ∝ count · color ∝ avg severity</span>
        </div>
    );
}

function LensStack({
    lenses,
    totalsMax,
    filtered,
    onDrill,
}: {
    lenses: DashboardAggregations['lenses'];
    totalsMax: number;
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}) {
    const lensKeyOf = (r: Impact): string =>
        r.lens === 'Affiliate' && r.affiliateCountry ? `Affiliate · ${r.affiliateCountry}` : r.lens ?? '';
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
            {lenses.map(lens => {
                const widthPct = totalsMax ? (lens.total / totalsMax) * 100 : 0;
                return (
                    <div
                        key={lens.label}
                        style={{display: 'grid', gridTemplateColumns: '160px 1fr 60px', gap: tokens.space.md, alignItems: 'center'}}
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
                            {lens.label}
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
                            {CATEGORIES.map(cat => {
                                const segCount = lens.byCategory.get(cat) ?? 0;
                                if (segCount === 0) return null;
                                const segPct = (segCount / lens.total) * 100;
                                const color = CATEGORY_PALETTE[cat] ?? tokens.colors.accent;
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        title={`${cat}: ${segCount}`}
                                        onClick={() =>
                                            onDrill(
                                                filtered.filter(
                                                    r => lensKeyOf(r) === lens.label && r.category === cat,
                                                ),
                                                `${lens.label} · ${cat}`,
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
                            {lens.total}
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
                {CATEGORIES.map(c => (
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
