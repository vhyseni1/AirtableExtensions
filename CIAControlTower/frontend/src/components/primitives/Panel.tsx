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
                    padding: `${tokens.space.md} ${tokens.space.lg}`,
                    borderBottom: `1px solid ${tokens.colors.ruleSoft}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: tokens.space.md,
                }}
            >
                <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                    {eyebrow ? <span className="cia-eyebrow">{eyebrow}</span> : null}
                    <h3
                        style={{
                            margin: 0,
                            fontFamily: tokens.fonts.serif,
                            fontSize: 18,
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            color: tokens.colors.text,
                        }}
                    >
                        {title}
                    </h3>
                    {subtitle ? (
                        <span style={{fontSize: 12, color: tokens.colors.textMuted}}>{subtitle}</span>
                    ) : null}
                </div>
                {actions ? <div style={{display: 'flex', gap: tokens.space.sm}}>{actions}</div> : null}
            </header>
            <div style={{padding: tokens.space.lg, flex: 1, minHeight: 0}}>{children}</div>
        </section>
    );
}
