import {type ReactNode} from 'react';
import {tokens} from '../../styles/tokens';

interface Props {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    children: ReactNode;
    minHeight?: number | string;
}

export function Panel({eyebrow, title, subtitle, actions, children, minHeight}: Props) {
    return (
        <section
            style={{
                background: tokens.colors.bgPanel,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.md,
                boxShadow: tokens.shadow.panel,
                display: 'flex',
                flexDirection: 'column',
                minHeight,
                overflow: 'hidden',
            }}
        >
            <header
                style={{
                    padding: `${tokens.space.sm} ${tokens.space.md}`,
                    borderBottom: `1px solid ${tokens.colors.ruleSoft}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: tokens.space.md,
                }}
            >
                <div style={{display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0}}>
                    {eyebrow ? <span className="cia-eyebrow">{eyebrow}</span> : null}
                    <h3
                        style={{
                            margin: 0,
                            fontFamily: tokens.fonts.serif,
                            fontSize: 'clamp(13px, 1.25vw, 16px)',
                            fontWeight: 600,
                            letterSpacing: '-0.005em',
                            color: tokens.colors.text,
                            lineHeight: 1.2,
                        }}
                    >
                        {title}
                    </h3>
                    {subtitle ? (
                        <span style={{fontSize: 11, color: tokens.colors.textMuted, lineHeight: 1.3}}>{subtitle}</span>
                    ) : null}
                </div>
                {actions ? <div style={{display: 'flex', gap: tokens.space.sm}}>{actions}</div> : null}
            </header>
            <div style={{padding: tokens.space.md, flex: 1, minHeight: 0}}>{children}</div>
        </section>
    );
}
