import {tokens} from '../styles/tokens';

export type TabKey = 'overview' | 'heatmaps' | 'waterfalls' | 'flows' | 'radars';

export interface TabSpec {
    key: TabKey;
    label: string;
}

export const TABS: ReadonlyArray<TabSpec> = [
    {key: 'overview', label: 'Overview'},
    {key: 'heatmaps', label: 'Heat maps'},
    {key: 'waterfalls', label: 'Waterfalls'},
    {key: 'flows', label: 'Flows'},
    {key: 'radars', label: 'Radars'},
];

interface Props {
    active: TabKey;
    onChange: (key: TabKey) => void;
    /** Render for a dark (navy) background. */
    dark?: boolean;
}

export function Tabs({active, onChange, dark}: Props) {
    return (
        <nav role="tablist" style={{display: 'inline-flex', gap: 6, flexShrink: 0}}>
            {TABS.map(tab => {
                const isActive = tab.key === active;
                const style: React.CSSProperties = dark
                    ? {
                        border: `1px solid ${isActive ? '#FFFFFF' : 'rgba(255,255,255,0.28)'}`,
                        background: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.10)',
                        color: isActive ? tokens.colors.accentDeep : 'rgba(255,255,255,0.9)',
                    }
                    : {
                        border: `1px solid ${isActive ? tokens.colors.accent : tokens.colors.rule}`,
                        background: isActive ? tokens.colors.accent : tokens.colors.bgPanel,
                        color: isActive ? '#FFFFFF' : tokens.colors.text,
                    };
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        type="button"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.key)}
                        style={{
                            padding: '6px 13px',
                            fontSize: 11,
                            fontWeight: isActive ? 700 : 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            borderRadius: tokens.radius.sm,
                            cursor: 'pointer',
                            transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                            ...style,
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}
