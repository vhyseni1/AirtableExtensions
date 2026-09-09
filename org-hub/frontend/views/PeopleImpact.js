// People Impact — who the change touches, and how.
//
// Reads the same stacked model the deck renders, so every number here can be
// traced to a slide. The bridge is the headline: today's headcount, minus the
// roles at risk, plus the roles created, lands on the target.

import {useMemo} from 'react';
import {StatTile, BarList, Bridge, DonutRing} from '../components/Charts';
import {ExportMenu} from '../components/Controls';
import {peopleImpact, fmtNum} from '../lib/orgMetrics';
import {toCSV, downloadText} from '../lib/exports';
import {VIZ} from '../config';

const S = VIZ.status;

export default function PeopleImpact({model}) {
    const m = useMemo(() => peopleImpact(model), [model]);

    const statusSegments = [
        {label: S.mapped.label, value: m.totals.mapped, color: S.mapped.color},
        {label: S.selection.label, value: m.totals.selection, color: S.selection.color},
        {label: S.posted.label, value: m.totals.posted, color: S.posted.color},
        {label: S.risk.label, value: m.totals.risk, color: S.risk.color},
    ];

    const legend = statusSegments.map(s => ({label: s.label, color: s.color}));
    const toStacked = rows => rows.map(r => ({
        label: r.key,
        segments: [
            {label: S.mapped.label, value: r.mapped, color: S.mapped.color},
            {label: S.selection.label, value: r.selection, color: S.selection.color},
            {label: S.posted.label, value: r.posted, color: S.posted.color},
            {label: S.risk.label, value: r.risk, color: S.risk.color},
        ],
    }));

    const exportItems = useMemo(() => [{
        label: 'CSV · impact by organisation',
        run: () => downloadText(
            toCSV(
                ['Organisation', 'Current HC', 'Future HC', 'Mapped', 'In selection', 'New positions', 'At risk'],
                m.byOrg.map(r => [r.key, r.current, r.future, r.mapped, r.selection, r.posted, r.risk]),
            ),
            'people-impact-by-organisation.csv',
        ),
    }, {
        label: 'CSV · impact by country',
        run: () => downloadText(
            toCSV(
                ['Country', 'Current HC', 'Future HC', 'Mapped', 'In selection', 'New positions', 'At risk'],
                m.byCountry.map(r => [r.key, r.current, r.future, r.mapped, r.selection, r.posted, r.risk]),
            ),
            'people-impact-by-country.csv',
        ),
    }], [m]);

    const impactRate = m.totals.current ? (m.impacted / m.totals.current) * 100 : 0;

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Organisational design</span>
                    <h2 className="toolbar-heading">People impact</h2>
                </div>
                <div className="toolbar-right">
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="dashboard-scroll">
                <div className="tile-row">
                    <StatTile
                        label="Employees in scope"
                        value={fmtNum(m.totals.current)}
                        sub="current headcount"
                        accent={VIZ.magnitude}
                        spark={m.byOrg.slice(0, 12).map(r => r.current)}
                    />
                    <StatTile
                        label="Target headcount"
                        value={fmtNum(m.totals.future)}
                        sub={`${m.netChange >= 0 ? '+' : ''}${fmtNum(m.netChange)} net change`}
                        tone={m.netChange < 0 ? 'warn' : 'good'}
                        accent={m.netChange < 0 ? VIZ.negative : VIZ.positive}
                        trend={m.netChange}
                    />
                    <StatTile
                        label="Potentially at risk"
                        value={fmtNum(m.totals.risk)}
                        sub="roles reducing"
                        tone="critical"
                        accent={S.risk.color}
                    />
                    <StatTile
                        label="In selection"
                        value={fmtNum(m.totals.selection)}
                        sub="populations in process"
                        tone="warn"
                        accent={S.selection.color}
                    />
                    <StatTile
                        label="New positions"
                        value={fmtNum(m.totals.posted)}
                        sub="to be posted"
                        tone="good"
                        accent={S.posted.color}
                    />
                    <StatTile
                        label="Impact rate"
                        value={`${impactRate.toFixed(1)}%`}
                        sub="at risk or in selection"
                        tone={impactRate > 20 ? 'critical' : impactRate > 10 ? 'warn' : undefined}
                        accent={VIZ.neutral}
                    />
                </div>

                <div className="panel-grid">
                    <div className="panel-span-2">
                        <Bridge
                            title="Headcount bridge"
                            subtitle="How the current organisation becomes the target"
                            steps={[
                                {label: 'Current', value: m.bridge.current, kind: 'base'},
                                {label: 'At risk', value: m.bridge.risk, kind: 'down'},
                                {label: 'New roles', value: m.bridge.posted, kind: 'up'},
                                {label: 'Target', value: m.bridge.future, kind: 'total'},
                            ]}
                        />
                        {Math.abs(m.bridge.residual) > 0.5 && (
                            <div className="panel-note warn">
                                {fmtNum(Math.abs(m.bridge.residual))} headcount of the change is not
                                explained by the status fields. The bridge shows the gap rather than
                                absorbing it — check the Status column on the source rows.
                            </div>
                        )}
                    </div>

                    <DonutRing
                        title="Target population by status"
                        subtitle="Where the future organisation comes from"
                        segments={statusSegments}
                        centerValue={fmtNum(m.totals.future)}
                        centerLabel="target HC"
                    />

                    <BarList
                        title="Impact by organisation"
                        subtitle="Stacked by transition status"
                        rows={toStacked(m.byOrg)}
                        legend={legend}
                        limit={10}
                    />

                    <BarList
                        title="Impact by country"
                        subtitle="Where the people sit today"
                        rows={toStacked(m.byCountry)}
                        legend={legend}
                        limit={10}
                    />

                    <BarList
                        title="Impact by management layer"
                        subtitle="Which tiers absorb the change"
                        rows={toStacked(m.byLevel)}
                        legend={legend}
                        limit={8}
                    />
                </div>

                {m.totals.multiCountrySlots > 0 && (
                    <div className="panel-note">
                        {m.totals.multiCountrySlots} position group{m.totals.multiCountrySlots !== 1 ? 's span' : ' spans'} more
                        than one country. Country breakdowns attribute each to its first country —
                        a modelling simplification, not a fact about the data.
                    </div>
                )}
            </div>
        </div>
    );
}
