import {tokens} from '../styles/tokens';
import {
    DEFAULT_FILTER,
    type AffiliateFilter,
    type FilterState,
    type ImpactFilter,
} from '../hooks/useFilteredImpacts';
import {
    AFFILIATES,
    BUSINESS_ARCHETYPES,
    CHANGE_IMPACTS,
    PERSONAS,
    TAGS,
    type BusinessArchetype,
    type Persona,
    type Tag,
} from '../utils/schema';
import {TagChip} from './primitives/TagChip';

interface Props {
    filter: FilterState;
    onChange: (next: FilterState) => void;
    runs: string[];
    freshness: string | null;
}

const segmentBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px',
    background: active ? tokens.colors.accent : 'transparent',
    color: active ? '#fff' : tokens.colors.textMuted,
    border: `1px solid ${active ? tokens.colors.accent : tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    transition: 'background 120ms ease',
});

const chipBtn = (active: boolean): React.CSSProperties => ({
    padding: '3px 9px',
    background: active ? tokens.colors.text : 'transparent',
    color: active ? tokens.colors.bg : tokens.colors.textMuted,
    border: `1px solid ${active ? tokens.colors.text : tokens.colors.rule}`,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
});

export function FilterBar({filter, onChange, runs, freshness}: Props) {
    const togglePersona = (p: Persona) => {
        const next = filter.personas.includes(p)
            ? filter.personas.filter(x => x !== p)
            : [...filter.personas, p];
        onChange({...filter, personas: next});
    };
    const toggleTag = (t: Tag) => {
        const next = filter.tags.includes(t) ? filter.tags.filter(x => x !== t) : [...filter.tags, t];
        onChange({...filter, tags: next});
    };
    const toggleArchetype = (a: BusinessArchetype) => {
        const next = filter.archetypes.includes(a)
            ? filter.archetypes.filter(x => x !== a)
            : [...filter.archetypes, a];
        onChange({...filter, archetypes: next});
    };

    const isDefault =
        filter.sourceRun === DEFAULT_FILTER.sourceRun &&
        filter.affiliate === DEFAULT_FILTER.affiliate &&
        filter.archetypes.length === 0 &&
        filter.personas.length === 0 &&
        filter.tags.length === 0 &&
        filter.changeImpact === DEFAULT_FILTER.changeImpact;

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: tokens.space.lg,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: tokens.colors.bgPanel,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.md,
            }}
        >
            <Group label="Run">
                <select
                    value={filter.sourceRun}
                    onChange={e => onChange({...filter, sourceRun: e.target.value as FilterState['sourceRun']})}
                    style={{
                        padding: '4px 8px',
                        border: `1px solid ${tokens.colors.rule}`,
                        borderRadius: tokens.radius.sm,
                        fontSize: 12,
                        background: tokens.colors.bg,
                        fontFamily: tokens.fonts.mono,
                        color: tokens.colors.text,
                        minWidth: 180,
                    }}
                >
                    <option value="All">All runs</option>
                    {runs.map(r => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            </Group>

            <Group label="Affiliate">
                <select
                    value={filter.affiliate}
                    onChange={e => onChange({...filter, affiliate: e.target.value as AffiliateFilter})}
                    style={{
                        padding: '4px 8px',
                        border: `1px solid ${tokens.colors.rule}`,
                        borderRadius: tokens.radius.sm,
                        fontSize: 12,
                        background: tokens.colors.bg,
                        fontFamily: tokens.fonts.mono,
                        color: tokens.colors.text,
                        minWidth: 100,
                    }}
                >
                    <option value="All">All</option>
                    {AFFILIATES.map(a => (
                        <option key={a} value={a}>
                            {a}
                        </option>
                    ))}
                </select>
            </Group>

            <Group label="Impact">
                <Segmented<ImpactFilter>
                    options={['All', ...CHANGE_IMPACTS]}
                    value={filter.changeImpact}
                    onChange={v => onChange({...filter, changeImpact: v})}
                />
            </Group>

            <Group label="Archetype">
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                    {BUSINESS_ARCHETYPES.map(a => (
                        <button
                            key={a}
                            type="button"
                            onClick={() => toggleArchetype(a)}
                            style={chipBtn(filter.archetypes.includes(a))}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            </Group>

            <Group label="Persona">
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                    {PERSONAS.map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => togglePersona(p)}
                            style={chipBtn(filter.personas.includes(p))}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </Group>

            <Group label="Tags">
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                    {TAGS.map(t => (
                        <TagChip
                            key={t}
                            tag={t}
                            active={filter.tags.includes(t)}
                            onClick={() => toggleTag(t)}
                        />
                    ))}
                </div>
            </Group>

            <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: tokens.space.md}}>
                {freshness ? (
                    <span
                        style={{
                            fontSize: 11,
                            color: tokens.colors.textFaint,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Last extract · <span className="cia-num">{freshness}</span>
                    </span>
                ) : null}
                {!isDefault ? (
                    <button
                        type="button"
                        onClick={() => onChange(DEFAULT_FILTER)}
                        style={{
                            padding: '4px 10px',
                            border: `1px solid ${tokens.colors.rule}`,
                            borderRadius: tokens.radius.sm,
                            fontSize: 11,
                            color: tokens.colors.textMuted,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                        }}
                    >
                        Reset
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function Group({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.sm}}>
            <span
                style={{
                    fontSize: 10,
                    letterSpacing: '0.12em',
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

function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: ReadonlyArray<T>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div style={{display: 'flex', gap: 2}}>
            {options.map(opt => (
                <button key={opt} type="button" onClick={() => onChange(opt)} style={segmentBtn(opt === value)}>
                    {opt}
                </button>
            ))}
        </div>
    );
}
