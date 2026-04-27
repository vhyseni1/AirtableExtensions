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
                label: 'All reviewed',
                value: total,
                kind: 'start',
                records: filtered,
                drillTitle: 'All reviewed impacts',
            },
            {
                label: 'Drop Low',
                value: low.length,
                kind: 'negative',
                records: low,
                drillTitle: 'Low-severity impacts',
            },
            {
                label: 'Drop Medium',
                value: medium.length,
                kind: 'negative',
                records: medium,
                drillTitle: 'Medium-severity impacts',
            },
            {
                label: 'High remaining',
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
        const discarded = all.filter(r => r.validationStatus === 'Discarded');
        const reviewed = all.filter(r => r.validationStatus === 'Reviewed');
        return [
            {label: 'All extracted', value: all.length, kind: 'start', records: all, drillTitle: 'All extracted impacts'},
            {
                label: 'Drop Pending',
                value: pending.length,
                kind: 'negative',
                records: pending,
                drillTitle: 'Pending review',
            },
            {
                label: 'Drop Discarded',
                value: discarded.length,
                kind: 'negative',
                records: discarded,
                drillTitle: 'Discarded impacts',
            },
            {label: 'Reviewed', value: reviewed.length, kind: 'end', records: reviewed, drillTitle: 'Reviewed impacts'},
        ];
    }, [allImpacts]);

    const resolutionSteps = useMemo<WaterfallStep[]>(() => {
        const gaps = filtered.filter(r => r.tags.includes('Gap'));
        const noOwner = gaps.filter(r => !(r.actionOwner.trim() || r.responsible));
        const remainingAfterOwner = gaps.filter(r => r.actionOwner.trim() || r.responsible);
        const noTimeline = remainingAfterOwner.filter(r => !r.timeline.trim());
        const remainingAfterTimeline = remainingAfterOwner.filter(r => r.timeline.trim());
        const noReviewerNote = remainingAfterTimeline.filter(r => !r.reviewerNotes.trim());
        const auditClean = remainingAfterTimeline.filter(r => r.reviewerNotes.trim());
        return [
            {label: 'All gaps', value: gaps.length, kind: 'start', records: gaps, drillTitle: 'All gaps'},
            {
                label: 'No owner',
                value: noOwner.length,
                kind: 'negative',
                records: noOwner,
                drillTitle: 'Gaps without owner',
            },
            {
                label: 'No timeline',
                value: noTimeline.length,
                kind: 'negative',
                records: noTimeline,
                drillTitle: 'Gaps without timeline',
            },
            {
                label: 'No reviewer note',
                value: noReviewerNote.length,
                kind: 'negative',
                records: noReviewerNote,
                drillTitle: 'Gaps without reviewer note',
            },
            {
                label: 'Audit-clean',
                value: auditClean.length,
                kind: 'end',
                records: auditClean,
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
        const sameKey = (a: Impact, b: Impact) => a.component === b.component && a.persona === b.persona;
        const newAdds = curReviewed.filter(c => !prevReviewed.some(p => sameKey(p, c)));
        const dropped = prevReviewed.filter(p => !curReviewed.some(c => sameKey(c, p)));
        return [
            {
                label: `Prior · ${previous}`,
                value: prevReviewed.length,
                kind: 'start',
                records: prevReviewed,
                drillTitle: `${previous} reviewed impacts`,
            },
            {
                label: 'New',
                value: newAdds.length,
                kind: 'positive',
                records: newAdds,
                drillTitle: 'New impacts since prior run',
            },
            {
                label: 'Resolved',
                value: dropped.length,
                kind: 'negative',
                records: dropped,
                drillTitle: 'Impacts no longer present',
            },
            {
                label: `Current · ${current}`,
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
                gap: tokens.space.md,
            }}
        >
            <Panel
                eyebrow="Waterfall · 01"
                title="Severity funnel"
                subtitle="From total → high severity, dropping each band"
            >
                <WaterfallChart steps={severitySteps} onDrill={onDrill} />
            </Panel>
            <Panel
                eyebrow="Waterfall · 02"
                title="Validation pipeline"
                subtitle="Extracted → −Pending → −Discarded → Reviewed"
            >
                <WaterfallChart steps={validationSteps} onDrill={onDrill} />
            </Panel>
            <Panel
                eyebrow="Waterfall · 03"
                title="Resolution maturity"
                subtitle="All gaps → drops at each maturity stage → audit-clean"
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
                    subtitle="Prior run → +new → −resolved → current run"
                >
                    <WaterfallChart steps={runDeltaSteps} onDrill={onDrill} />
                </Panel>
            ) : null}
        </div>
    );
}
