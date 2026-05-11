import {useEffect, useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {
    AFFILIATES,
    CHANGE_CATEGORIES,
    type Impact,
} from '../../utils/schema';
import {Panel} from '../primitives/Panel';
import {RadarChart, type RadarSeries} from '../primitives/RadarChart';

interface Props {
    filtered: Impact[];
    personas: string[];
    onDrill: (records: Impact[], title: string) => void;
}

const PALETTE = ['#0B41CD', '#FF7D29', '#BC36F0', '#00B458', '#C40000', '#1482FA'];

type ProfileAxis = 'category' | 'tag' | 'topComponents';

export function RadarsView({filtered, personas, onDrill}: Props) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space.md,
            }}
        >
            <PersonaProfilePanel filtered={filtered} personas={personas} onDrill={onDrill} />
            <AffiliateRiskPanel filtered={filtered} personas={personas} onDrill={onDrill} />
        </div>
    );
}

function PersonaProfilePanel({filtered, personas, onDrill}: Props) {
    const [axis, setAxis] = useState<ProfileAxis>('category');
    const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);

    useEffect(() => {
        // Default to the top three personas by data volume, but only once we know what they are.
        if (selectedPersonas.length === 0 && personas.length > 0) {
            setSelectedPersonas(personas.slice(0, 3));
        }
    }, [personas, selectedPersonas.length]);

    const togglePersona = (p: string) => {
        setSelectedPersonas(prev =>
            prev.includes(p) ? prev.filter(x => x !== p) : prev.length >= 5 ? prev : [...prev, p],
        );
    };

    const {spokes, seriesData} = useMemo(() => {
        const {spokeList, valueByPersonaPerSpoke, recordsByPersonaPerSpoke} = computePersonaSpokes(
            filtered,
            axis,
            selectedPersonas,
        );
        const series: RadarSeries[] = selectedPersonas.map((persona, idx) => {
            const values = spokeList.map(s => valueByPersonaPerSpoke.get(persona)?.get(s) ?? 0);
            const records = spokeList.map(
                s => recordsByPersonaPerSpoke.get(persona)?.get(s) ?? [],
            );
            return {
                label: persona,
                color: PALETTE[idx % PALETTE.length] ?? '#0B41CD',
                values,
                records,
            };
        });
        return {spokes: spokeList, seriesData: series};
    }, [filtered, axis, selectedPersonas]);

    return (
        <Panel
            eyebrow="Radar · 01"
            title="Persona profile"
            subtitle="Compare how different personas are exposed across categories, tags, or top components"
        >
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: tokens.space.lg,
                    marginBottom: tokens.space.md,
                    padding: `${tokens.space.sm} ${tokens.space.md}`,
                    background: tokens.colors.bgAlt,
                    borderRadius: tokens.radius.sm,
                }}
            >
                <Field label="Spoke dimension">
                    <select
                        value={axis}
                        onChange={e => setAxis(e.target.value as ProfileAxis)}
                        style={selectStyle}
                    >
                        <option value="category">Change_Category (8)</option>
                        <option value="tag">Tags (4)</option>
                        <option value="topComponents">Top 6 Change_Components</option>
                    </select>
                </Field>
                <Field label="Personas to overlay (max 5)">
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                        {personas.map(p => {
                            const active = selectedPersonas.includes(p);
                            return (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => togglePersona(p)}
                                    style={chipStyle(active)}
                                >
                                    {p}
                                </button>
                            );
                        })}
                    </div>
                </Field>
            </div>

            <RadarChart
                spokes={spokes}
                series={seriesData}
                onDrill={onDrill}
                height={380}
            />
        </Panel>
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
        <Panel
            eyebrow="Radar · 02"
            title="Affiliate risk profile"
            subtitle="Composite risk shape per affiliate — one polygon per region, five risk densities"
        >
            <RadarChart
                spokes={spokes}
                series={seriesData}
                max={100}
                valueFormatter={n => `${Math.round(n)}%`}
                onDrill={onDrill}
                height={380}
            />
        </Panel>
    );
}

function computePersonaSpokes(
    records: Impact[],
    axis: ProfileAxis,
    personas: ReadonlyArray<string>,
): {
    spokeList: string[];
    valueByPersonaPerSpoke: Map<string, Map<string, number>>;
    recordsByPersonaPerSpoke: Map<string, Map<string, Impact[]>>;
} {
    const valueMap = new Map<string, Map<string, number>>();
    const recordMap = new Map<string, Map<string, Impact[]>>();
    for (const p of personas) {
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
        if (!r.persona || !personas.includes(r.persona)) continue;
        const persona = r.persona;
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
            const vMap = valueMap.get(persona)!;
            vMap.set(b, (vMap.get(b) ?? 0) + 1);
            const rMap = recordMap.get(persona)!;
            const arr = rMap.get(b) ?? [];
            arr.push(r);
            rMap.set(b, arr);
        }
    }

    return {spokeList, valueByPersonaPerSpoke: valueMap, recordsByPersonaPerSpoke: recordMap};
}

function pct(n: number, total: number): number {
    if (total === 0) return 0;
    return (n / total) * 100;
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <label style={{display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0}}>
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
        </label>
    );
}

const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 9px',
    background: active ? tokens.colors.text : 'transparent',
    color: active ? tokens.colors.bg : tokens.colors.textMuted,
    border: `1px solid ${active ? tokens.colors.text : tokens.colors.rule}`,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
});

const selectStyle: React.CSSProperties = {
    padding: '5px 10px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    fontSize: 12,
    background: tokens.colors.bg,
    fontFamily: tokens.fonts.mono,
    color: tokens.colors.text,
    minWidth: 220,
};
