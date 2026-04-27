import {type ReactNode} from 'react';
import {tokens} from '../../styles/tokens';

interface Props {
    eyebrow: string;
    value: ReactNode;
    suffix?: string;
    delta?: number | null;
    deltaInverse?: boolean;
    accent?: string;
    onClick?: () => void;
    active?: boolean;
}

function formatDelta(d: number): string {
    if (d === 0) return '±0';
    return d > 0 ? `+${d}` : `${d}`;
}

export function InsightTile({eyebrow, value, suffix, delta, deltaInverse, accent, onClick, active}: Props) {
    const interactive = !!onClick;
    const accentColor = accent ?? tokens.colors.accent;
    const deltaColor = (() => {
        if (delta == null || delta === 0) return tokens.colors.textFaint;
        const positive = delta > 0;
        const isBad = deltaInverse ? positive : !positive;
        return isBad ? tokens.colors.sevHigh : tokens.colors.sevLow;
    })();

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!interactive}
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: tokens.colors.bgPanel,
                borderRadius: tokens.radius.md,
                border: `1px solid ${active ? accentColor : tokens.colors.rule}`,
                boxShadow: active ? `0 0 0 1px ${accentColor}` : tokens.shadow.panel,
                textAlign: 'left',
                cursor: interactive ? 'pointer' : 'default',
                transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
                minHeight: 72,
                width: '100%',
            }}
            onMouseEnter={e => {
                if (interactive) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
        >
            <span
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: accentColor,
                    borderRadius: `${tokens.radius.md} ${tokens.radius.md} 0 0`,
                    opacity: active ? 1 : 0.5,
                }}
            />
            <span className="cia-eyebrow">{eyebrow}</span>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 4}}>
                <span
                    className="cia-num"
                    style={{
                        fontFamily: tokens.fonts.serif,
                        fontSize: 'clamp(20px, 2vw, 28px)',
                        lineHeight: 1,
                        fontWeight: 600,
                        color: tokens.colors.text,
                        letterSpacing: '-0.02em',
                    }}
                >
                    {value}
                </span>
                {suffix ? (
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: tokens.colors.textMuted,
                            marginLeft: 2,
                        }}
                    >
                        {suffix}
                    </span>
                ) : null}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: deltaColor,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    minHeight: 14,
                }}
            >
                {delta != null ? (
                    <>
                        <span className="cia-num">{formatDelta(delta)}</span>
                        <span style={{color: tokens.colors.textFaint, fontWeight: 500, textTransform: 'uppercase'}}>
                            vs prior run
                        </span>
                    </>
                ) : (
                    <span style={{color: tokens.colors.textFaint, fontWeight: 500}}>—</span>
                )}
            </div>
        </button>
    );
}
