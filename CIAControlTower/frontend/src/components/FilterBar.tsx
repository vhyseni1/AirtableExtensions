import {tagColor, tokens} from '../styles/tokens';
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
    TAGS,
    type BusinessArchetype,
    type Tag,
} from '../utils/schema';
import {MultiSelectDropdown, type DropdownOption} from './primitives/MultiSelectDropdown';

interface Props {
    filter: FilterState;
    onChange: (next: FilterState) => void;
    runs: string[];
    roles: string[];
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

export function FilterBar({filter, onChange, runs, roles, freshness}: Props) {
    const isDefault =
        filter.sourceRuns.length === 0 &&
        filter.affiliate === DEFAULT_FILTER.affiliate &&
        filter.archetypes.length === 0 &&
        filter.roles.length === 0 &&
        filter.tags.length === 0 &&
        filter.changeImpact === DEFAULT_FILTER.changeImpact;

    const runOptions: DropdownOption[] = runs.map(r => ({value: r, label: r}));
    const roleOptions: DropdownOption[] = roles.map(r => ({value: r, label: r}));
    const archetypeOptions: DropdownOption[] = BUSINESS_ARCHETYPES.map(a => ({value: a, label: a}));
    const tagOptions: DropdownOption[] = TAGS.map(t => ({value: t, label: t, swatch: tagColor(t)}));

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: tokens.space.sm,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: tokens.colors.bgPanel,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.md,
            }}
        >
            <MultiSelectDropdown
                label="Runs"
                options={runOptions}
                selected={filter.sourceRuns}
                onChange={next => onChange({...filter, sourceRuns: next})}
                width={320}
                monoValues
            />

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
                        minWidth: 90,
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

            <MultiSelectDropdown
                label="Archetype"
                options={archetypeOptions}
                selected={filter.archetypes}
                onChange={next => onChange({...filter, archetypes: next as BusinessArchetype[]})}
            />

            <MultiSelectDropdown
                label="Role"
                options={roleOptions}
                selected={filter.roles}
                onChange={next => onChange({...filter, roles: next})}
                width={320}
            />

            <MultiSelectDropdown
                label="Tags"
                options={tagOptions}
                selected={filter.tags}
                onChange={next => onChange({...filter, tags: next as Tag[]})}
            />

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
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
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
