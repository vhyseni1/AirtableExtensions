import {sevColor, tokens} from '../../styles/tokens';
import {type ComponentRollup} from '../../utils/aggregations';
import {type Impact} from '../../utils/schema';
import {EmptyState} from '../primitives/EmptyState';
import {Panel} from '../primitives/Panel';

interface Props {
    components: ComponentRollup[];
    onDrill: (records: Impact[], title: string) => void;
}

export function WhereTheHeatIs({components, onDrill}: Props) {
    const max = Math.max(1, ...components.map(c => c.total));
    return (
        <Panel
            eyebrow="Panel A"
            title="Where the heat is"
            subtitle="Top components by impact volume, banded by severity"
        >
            {components.length === 0 ? (
                <EmptyState line="No components in scope." />
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                    {components.map(c => (
                        <Bar key={c.component} comp={c} max={max} onDrill={onDrill} />
                    ))}
                </div>
            )}
        </Panel>
    );
}

function Bar({
    comp,
    max,
    onDrill,
}: {
    comp: ComponentRollup;
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}) {
    const widthPct = (comp.total / max) * 100;
    const segs = [
        {label: 'High', count: comp.high, color: sevColor('High')},
        {label: 'Medium', count: comp.medium, color: sevColor('Medium')},
        {label: 'Low', count: comp.low, color: sevColor('Low')},
    ];
    return (
        <button
            type="button"
            onClick={() => onDrill(comp.records, comp.component)}
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 36px',
                alignItems: 'center',
                gap: tokens.space.md,
                padding: tokens.space.sm,
                border: `1px solid ${tokens.colors.ruleSoft}`,
                borderRadius: tokens.radius.sm,
                width: '100%',
                textAlign: 'left',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${tokens.colors.accent}06`;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
        >
            <div style={{display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0}}>
                <div
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: tokens.colors.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {comp.component}
                </div>
                <div
                    style={{
                        position: 'relative',
                        height: 14,
                        background: tokens.colors.bgAlt,
                        borderRadius: 2,
                        overflow: 'hidden',
                    }}
                >
                    <div style={{display: 'flex', width: `${widthPct}%`, height: '100%'}}>
                        {segs.map(s =>
                            s.count > 0 ? (
                                <div
                                    key={s.label}
                                    title={`${s.label}: ${s.count}`}
                                    style={{
                                        flex: s.count,
                                        background: s.color,
                                    }}
                                />
                            ) : null,
                        )}
                    </div>
                </div>
            </div>
            <span
                className="cia-num"
                style={{
                    fontFamily: tokens.fonts.serif,
                    fontSize: 18,
                    fontWeight: 600,
                    color: tokens.colors.text,
                    textAlign: 'right',
                }}
            >
                {comp.total}
            </span>
        </button>
    );
}
