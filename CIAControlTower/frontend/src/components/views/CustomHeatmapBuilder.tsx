import {useState} from 'react';
import {tokens} from '../../styles/tokens';
import {
    CHANGE_CATEGORIES,
    CHANGE_IMPACTS,
    CHANGE_IMPACT_WEIGHT,
    CONFIDENCES,
    type Impact,
} from '../../utils/schema';
import {MatrixHeatMap, type MetricResult, type Tint} from '../primitives/MatrixHeatMap';
import {Panel} from '../primitives/Panel';

type DimensionKey =
    | 'changeComponent'
    | 'changeCategory'
    | 'affiliate'
    | 'role'
    | 'persona'
    | 'responsible'
    | 'eclStream'
    | 'changeImpact'
    | 'confidence'
    | 'sourceRun';

interface DimensionSpec {
    key: DimensionKey;
    label: string;
    extract: (r: Impact) => string | null;
    order?: ReadonlyArray<string>;
}

const DIMENSIONS: ReadonlyArray<DimensionSpec> = [
    {
        key: 'changeComponent',
        label: 'Change_Component',
        extract: r => (r.changeComponent?.trim() ? r.changeComponent : null),
    },
    {
        key: 'changeCategory',
        label: 'Change_Category',
        extract: r => r.changeCategory ?? null,
        order: CHANGE_CATEGORIES,
    },
    {key: 'affiliate', label: 'Affiliate', extract: r => r.affiliate ?? null},
    {key: 'role', label: 'Role', extract: r => (r.role?.trim() ? r.role : null)},
    {key: 'persona', label: 'Archetype', extract: r => r.persona ?? null},
    {key: 'responsible', label: 'Responsible', extract: r => r.responsible ?? null},
    {key: 'eclStream', label: 'ECL_Stream', extract: r => r.eclStream ?? null},
    {
        key: 'changeImpact',
        label: 'Change_Impact',
        extract: r => r.changeImpact ?? null,
        order: CHANGE_IMPACTS,
    },
    {key: 'confidence', label: 'Confidence', extract: r => r.confidence ?? null, order: CONFIDENCES},
    {key: 'sourceRun', label: 'Source_Run', extract: r => r.sourceRun || null},
];

type MetricKey =
    | 'count'
    | 'avgImpact'
    | 'avgConfidence'
    | 'sumImpact'
    | 'pctHigh'
    | 'gapCount'
    | 'pressureCount'
    | 'frictionCount';

interface MetricSpec {
    key: MetricKey;
    label: string;
    fn: (records: Impact[]) => MetricResult;
}

const CONFIDENCE_WEIGHT: Record<string, number> = {High: 3, Medium: 2, Low: 1};

function tintFromImpactAvg(avg: number): Tint {
    if (avg >= 2.5) return 'high';
    if (avg >= 1.5) return 'medium';
    if (avg > 0) return 'low';
    return 'neutral';
}

