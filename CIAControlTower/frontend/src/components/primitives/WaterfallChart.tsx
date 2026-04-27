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
}

const KIND_COLOR: Record<StepKind, string> = {
    start: '#0B41CD',
    positive: '#FF7D29',
    negative: '#1482FA',
    subtotal: '#022366',
    end: '#00B458',
};

export function WaterfallChart({steps, onDrill, emptyLine}: Props) {
    if (steps.length === 0) {
        return <EmptyState line={emptyLine ?? 'No data for this waterfall.'} />;
    }

    const cumulative: number[] = [];
    let running = 0;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) continue;
        if (step.kind === 'start' || step.kind === 'subtotal' || step.kind === 'end') {
            running = step.value;
        } else if (step.kind === 'positive') {
            running += step.value;
        } else {
            running -= step.value;
        }
        cumulative.push(running);
    }
    const maxAbs = Math.max(1, ...steps.map(s => Math.abs(s.value)), ...cumulative);

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            {steps.map((step, i) => {
                const color = step.color ?? KIND_COLOR[step.kind];
                const isAnchor = step.kind === 'start' || step.kind === 'subtotal' || step.kind === 'end';
                const barValue = isAnchor ? cumulative[i] ?? step.value : Math.abs(step.value);
                const widthPct = (Math.max(0, barValue) / maxAbs) * 100;
                const drillRecords = step.records ?? [];
                const interactive = drillRecords.length > 0;

                return (
                    <button
                        key={`${step.label}-${i}`}
                        type="button"
                        disabled={!interactive}
                        onClick={() => onDrill(drillRecords, step.drillTitle ?? step.label)}
                        title={step.note ?? `${step.label}: ${step.value}`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '160px 1fr 64px',
                            alignItems: 'center',
                            gap: tokens.space.sm,
                            padding: '4px 6px',
                            border: `1px solid ${tokens.colors.ruleSoft}`,
                            borderRadius: tokens.radius.sm,
                            width: '100%',
                            textAlign: 'left',
                            cursor: interactive ? 'pointer' : 'default',
                            background: 'transparent',
                            transition: 'background 100ms ease',
                        }}
                        onMouseEnter={e => {
                            if (interactive) (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                    >
                        <div style={{display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0}}>
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: tokens.colors.text,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {step.label}
                            </span>
                            <span
                                style={{
                                    fontSize: 9,
                                    color: tokens.colors.textFaint,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    fontWeight: 600,
                                }}
                            >
                                {step.kind}
                            </span>
                        </div>
                        <div
                            style={{
                                position: 'relative',
                                height: 20,
                                background: tokens.colors.bgAlt,
                                borderRadius: 2,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    left: 0,
                                    width: `${widthPct}%`,
                                    background:
                                        step.kind === 'negative'
                                            ? `repeating-linear-gradient(45deg, ${color}, ${color} 6px, ${color}cc 6px, ${color}cc 12px)`
                                            : color,
                                    borderRadius: 2,
                                    transition: 'width 200ms ease',
                                }}
                            />
                        </div>
                        <span
                            className="cia-num"
                            style={{
                                fontFamily: tokens.fonts.serif,
                                fontSize: 14,
                                fontWeight: 600,
                                textAlign: 'right',
                                color:
                                    step.kind === 'negative'
                                        ? tokens.colors.accentSoft
                                        : step.kind === 'positive'
                                            ? tokens.colors.tagHeatmap
                                            : tokens.colors.text,
                            }}
                        >
                            {step.kind === 'positive' ? `+${step.value}` : step.kind === 'negative' ? `−${step.value}` : step.value}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
