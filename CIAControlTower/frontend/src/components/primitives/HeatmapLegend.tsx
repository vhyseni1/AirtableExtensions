import {sevColor, tokens} from '../../styles/tokens';

interface Props {
    /** What the cell value represents. Default: 'Count of records'. */
    valueLabel?: string;
    /**
     * How to read the numbers.
     * 'higher-worse' — cells with bigger numbers mean more concentrated impact (default for count / severity).
     * 'higher-better' — cells with bigger numbers mean stronger positive signal (e.g. confidence).
     */
    scaleMeaning?: 'higher-worse' | 'higher-better' | 'neutral';
    /** Optional custom rule of thumb. Overrides scaleMeaning if provided. */
    interpretation?: string;
}

export function HeatmapLegend({valueLabel = 'Count of records', scaleMeaning = 'higher-worse', interpretation}: Props) {
    const readingLine =
        interpretation ??
        (scaleMeaning === 'higher-better'
            ? 'Higher = stronger signal. More filled = better.'
            : scaleMeaning === 'higher-worse'
                ? 'Higher = more concentrated impact. Darker + redder = hotter.'
                : 'Cells show the value below; color reflects severity band.');

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: tokens.space.md,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: tokens.colors.bgAlt,
                border: `1px solid ${tokens.colors.ruleSoft}`,
                borderRadius: tokens.radius.sm,
                marginBottom: tokens.space.md,
                fontSize: 11,
                color: tokens.colors.textMuted,
                lineHeight: 1.35,
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: tokens.colors.textFaint,
                        fontWeight: 700,
                    }}
                >
                    Cell value
                </span>
                <span style={{color: tokens.colors.text, fontWeight: 600}}>{valueLabel}</span>
            </div>

            <div
                aria-hidden
                style={{
                    width: 1,
                    height: 20,
                    background: tokens.colors.rule,
                }}
            />

            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <span
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: tokens.colors.textFaint,
                        fontWeight: 700,
                    }}
                >
                    Color
                </span>
                {(['Low', 'Medium', 'High'] as const).map(sev => (
                    <span key={sev} style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                background: sevColor(sev),
                                borderRadius: 2,
                                display: 'inline-block',
                            }}
                        />
                        <span style={{color: tokens.colors.text, fontWeight: 500}}>{sev}</span>
                    </span>
                ))}
            </div>

            <div
                aria-hidden
                style={{
                    width: 1,
                    height: 20,
                    background: tokens.colors.rule,
                }}
            />

            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: tokens.colors.textFaint,
                        fontWeight: 700,
                    }}
                >
                    Shade
                </span>
                <SwatchGradient />
                <span style={{color: tokens.colors.text, fontWeight: 500}}>Higher count = darker</span>
            </div>

            <div
                style={{
                    marginLeft: 'auto',
                    fontStyle: 'italic',
                    color: tokens.colors.textFaint,
                    fontSize: 11,
                }}
            >
                {readingLine}
            </div>
        </div>
    );
}

function SwatchGradient() {
    return (
        <span
            aria-hidden
            style={{
                width: 60,
                height: 10,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${sevColor('High')}22 0%, ${sevColor('High')}CC 100%)`,
                border: `1px solid ${tokens.colors.rule}`,
                display: 'inline-block',
            }}
        />
    );
}
