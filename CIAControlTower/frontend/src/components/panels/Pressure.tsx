import {sevColor, tokens} from '../../styles/tokens';
import {type PersonaRollup} from '../../utils/aggregations';
import {type Impact} from '../../utils/schema';
import {EmptyState} from '../primitives/EmptyState';
import {Panel} from '../primitives/Panel';

interface Props {
    pressure: PersonaRollup[];
    onDrill: (records: Impact[], title: string) => void;
}

function severityHexFromAvg(avg: number): string {
    if (avg >= 2.5) return sevColor('High');
    if (avg >= 1.5) return sevColor('Medium');
    if (avg > 0) return sevColor('Low');
    return tokens.colors.textFaint;
}

export function PressurePanel({pressure, onDrill}: Props) {
    const max = Math.max(1, ...pressure.map(p => p.count));
    return (
        <Panel
            eyebrow="Panel C"
            title="Who's under pressure"
            subtitle="Burnout/overload signals by persona"
        >
            {pressure.length === 0 ? (
                <EmptyState line="No persona pressure recorded. Sustainable load." />
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                    {pressure.map(p => (
                        <Thermometer key={p.persona} row={p} max={max} onDrill={onDrill} />
                    ))}
                </div>
            )}
        </Panel>
    );
}

function Thermometer({
    row,
    max,
    onDrill,
}: {
    row: PersonaRollup;
    max: number;
    onDrill: (records: Impact[], title: string) => void;
}) {
    const widthPct = (row.count / max) * 100;
    const color = severityHexFromAvg(row.avgSev);
    return (
        <button
            type="button"
            onClick={() => onDrill(row.records, `Pressure · ${row.persona}`)}
            className={row.avgSev >= 2.5 ? 'cia-pulse' : undefined}
            style={{
                display: 'grid',
                gridTemplateColumns: '64px 1fr 36px',
                alignItems: 'center',
                gap: tokens.space.md,
                padding: tokens.space.sm,
                border: `1px solid ${tokens.colors.ruleSoft}`,
                borderRadius: tokens.radius.sm,
                width: '100%',
                textAlign: 'left',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
        >
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: tokens.colors.text,
                }}
            >
                {row.persona}
            </span>
            <div
                style={{
                    position: 'relative',
                    height: 18,
                    background: tokens.colors.bgAlt,
                    borderRadius: 999,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${color}aa 0%, ${color} 100%)`,
                        borderRadius: 999,
                    }}
                />
            </div>
            <span
                className="cia-num"
                style={{
                    fontFamily: tokens.fonts.serif,
                    fontSize: 16,
                    fontWeight: 600,
                    color: tokens.colors.text,
                    textAlign: 'right',
                }}
            >
                {row.count}
            </span>
        </button>
    );
}
