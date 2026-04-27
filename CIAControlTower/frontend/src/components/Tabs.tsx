import {tokens} from '../styles/tokens';

export type TabKey = 'overview' | 'heatmaps' | 'waterfalls';

export interface TabSpec {
    key: TabKey;
    label: string;
    eyebrow: string;
}

export const TABS: ReadonlyArray<TabSpec> = [
    {key: 'overview', label: 'General overview', eyebrow: '01'},
    {key: 'heatmaps', label: 'Heat maps', eyebrow: '02'},
    {key: 'waterfalls', label: 'Waterfalls', eyebrow: '03'},
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
                display: 'flex',
                gap: 0,
                borderBottom: `1px solid ${tokens.colors.rule}`,
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
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 2,
                            padding: `${tokens.space.sm} ${tokens.space.md}`,
                            borderBottom: `2px solid ${isActive ? tokens.colors.accent : 'transparent'}`,
                            color: isActive ? tokens.colors.accent : tokens.colors.textMuted,
                            transition: 'color 120ms ease, border-color 120ms ease',
                            marginBottom: -1,
                        }}
                    >
                        <span
                            className="cia-num"
                            style={{
                                fontSize: 9,
                                letterSpacing: '0.14em',
                                color: isActive ? tokens.colors.accent : tokens.colors.textFaint,
                                fontWeight: 700,
                            }}
                        >
                            {tab.eyebrow}
                        </span>
                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: isActive ? 700 : 600,
                                letterSpacing: '0.02em',
                            }}
                        >
                            {tab.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
