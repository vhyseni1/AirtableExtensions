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
}

export function Tabs({active, onChange}: Props) {
    return (
        <nav
            role="tablist"
            style={{
                display: 'inline-flex',
                gap: 6,
                flexShrink: 0,
            }}
        >
            {TABS.map(tab => {
                const isActive = tab.key === active;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        type="button"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.key)}
                        style={{
                            padding: '6px 12px',
                            fontSize: 11,
                            fontWeight: isActive ? 700 : 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            border: `1px solid ${isActive ? tokens.colors.accent : tokens.colors.rule}`,
                            borderRadius: tokens.radius.sm,
                            background: isActive ? tokens.colors.accent : tokens.colors.bgPanel,
                            color: isActive ? '#FFFFFF' : tokens.colors.text,
                            cursor: 'pointer',
                            transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}
