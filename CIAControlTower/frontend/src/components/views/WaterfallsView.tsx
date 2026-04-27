import {useMemo} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {Panel} from '../primitives/Panel';
import {WaterfallChart, type WaterfallStep} from '../primitives/WaterfallChart';

interface Props {
    filtered: Impact[];
    allImpacts: Impact[];
    runs: ReadonlyArray<string>;
    onDrill: (records: Impact[], title: string) => void;
}

export function WaterfallsView({filtered, allImpacts, runs, onDrill}: Props) {
    const severitySteps = useMemo<WaterfallStep[]>(() => {
        const total = filtered.length;
        const low = filtered.filter(r => r.severity === 'Low');
        const medium = filtered.filter(r => r.severity === 'Medium');
        const high = filtered.filter(r => r.severity === 'High');
        return [
            {
                label: 'All reviewed impacts',
                value: total,
                kind: 'start',
                records: filtered,
                drillTitle: 'All reviewed impacts',
            },
            {
                label: 'Remove Low severity',
                value: low.length,
                kind: 'negative',
                records: low,
                drillTitle: 'Low-severity impacts',
            },
            {
                label: 'Remove Medium severity',
                value: medium.length,
                kind: 'negative',
                records: medium,
                drillTitle: 'Medium-severity impacts',
            },
            {
                label: 'High severity remaining',
                value: high.length,
                kind: 'end',
                records: high,
                drillTitle: 'High-severity impacts',
            },
        ];
    }, [filtered]);

    const validationSteps = useMemo<WaterfallStep[]>(() => {
        const all = allImpacts;
        const pending = all.filter(r => r.validationStatus === 'Pending');
        const reviewed = all.filter(r => r.validationStatus === 'Reviewed');
        const discarded = all.filter(r => r.validationStatus === 'Discarded');
        return [
            {label: 'All extracted', value: all.length, kind: 'start', records: all, drillTitle: 'All extracted impacts'},
            {label: 'Pending review', value: pending.length, kind: 'subtotal', records: pending, drillTitle: 'Pending review'},
            {label: 'Reviewed', value: reviewed.length, kind: 'subtotal', records: reviewed, drillTitle: 'Reviewed impacts'},
            {label: 'Discarded', value: discarded.length, kind: 'subtotal', records: discarded, drillTitle: 'Discarded impacts'},
        ];
    }, [allImpacts]);

    const resolutionSteps = useMemo<WaterfallStep[]>(() => {
        const gaps = filtered.filter(r => r.tags.includes('Gap'));
        const withOwner = gaps.filter(r => r.actionOwner.trim() || r.responsible);
        const withTimeline = withOwner.filter(r => r.timeline.trim());
        const withReviewerNote = withTimeline.filter(r => r.reviewerNotes.trim());
        return [
            {label: 'All gaps in scope', value: gaps.length, kind: 'start', records: gaps, drillTitle: 'All gaps'},
            {
                label: 'With owner / responsible',
                value: withOwner.length,
                kind: 'subtotal',
                records: withOwner,
                drillTitle: 'Gaps with owner',
            },
            {
                label: 'With timeline',
                value: withTimeline.length,
                kind: 'subtotal',
                records: withTimeline,
                drillTitle: 'Gaps with timeline',
            },
            {
                label: 'With reviewer note',
                value: withReviewerNote.length,
                kind: 'end',
                records: withReviewerNote,
                drillTitle: 'Audit-clean gaps',
            },
        ];
    }, [filtered]);

    const runDeltaSteps = useMemo<WaterfallStep[]>(() => {
        const current = runs[0];
        const previous = runs[1];
        if (!current || !previous) return [];
        const prevReviewed = allImpacts.filter(
            r => r.sourceRun === previous && r.validationStatus === 'Reviewed',
        );
        const curReviewed = allImpacts.filter(
            r => r.sourceRun === current && r.validationStatus === 'Reviewed',
        );
        const newAdds = curReviewed.filter(r => !prevReviewed.some(p => p.component === r.component && p.persona === r.persona));
        const dropped = prevReviewed.filter(p => !curReviewed.some(c => c.component === p.component && c.persona === p.persona));
        return [
            {
                label: `Prior run (${previous})`,
                value: prevReviewed.length,
                kind: 'start',
                records: prevReviewed,
                drillTitle: `${previous} reviewed impacts`,
            },
            {
                label: 'New since last run',
                value: newAdds.length,
                kind: 'positive',
                records: newAdds,
                drillTitle: 'New impacts since prior run',
            },
            {
                label: 'Resolved / removed',
                value: dropped.length,
                kind: 'negative',
                records: dropped,
                drillTitle: 'Impacts no longer present',
            },
            {
                label: `Current run (${current})`,
                value: curReviewed.length,
                kind: 'end',
                records: curReviewed,
                drillTitle: `${current} reviewed impacts`,
            },
        ];
    }, [runs, allImpacts]);

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: tokens.space.md,
            }}
        >
            <Panel
                eyebrow="Waterfall · 01"
                title="Severity funnel"
                subtitle="From total → high severity, step-by-step"
            >
                <WaterfallChart steps={severitySteps} onDrill={onDrill} />
            </Panel>
            <Panel
                eyebrow="Waterfall · 02"
                title="Validation pipeline"
                subtitle="QA funnel: extracted → pending → reviewed → discarded"
            >
                <WaterfallChart steps={validationSteps} onDrill={onDrill} />
            </Panel>
            <Panel
                eyebrow="Waterfall · 03"
                title="Resolution maturity"
                subtitle="Gaps with owner, timeline, and reviewer notes"
            >
                <WaterfallChart
                    steps={resolutionSteps}
                    onDrill={onDrill}
                    emptyLine="No gaps in scope. Resolution funnel empty."
                />
            </Panel>
            {runDeltaSteps.length ? (
                <Panel
                    eyebrow="Waterfall · 04"
                    title="Run-over-run delta"
                    subtitle="Movement of reviewed impacts between the two latest runs"
                >
                    <WaterfallChart steps={runDeltaSteps} onDrill={onDrill} />
                </Panel>
            ) : null}
        </div>
    );
}
