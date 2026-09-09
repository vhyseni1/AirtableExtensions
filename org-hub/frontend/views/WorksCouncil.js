// Works Council — the consultation obligations the design triggers, by country.
//
// The obligation is derived, not typed: a country whose affected population
// reaches its local threshold needs consultation; below it, information. That
// distinction drives the timeline, so it has to come from the data.

import {useMemo, useState} from 'react';
import {StatTile, BarList} from '../components/Charts';
import ExportCeremony from '../components/ExportCeremony';
import {worksCouncil, fmtNum} from '../lib/orgMetrics';
import {toCSV, downloadText} from '../lib/exports';
import {paginateLevels} from '../lib/stacked';
import {VIZ, WORKS_COUNCIL} from '../config';

const S = VIZ.status;

export default function WorksCouncil({model}) {
    const m = useMemo(() => worksCouncil(model), [model]);
    const [ceremony, setCeremony] = useState(false);

    // The page count the ceremony counts up to is the real deck size: every
    // slide, both sides, paginated exactly as the deck paginates it.
    const totalPages = useMemo(() => {
        let n = 0;
        (model.slides || []).forEach(slide => {
            ['current', 'future'].forEach(mode => {
                n += paginateLevels(slide.levels, mode).filter(p => p.length).length;
            });
        });
        return n;
    }, [model]);

    const consulting = m.rows.filter(r => r.consultationRequired);

    const exportCsv = () => downloadText(
        toCSV(
            ['Country', 'Body', 'Obligation', 'Headcount', 'Affected', 'At risk',
                'In selection', 'New roles', 'Threshold', 'Notice (weeks)'],
            m.rows.map(r => [r.country, r.body, r.obligation, r.headcount, r.affected,
                r.atRisk, r.inSelection, r.newRoles, r.threshold, r.noticeWeeks]),
        ),
        'works-council-scope.csv',
    );

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Organisational design</span>
                    <h2 className="toolbar-heading">Works council</h2>
                </div>
                <div className="toolbar-right">
                    <button className="btn btn-ghost" onClick={exportCsv}>Export scope CSV</button>
                    <button className="btn btn-primary btn-glow" onClick={() => setCeremony(true)}>
                        Export works council pack
                    </button>
                </div>
            </div>

            <div className="dashboard-scroll">
                <div className="tile-row">
                    <StatTile
                        label="Employees affected"
                        value={fmtNum(m.totalAffected)}
                        sub="at risk or in selection"
                        tone="critical"
                        accent={S.risk.color}
                    />
                    <StatTile
                        label="Countries in scope"
                        value={fmtNum(m.rows.length)}
                        sub={`${m.consultingCountries} require consultation`}
                        accent={VIZ.magnitude}
                    />
                    <StatTile
                        label="Longest notice period"
                        value={m.longestNoticeWeeks ? `${m.longestNoticeWeeks} wks` : '—'}
                        sub="drives the critical path"
                        tone="warn"
                        accent={S.selection.color}
                    />
                    <StatTile
                        label="Org chart pages"
                        value={fmtNum(totalPages)}
                        sub="in the consultation pack"
                        accent={VIZ.neutral}
                    />
                </div>

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Consultation obligations</div>
                            <div className="panel-sub">
                                Triggered at the lower of each country&rsquo;s absolute floor or its
                                percentage of local headcount. Demo values — confirm against local
                                counsel before use.
                            </div>
                        </div>
                    </div>
                    <div className="wc-table-wrap">
                        <table className="wc-table">
                            <thead>
                                <tr>
                                    <th>Country</th>
                                    <th>Representative body</th>
                                    <th>Obligation</th>
                                    <th className="num">Headcount</th>
                                    <th className="num">Affected</th>
                                    <th className="num">At risk</th>
                                    <th className="num">In selection</th>
                                    <th className="num">Trigger at</th>
                                    <th className="num">Notice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {m.rows.map(r => (
                                    <tr key={r.country} className={r.consultationRequired ? 'is-consult' : ''}>
                                        <td><span className="wc-country">{r.country}</span></td>
                                        <td>{r.body}</td>
                                        <td>
                                            <span className={`pill ${r.consultationRequired ? 'pill-critical' : 'pill-muted'}`}>
                                                {r.consultationRequired ? '● ' : '○ '}{r.obligation}
                                            </span>
                                        </td>
                                        <td className="num">{fmtNum(r.headcount)}</td>
                                        <td className="num strong">{fmtNum(r.affected)}</td>
                                        <td className="num">{fmtNum(r.atRisk)}</td>
                                        <td className="num">{fmtNum(r.inSelection)}</td>
                                        <td className="num muted" title={`Lower of ${r.thresholdAbs} or ${Math.round((r.thresholdPct || 0) * 100)}% of local headcount`}>
                                            {fmtNum(r.threshold)}
                                        </td>
                                        <td className="num">{r.noticeWeeks ? `${r.noticeWeeks}w` : '—'}</td>
                                    </tr>
                                ))}
                                {m.rows.length === 0 && (
                                    <tr><td className="grid-empty" colSpan={9}>No countries in scope.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="panel-grid">
                    <BarList
                        title="Affected employees by country"
                        subtitle="At risk and in selection"
                        legend={[
                            {label: S.risk.label, color: S.risk.color},
                            {label: S.selection.label, color: S.selection.color},
                        ]}
                        rows={m.rows.map(r => ({
                            label: r.country,
                            segments: [
                                {label: S.risk.label, value: r.atRisk, color: S.risk.color},
                                {label: S.selection.label, value: r.inSelection, color: S.selection.color},
                            ],
                        }))}
                        limit={10}
                    />

                    <div className="panel">
                        <div className="panel-head">
                            <div>
                                <div className="panel-title">Consultation timeline</div>
                                <div className="panel-sub">
                                    Notice periods run in parallel; the longest sets the critical path
                                </div>
                            </div>
                        </div>
                        <div className="timeline">
                            {consulting.length === 0 && (
                                <div className="panel-empty">
                                    No country reaches its consultation threshold.
                                </div>
                            )}
                            {consulting.map(r => (
                                <div key={r.country} className="timeline-row">
                                    <span className="timeline-country">{r.country}</span>
                                    <span className="timeline-track">
                                        <span
                                            className="timeline-bar"
                                            style={{
                                                width: `${(r.noticeWeeks / Math.max(1, m.longestNoticeWeeks)) * 100}%`,
                                            }}
                                        >
                                            <span className="timeline-weeks">{r.noticeWeeks}w</span>
                                        </span>
                                    </span>
                                    <span className="timeline-affected">{fmtNum(r.affected)} affected</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <ExportCeremony
                open={ceremony}
                totalPages={totalPages}
                countries={m.rows.length}
                driveLocation={WORKS_COUNCIL.driveLocation}
                demo
                onClose={() => setCeremony(false)}
            />
        </div>
    );
}
