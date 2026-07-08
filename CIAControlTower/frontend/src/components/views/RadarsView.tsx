import {useEffect, useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {
    AFFILIATES,
    CHANGE_CATEGORIES,
    type Impact,
} from '../../utils/schema';
import {ChartPanel} from '../primitives/ChartPanel';
import {MultiSelectDropdown, type DropdownOption} from '../primitives/MultiSelectDropdown';
import {RadarChart, type RadarSeries} from '../primitives/RadarChart';

interface Props {
    filtered: Impact[];
    roles: string[];
    onDrill: (records: Impact[], title: string) => void;
}

const PALETTE = ['#0B41CD', '#FF7D29', '#BC36F0', '#00B458', '#C40000', '#1482FA'];

type ProfileAxis = 'category' | 'tag' | 'topComponents';

export function RadarsView({filtered, roles, onDrill}: Props) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: tokens.space.md,
            }}
        >
            <RoleProfilePanel filtered={filtered} roles={roles} onDrill={onDrill} />
            <AffiliateRiskPanel filtered={filtered} roles={roles} onDrill={onDrill} />
            <CategorySeverityPanel filtered={filtered} onDrill={onDrill} />
            <CategoryTagPanel filtered={filtered} onDrill={onDrill} />
        </div>
    );
}

function RoleProfilePanel({filtered, roles, onDrill}: Props) {
    const [axis, setAxis] = useState<ProfileAxis>('category');
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

    useEffect(() => {
        if (selectedRoles.length === 0 && roles.length > 0) {
            setSelectedRoles(roles.slice(0, 3));
        }
    }, [roles, selectedRoles.length]);

    const {spokes, seriesData} = useMemo(() => {
        const {spokeList, valuesBySeries, recordsBySeries} = computeRoleSpokes(
            filtered,
            axis,
            selectedRoles,
        );
        const series: RadarSeries[] = selectedRoles.map((role, idx) => {
            const values = spokeList.map(s => valuesBySeries.get(role)?.get(s) ?? 0);
            const records = spokeList.map(s => recordsBySeries.get(role)?.get(s) ?? []);
            return {
                label: role,
                color: PALETTE[idx % PALETTE.length] ?? '#0B41CD',
                values,
                records,
            };
        });
        return {spokes: spokeList, seriesData: series};
    }, [filtered, axis, selectedRoles]);

    const roleOptions: DropdownOption[] = roles.map(r => ({value: r, label: r}));

    return (
        <ChartPanel
            eyebrow="Radar · 01"
            title="Role profile"
            subtitle="Compare how different roles are exposed across categories, tags, or top components"
            actions={
                <>
                    <select
                        value={axis}
                        onChange={e => setAxis(e.target.value as ProfileAxis)}
                        style={selectStyle}
                        title="Spoke dimension"
                    >
                        <option value="category">Categories (8)</option>
                        <option value="tag">Tags (4)</option>
                        <option value="topComponents">Top components</option>
                    </select>
                    <MultiSelectDropdown
                        label="Roles"
                        options={roleOptions}
                        selected={selectedRoles}
                        onChange={next => setSelectedRoles(next.slice(0, 6))}
                        width={280}
                    />
                </>
            }
        >
            {fs => (
                <RadarChart
                    spokes={spokes}
                    series={seriesData}
                    onDrill={onDrill}
                    maxRenderWidth={fs ? 900 : 620}
                />
            )}
        </ChartPanel>
    );
}

function AffiliateRiskPanel({filtered, onDrill}: Props) {
    const seriesData = useMemo<RadarSeries[]>(() => {
        const spokes: ReadonlyArray<string> = [
            '% High_Impact',
            'Pressure density',
            'Gap density',
            'Friction density',
            '% Lower confidence',
        ];
        const out: RadarSeries[] = [];
        AFFILIATES.forEach((aff, idx) => {
            const subset = filtered.filter(r => r.affiliate === aff);
            if (subset.length === 0) return;
            const n = subset.length;
            const high = subset.filter(r => r.changeImpact === 'High');
            const pressure = subset.filter(r => r.tags.includes('Pressure'));
            const gap = subset.filter(r => r.tags.includes('Gap'));
            const friction = subset.filter(r => r.tags.includes('Friction'));
            const lowConf = subset.filter(r => r.confidence === 'Low' || r.confidence === 'Medium');
            out.push({
                label: aff,
                color: PALETTE[idx % PALETTE.length] ?? '#0B41CD',
                values: [
                    pct(high.length, n),
                    pct(pressure.length, n),
                    pct(gap.length, n),
                    pct(friction.length, n),
                    pct(lowConf.length, n),
                ],
                records: [high, pressure, gap, friction, lowConf],
            });
        });
        void spokes;
        return out;
    }, [filtered]);

    const spokes: ReadonlyArray<string> = [
        '% High_Impact',
        'Pressure density',
        'Gap density',
        'Friction density',
        '% Lower confidence',
    ];

    return (
        <ChartPanel
            eyebrow="Radar · 02"
            title="Affiliate risk profile"
            subtitle="Composite risk shape per affiliate — one polygon per region, five risk densities"
        >
            {fs => (
                <RadarChart
                    spokes={spokes}
                    series={seriesData}
                    max={100}
                    valueFormatter={n => `${Math.round(n)}%`}
                    onDrill={onDrill}
                    maxRenderWidth={fs ? 900 : 620}
                />
            )}
        </ChartPanel>
    );
}

