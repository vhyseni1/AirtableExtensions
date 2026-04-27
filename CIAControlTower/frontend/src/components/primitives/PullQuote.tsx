import {tokens} from '../../styles/tokens';

interface Props {
    quote: string;
    attribution?: string;
}

export function PullQuote({quote, attribution}: Props) {
    if (!quote.trim()) {
        return (
            <div style={{color: tokens.colors.textFaint, fontStyle: 'italic', fontSize: 13}}>
                No source quote captured for this impact.
            </div>
        );
    }
    return (
        <figure style={{margin: 0, padding: 0}}>
            <blockquote
                style={{
                    margin: 0,
                    padding: `${tokens.space.md} ${tokens.space.lg}`,
                    borderLeft: `3px solid ${tokens.colors.accent}`,
                    background: `${tokens.colors.accent}06`,
                    fontFamily: tokens.fonts.serif,
                    fontStyle: 'italic',
                    fontSize: 18,
                    lineHeight: 1.45,
                    color: tokens.colors.text,
                }}
            >
                <span style={{color: tokens.colors.accent, marginRight: 4}}>“</span>
                {quote.trim()}
                <span style={{color: tokens.colors.accent, marginLeft: 2}}>”</span>
            </blockquote>
            {attribution ? (
                <figcaption
                    style={{
                        marginTop: tokens.space.sm,
                        fontSize: 11,
                        color: tokens.colors.textMuted,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                    }}
                >
                    — {attribution}
                </figcaption>
            ) : null}
        </figure>
    );
}
