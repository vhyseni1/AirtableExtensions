import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {type Impact} from '../utils/schema';
import {InsightTile} from './primitives/InsightTile';

export type DrillKey =
    | 'total'
    | 'high'
    | 'gaps'
    | 'pressure'
    | 'friction'
    | 'lowConfidence';

export interface DrillSpec {
    key: DrillKey;
    title: string;
    eyebrow: string;
    records: Impact[];
    emptyLine: string;
}

interface Props {
    filtered: Impact[];
    aggregations: DashboardAggregations;
    activeDrill: DrillKey | null;
    onDrill: (spec: DrillSpec) => void;
}

export function buildDrillSpec(
    key: DrillKey,
    filtered: Impact[],
    aggregations: DashboardAggregations,
): DrillSpec {
    switch (key) {
        case 'total':
            return {
                key,
                title: 'All reviewed impacts',
                eyebrow: 'Drill-down',
                records: filtered,
                emptyLine: 'No reviewed impacts in scope.',
            };
        case 'high':
            return {
                key,
                title: 'High-severity impacts',
                eyebrow: 'Drill-down',
                records: filtered.filter(r => r.severity === 'High'),
                emptyLine: 'No high-severity impacts. Notable.',
            };
        case 'gaps':
            return {
                key,
                title: 'Open gaps',
                eyebrow: 'Drill-down',
                records: filtered.filter(r => r.tags.includes('Gap') && !r.reviewerNotes.trim()),
                emptyLine: 'Every gap has a reviewer note. Audit-clean.',
            };
        case 'pressure':
            return {
                key,
                title: 'Pressure flags',
                eyebrow: 'Drill-down',
                records: filtered.filter(r => r.tags.includes('Pressure')),
                emptyLine: 'No persona pressure recorded in this run.',
            };
        case 'friction':
            return {
                key,
                title: 'Friction points',
                eyebrow: 'Drill-down',
                records: filtered.filter(r => r.tags.includes('Friction')),
                emptyLine: 'No friction recorded in this run. Healthy alignment.',
            };
        case 'lowConfidence':
            return {
                key,
                title: 'Lower-confidence impacts',
                eyebrow: 'Drill-down',
                records: aggregations.headline.lowestConfidenceRecords,
                emptyLine: 'Every impact lands at high confidence.',
            };
    }
}

export function HeadlineBar({filtered, aggregations, activeDrill, onDrill}: Props) {
    const m = aggregations.headline;
    const d = aggregations.delta;

    const tile = (
        key: DrillKey,
        eyebrow: string,
        value: React.ReactNode,
        suffix?: string,
        delta?: number | null,
        accent?: string,
    ) => (
        <InsightTile
            eyebrow={eyebrow}
            value={value}
            suffix={suffix}
            delta={delta ?? null}
            deltaInverse={key !== 'total'}
            accent={accent}
            active={activeDrill === key}
            onClick={() => onDrill(buildDrillSpec(key, filtered, aggregations))}
        />
    );

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: tokens.space.md,
            }}
        >
            {tile('total', 'Total impacts', m.totalImpacts, undefined, d?.total ?? null, tokens.colors.accent)}
            {tile('high', 'High severity', m.highSeverity, undefined, d?.high ?? null, tokens.colors.sevHigh)}
            {tile('gaps', 'Gaps open', m.gapsOpen, undefined, d?.gaps ?? null, tokens.colors.tagGap)}
            {tile(
                'pressure',
                'Pressure flags',
                m.pressureFlags,
                undefined,
                d?.pressure ?? null,
                tokens.colors.tagPressure,
            )}
            {tile(
                'friction',
                'Friction points',
                m.frictionPoints,
                undefined,
                d?.friction ?? null,
                tokens.colors.tagFriction,
            )}
            {tile('lowConfidence', 'Avg confidence', m.avgConfidencePct, '%', null, tokens.colors.accentSoft)}
        </div>
    );
}
