import {useEffect, useState, type ReactNode} from 'react';
import {tokens} from '../../styles/tokens';
import {Panel} from './Panel';

interface Props {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    /** Controls rendered top-right, next to the expand button. */
    actions?: ReactNode;
    /** Render function receiving whether it's the full-screen instance. */
    children: (fullscreen: boolean) => ReactNode;
}

const iconBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.sm,
    border: `1px solid ${tokens.colors.rule}`,
    background: tokens.colors.bgPanel,
    color: tokens.colors.textMuted,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
};

export function ChartPanel({eyebrow, title, subtitle, actions, children}: Props) {
    const [fs, setFs] = useState(false);

    useEffect(() => {
        if (!fs) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setFs(false);
        };
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [fs]);

    const expandBtn = (
        <button type="button" title="Expand to full screen" onClick={() => setFs(true)} style={iconBtn} aria-label="Expand">
            ⤢
        </button>
    );

    return (
        <>
            <Panel
                eyebrow={eyebrow}
                title={title}
                subtitle={subtitle}
                actions={
                    <div style={{display: 'flex', gap: tokens.space.sm, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                        {actions}
                        {expandBtn}
                    </div>
                }
            >
                {children(false)}
            </Panel>

            {fs ? (
                <div
                    onClick={() => setFs(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(2,35,102,0.45)',
                        backdropFilter: 'blur(3px)',
                        zIndex: 200,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: tokens.space.xl,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: tokens.colors.bgPanel,
                            borderRadius: tokens.radius.lg,
                            boxShadow: '0 24px 60px rgba(2,35,102,0.35)',
                            width: 'min(97vw, 1900px)',
                            maxHeight: '94vh',
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        className="cia-scroll"
                    >
                        <header
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: tokens.space.md,
                                padding: `${tokens.space.md} ${tokens.space.lg}`,
                                borderBottom: `1px solid ${tokens.colors.rule}`,
                                position: 'sticky',
                                top: 0,
                                background: tokens.colors.bgPanel,
                                zIndex: 1,
                            }}
                        >
                            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                {eyebrow ? <span className="cia-eyebrow">{eyebrow}</span> : null}
                                <h3
                                    style={{
                                        margin: 0,
                                        fontFamily: tokens.fonts.serif,
                                        fontSize: 20,
                                        fontWeight: 600,
                                        color: tokens.colors.text,
                                    }}
                                >
                                    {title}
                                </h3>
                                {subtitle ? (
                                    <span style={{fontSize: 12, color: tokens.colors.textMuted}}>{subtitle}</span>
                                ) : null}
                            </div>
                            <div style={{display: 'flex', gap: tokens.space.sm, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                                {actions}
                                <button
                                    type="button"
                                    onClick={() => setFs(false)}
                                    style={{
                                        padding: '6px 12px',
                                        border: `1px solid ${tokens.colors.rule}`,
                                        borderRadius: tokens.radius.sm,
                                        background: tokens.colors.bgPanel,
                                        color: tokens.colors.text,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Close ✕
                                </button>
                            </div>
                        </header>
                        <div style={{padding: tokens.space.xl, flex: 1}}>{children(true)}</div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