const METRICS: ReadonlyArray<MetricSpec> = [
    {
        key: 'count',
        label: 'Count of records',
        fn: records => {
            if (records.length === 0) return {display: '', raw: 0, tint: 'neutral'};
            const sevs: number[] = [];
            for (const r of records) if (r.changeImpact) sevs.push(CHANGE_IMPACT_WEIGHT[r.changeImpact]);
            const avg = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
            return {display: String(records.length), raw: records.length, tint: tintFromImpactAvg(avg)};
        },
    },
    {
        key: 'avgImpact',
        label: 'Avg Change_Impact (1–3)',
        fn: records => {
            const ns = records
                .map(r => (r.changeImpact ? CHANGE_IMPACT_WEIGHT[r.changeImpact] : null))
                .filter((n): n is number => n !== null);
            if (ns.length === 0) return {display: '', raw: 0, tint: 'neutral'};
            const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
            return {display: avg.toFixed(1), raw: avg, tint: tintFromImpactAvg(avg)};
        },
    },
    {
        key: 'avgConfidence',
        label: 'Avg Confidence (1–3)',
        fn: records => {
            const ns = records
                .map(r => (r.confidence ? CONFIDENCE_WEIGHT[r.confidence] ?? null : null))
                .filter((n): n is number => n !== null);
            if (ns.length === 0) return {display: '', raw: 0, tint: 'neutral'};
            const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
            const tint: Tint = avg >= 2.5 ? 'low' : avg >= 1.5 ? 'medium' : 'high';
            return {display: avg.toFixed(1), raw: avg, tint};
        },
    },
    {
        key: 'sumImpact',
        label: 'Sum of Change_Impact weights',
        fn: records => {
            const sum = records.reduce(
                (a, r) => a + (r.changeImpact ? CHANGE_IMPACT_WEIGHT[r.changeImpact] : 0),
                0,
            );
            return {
                display: sum ? String(sum) : '',
                raw: sum,
                tint: tintFromImpactAvg(sum / Math.max(1, records.length)),
            };
        },
    },
    {
        key: 'pctHigh',
        label: '% High Change_Impact',
        fn: records => {
            if (records.length === 0) return {display: '', raw: 0, tint: 'neutral'};
            const high = records.filter(r => r.changeImpact === 'High').length;
            const pct = (high / records.length) * 100;
            const tint: Tint = pct >= 50 ? 'high' : pct >= 20 ? 'medium' : 'low';
            return {display: `${Math.round(pct)}%`, raw: pct, tint};
        },
    },
    {
        key: 'gapCount',
        label: 'Gap-tagged count',
        fn: records => {
            const n = records.filter(r => r.tags.includes('Gap')).length;
            return {display: n ? String(n) : '', raw: n, tint: n > 0 ? 'medium' : 'neutral'};
        },
    },
    {
        key: 'pressureCount',
        label: 'Pressure-tagged count',
        fn: records => {
            const n = records.filter(r => r.tags.includes('Pressure')).length;
            return {display: n ? String(n) : '', raw: n, tint: n > 0 ? 'high' : 'neutral'};
        },
    },
    {
        key: 'frictionCount',
        label: 'Friction-tagged count',
        fn: records => {
            const n = records.filter(r => r.tags.includes('Friction')).length;
            return {display: n ? String(n) : '', raw: n, tint: n > 0 ? 'high' : 'neutral'};
        },
    },
];

interface Props {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}

export function CustomHeatmapBuilder({filtered, onDrill}: Props) {
    const [yKey, setYKey] = useState<DimensionKey>('role');
    const [xKey, setXKey] = useState<DimensionKey>('changeComponent');
    const [metricKey, setMetricKey] = useState<MetricKey>('count');

    const yDim = DIMENSIONS.find(d => d.key === yKey) ?? DIMENSIONS[0];
    const xDim = DIMENSIONS.find(d => d.key === xKey) ?? DIMENSIONS[0];
    const metric = METRICS.find(m => m.key === metricKey) ?? METRICS[0];

    if (!yDim || !xDim || !metric) return null;

    return (
        <Panel
            eyebrow="Matrix · Custom"
            title="Build your own heat map"
            subtitle="Pick X, Y, and the cell metric. Cells stay clickable → drill into records."
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
                <Field label="Y axis">
                    <select
                        value={yKey}
                        onChange={e => setYKey(e.target.value as DimensionKey)}
                        style={selectStyle}
                    >
                        {DIMENSIONS.map(d => (
                            <option key={d.key} value={d.key}>
                                {d.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="X axis">
                    <select
                        value={xKey}
                        onChange={e => setXKey(e.target.value as DimensionKey)}
                        style={selectStyle}
                    >
                        {DIMENSIONS.map(d => (
                            <option key={d.key} value={d.key}>
                                {d.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Cell metric">
                    <select
                        value={metricKey}
                        onChange={e => setMetricKey(e.target.value as MetricKey)}
                        style={selectStyle}
                    >
                        {METRICS.map(m => (
                            <option key={m.key} value={m.key}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <div
                    style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        color: tokens.colors.textMuted,
                        alignSelf: 'center',
                    }}
                >
                    {filtered.length} record{filtered.length === 1 ? '' : 's'} in scope
                </div>
            </div>

            <MatrixHeatMap
                records={filtered}
                rowKey={yDim.extract}
                colKey={xDim.extract}
                rowOrder={yDim.order}
                colOrder={xDim.order}
                rowLabel={yDim.label}
                colLabel={xDim.label}
                metricFn={metric.fn}
                minColWidth={84}
                onDrill={onDrill}
            />
        </Panel>
    );
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

const selectStyle: React.CSSProperties = {
    padding: '5px 10px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    fontSize: 12,
    background: tokens.colors.bg,
    fontFamily: tokens.fonts.mono,
    color: tokens.colors.text,
    minWidth: 200,
};