const SEV_SERIES: ReadonlyArray<{key: 'High' | 'Medium' | 'Low'; color: string}> = [
    {key: 'High', color: '#FF1F26'},
    {key: 'Medium', color: '#FFD60C'},
    {key: 'Low', color: '#00B458'},
];

function CategorySeverityPanel({
    filtered,
    onDrill,
}: {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}) {
    const seriesData = useMemo<RadarSeries[]>(() => {
        const spokeList = [...CHANGE_CATEGORIES];
        return SEV_SERIES.map(sev => {
            const values: number[] = [];
            const records: Impact[][] = [];
            for (const cat of spokeList) {
                const recs = filtered.filter(r => r.changeCategory === cat && r.changeImpact === sev.key);
                values.push(recs.length);
                records.push(recs);
            }
            return {label: sev.key, color: sev.color, values, records};
        });
    }, [filtered]);

    return (
        <ChartPanel
            eyebrow="Radar · 03"
            title="Category severity profile"
            subtitle="Which change pillars carry High / Medium / Low impact — one polygon per severity"
        >
            {fs => (
                <RadarChart
                    spokes={[...CHANGE_CATEGORIES]}
                    series={seriesData}
                    onDrill={onDrill}
                    maxRenderWidth={fs ? 900 : 620}
                />
            )}
        </ChartPanel>
    );
}

const TAG_SERIES: ReadonlyArray<{key: 'Heatmap' | 'Pressure' | 'Gap' | 'Friction'; color: string}> = [
    {key: 'Heatmap', color: '#FF7D29'},
    {key: 'Pressure', color: '#C40000'},
    {key: 'Gap', color: '#ED4A0D'},
    {key: 'Friction', color: '#BC36F0'},
];

function CategoryTagPanel({
    filtered,
    onDrill,
}: {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}) {
    const seriesData = useMemo<RadarSeries[]>(() => {
        const spokeList = [...CHANGE_CATEGORIES];
        return TAG_SERIES.map(tag => {
            const values: number[] = [];
            const records: Impact[][] = [];
            for (const cat of spokeList) {
                const recs = filtered.filter(
                    r => r.changeCategory === cat && r.tags.includes(tag.key),
                );
                values.push(recs.length);
                records.push(recs);
            }
            return {label: tag.key, color: tag.color, values, records};
        });
    }, [filtered]);

    return (
        <ChartPanel
            eyebrow="Radar · 04"
            title="Category signal profile"
            subtitle="Where Heatmap / Pressure / Gap / Friction concentrate across the 8 change pillars"
        >
            {fs => (
                <RadarChart
                    spokes={[...CHANGE_CATEGORIES]}
                    series={seriesData}
                    onDrill={onDrill}
                    maxRenderWidth={fs ? 900 : 620}
                />
            )}
        </ChartPanel>
    );
}

function computeRoleSpokes(
    records: Impact[],
    axis: ProfileAxis,
    seriesKeys: ReadonlyArray<string>,
): {
    spokeList: string[];
    valuesBySeries: Map<string, Map<string, number>>;
    recordsBySeries: Map<string, Map<string, Impact[]>>;
} {
    const valueMap = new Map<string, Map<string, number>>();
    const recordMap = new Map<string, Map<string, Impact[]>>();
    for (const p of seriesKeys) {
        valueMap.set(p, new Map());
        recordMap.set(p, new Map());
    }

    let spokeList: string[] = [];
    if (axis === 'category') {
        spokeList = [...CHANGE_CATEGORIES];
    } else if (axis === 'tag') {
        spokeList = ['Heatmap', 'Pressure', 'Gap', 'Friction'];
    } else {
        const counts = new Map<string, number>();
        for (const r of records) {
            const c = r.changeComponent?.trim();
            if (!c) continue;
            counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        spokeList = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([c]) => c);
    }

    for (const r of records) {
        const key = r.role?.trim();
        if (!key || !seriesKeys.includes(key)) continue;
        const buckets: string[] =
            axis === 'category'
                ? r.changeCategory
                    ? [r.changeCategory]
                    : []
                : axis === 'tag'
                    ? r.tags.slice()
                    : r.changeComponent && spokeList.includes(r.changeComponent)
                        ? [r.changeComponent]
                        : [];

        for (const b of buckets) {
            if (!spokeList.includes(b)) continue;
            const vMap = valueMap.get(key)!;
            vMap.set(b, (vMap.get(b) ?? 0) + 1);
            const rMap = recordMap.get(key)!;
            const arr = rMap.get(b) ?? [];
            arr.push(r);
            rMap.set(b, arr);
        }
    }

    return {spokeList, valuesBySeries: valueMap, recordsBySeries: recordMap};
}

function pct(n: number, total: number): number {
    if (total === 0) return 0;
    return (n / total) * 100;
}

const selectStyle: React.CSSProperties = {
    padding: '5px 10px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    fontSize: 12,
    background: tokens.colors.bg,
    fontFamily: tokens.fonts.mono,
    color: tokens.colors.text,
    minWidth: 150,
};
