import {sevColor, tokens} from '../../styles/tokens';

interface Props {
    valueLabel?: string;
    scaleMeaning?: 'higher-worse' | 'higher-better' | 'neutral';
    interpretation?: string;
}

export function HeatmapLegend({valueLabel = 'Count of records', scaleMeaning = 'higher-worse', interpretation}: Props) {
    const readingLine =
        interpretation ??
        (scaleMeaning === 'higher-better'
            ? 'Higher = stronger signal. Darker cells = better.'
            : scaleMeaning === 'higher-worse'
                ? 'Higher = more concentrated impact. Darker + redder = hotter.'
                : 'Cells show the value below; color reflects severity band.');

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: tokens.space.lg,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: `linear-gradient(180deg, ${tokens.colors.bgPanel} 0%, ${tokens.colors.bgAlt} 100%)`,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: 8,
                marginBottom: tokens.space.md,
                fontSize: 11,
                color: tokens.colors.textMuted,
                lineHeight: 1.35,
                boxShadow: '0 1px 2px rgba(2,35,102,0.03)',
            }}
        >
            <LegendGroup label="Cell shows">
                <span style={{color: tokens.colors.text, fontWeight: 600}}>{valueLabel}</span>
            </LegendGroup>

            <Divider />

            <LegendGroup label="Severity">
                <SeverityRamp />
                <span style={{fontSize: 10, color: tokens.colors.textFaint, letterSpacing: '0.06em'}}>
                    LOW → HIGH
                </span>
            </LegendGroup>

            <Divider />

            <LegendGroup label="Shade">
                <IntensityRamp />
                <span style={{fontSize: 10, color: tokens.colors.textFaint, letterSpacing: '0.06em'}}>
                    FEW → MANY
                </span>
            </LegendGroup>

            <div
                style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontStyle: 'italic',
                    color: tokens.colors.textMuted,
                    fontSize: 11,
                }}
            >
                <span
                    aria-hidden
                    style={{
                        fontSize: 14,
                        color: scaleMeaning === 'higher-better' ? sevColor('Low') : sevColor('High'),
                        lineHeight: 1,
                    }}
                >
                    {scaleMeaning === 'higher-better' ? '↑' : '↗'}
                </span>
                {readingLine}
            </div>
        </div>
    );
}

function LegendGroup({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <span
                style={{
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: tokens.colors.textFaint,
                    fontWeight: 700,
                }}
            >
                {label}
            </span>
            {children}
        </div>
    );
}

function Divider() {
    return (
        <span
            aria-hidden
            style={{
                width: 1,
                height: 22,
                background: tokens.colors.rule,
            }}
        />
    );
}

function SeverityRamp() {
    return (
        <span
            aria-hidden
            style={{
                display: 'inline-block',
                width: 84,
                height: 12,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${sevColor('Low')} 0%, ${sevColor('Medium')} 50%, ${sevColor('High')} 100%)`,
                border: `1px solid ${tokens.colors.rule}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
        />
    );
}

function IntensityRamp() {
    return (
        <span
            aria-hidden
            style={{
                display: 'inline-block',
                width: 84,
                height: 12,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${sevColor('High')}18 0%, ${sevColor('High')}CC 100%)`,
                border: `1px solid ${tokens.colors.rule}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
        />
    );
}
