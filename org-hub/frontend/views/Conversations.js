// Employee conversations — the HR view.
//
// Two populations, and the gap between them is the point: the conversations the
// design OWES (derived from at-risk and in-selection roles) versus the ones
// actually tracked. A person in scope with no record is the worst kind of miss,
// so it gets its own number rather than being inferred from two totals.

import {useMemo, useState} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import {StatTile, BarList, DonutRing} from '../components/Charts';
import {ExportMenu} from '../components/Controls';
import {fmtNum} from '../lib/orgMetrics';
import {toCSV, downloadText} from '../lib/exports';
import {VIZ, CONVERSATION_STATUS} from '../config';

const STATUS_COLOR = {
    'Held': VIZ.positive,
    'Scheduled': VIZ.magnitude,
    'To schedule': VIZ.status.selection.color,
    'Declined': VIZ.negative,
};

const SENTIMENT_COLOR = {
    Positive: VIZ.positive,
    Neutral: VIZ.magnitude,
    Concerned: VIZ.status.selection.color,
    Distressed: VIZ.negative,
};

function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString(undefined, {day: '2-digit', month: 'short'});
}

export default function Conversations({conversations}) {
    const c = conversations;
    const [status, setStatus] = useState(null);

    const rows = useMemo(
        () => (c.available ? (status ? c.rows.filter(r => r.status === status) : c.rows) : []),
        [c, status],
    );

    const exportItems = useMemo(() => [{
        label: 'CSV · conversation tracker',
        run: () => downloadText(
            toCSV(
                ['Employee', 'Manager', 'Organisation', 'Country', 'Type', 'Status',
                    'Scheduled', 'Held', 'Outcome', 'Sentiment'],
                c.rows.map(r => [r.employee, r.manager, r.org, r.country, r.type, r.status,
                    r.scheduled ? r.scheduled.toISOString().slice(0, 10) : '',
                    r.held ? r.held.toISOString().slice(0, 10) : '',
                    r.outcome, r.sentiment]),
            ),
            'employee-conversations.csv',
        ),
    }], [c]);

    if (!c.available) {
        return (
            <div className="view-root">
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span className="toolbar-eyebrow">People</span>
                        <h2 className="toolbar-heading">Employee conversations</h2>
                    </div>
                </div>
                <div className="dashboard-scroll">
                    <div className="tile-row">
                        <StatTile
                            label="Conversations owed"
                            value={fmtNum(c.owed)}
                            sub="derived from at-risk and in-selection roles"
                            tone="warn"
                            accent={VIZ.status.selection.color}
                        />
                    </div>
                    <div className="panel-note">
                        The design owes <strong>{fmtNum(c.owed)}</strong> conversations, but there is
                        no tracker to measure against. Add a table named{' '}
                        <code>Employee Conversations</code> — the sample CSV is in{' '}
                        <code>sample-data/</code> — and this view fills in.
                    </div>
                </div>
            </div>
        );
    }

    const statusSegments = Object.keys(CONVERSATION_STATUS)
        .map(k => ({label: k, value: c.counts[k] || 0, color: STATUS_COLOR[k]}))
        .filter(s => s.value > 0);

    const sentimentSegments = Object.entries(c.sentiment)
        .map(([label, value]) => ({label, value, color: SENTIMENT_COLOR[label] || VIZ.neutral}))
        .sort((a, b) => b.value - a.value);

    const managerRows = c.byManager.map(r => ({
        label: r.key,
        segments: [
            {label: 'Held', value: r.held, color: STATUS_COLOR.Held},
            {label: 'Scheduled', value: r.scheduled, color: STATUS_COLOR.Scheduled},
            {label: 'To schedule', value: r.toSchedule, color: STATUS_COLOR['To schedule']},
            {label: 'Declined', value: r.declined, color: STATUS_COLOR.Declined},
        ],
    }));

    const legend = Object.keys(STATUS_COLOR).map(k => ({label: k, color: STATUS_COLOR[k]}));

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">People</span>
                    <h2 className="toolbar-heading">Employee conversations</h2>
                </div>
                <div className="toolbar-right">
                    <div className="seg-toggle">
                        <button
                            className={`seg-btn ${status === null ? 'active' : ''}`}
                            onClick={() => setStatus(null)}
                        >
                            All
                        </button>
                        {Object.keys(CONVERSATION_STATUS).map(k => (
                            <button
                                key={k}
                                className={`seg-btn ${status === k ? 'active' : ''}`}
                                onClick={() => setStatus(status === k ? null : k)}
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="dashboard-scroll">
                <div className="tile-row">
                    <StatTile
                        label="Conversations owed"
                        value={fmtNum(c.owed)}
                        sub="at risk or in selection"
                        accent={VIZ.magnitude}
                    />
                    <StatTile
                        label="Held"
                        value={fmtNum(c.counts.Held || 0)}
                        sub={`${Math.round(c.heldPct)}% of tracked`}
                        tone="good"
                        accent={VIZ.positive}
                        spark={c.byManager.slice(0, 12).map(r => r.held)}
                    />
                    <StatTile
                        label="Scheduled"
                        value={fmtNum(c.counts.Scheduled || 0)}
                        sub="booked, not yet held"
                        accent={VIZ.magnitude}
                    />
                    <StatTile
                        label="To schedule"
                        value={fmtNum(c.counts['To schedule'] || 0)}
                        sub="no date yet"
                        tone="warn"
                        accent={VIZ.status.selection.color}
                    />
                    <StatTile
                        label="Untracked"
                        value={fmtNum(c.untracked)}
                        sub={c.untracked ? 'in scope, no record' : 'everyone in scope is tracked'}
                        tone={c.untracked ? 'critical' : 'good'}
                        accent={c.untracked ? VIZ.negative : VIZ.positive}
                    />
                </div>

                {c.untracked > 0 && (
                    <div className="panel-note warn">
                        <strong>{fmtNum(c.untracked)}</strong> people are in scope for a conversation
                        but have no record in the tracker. They are invisible to every number on this
                        page except this one.
                    </div>
                )}

                <div className="panel-grid">
                    <DonutRing
                        title="Conversation status"
                        subtitle="Across the tracked population"
                        segments={statusSegments}
                        centerValue={`${Math.round(c.heldPct)}%`}
                        centerLabel="held"
                    />

                    {sentimentSegments.length > 0 && (
                        <DonutRing
                            title="Sentiment recorded"
                            subtitle="From conversations already held"
                            segments={sentimentSegments}
                            centerValue={fmtNum(sentimentSegments.reduce((n, s) => n + s.value, 0))}
                            centerLabel="captured"
                        />
                    )}

                    <BarList
                        title="Manager load"
                        subtitle="Who still has conversations to run"
                        rows={managerRows}
                        legend={legend}
                        limit={10}
                    />

                    <BarList
                        title="By country"
                        subtitle="Consultation obligations follow these"
                        rows={c.byCountry.map(r => ({
                            label: r.key,
                            segments: [
                                {label: 'Held', value: r.held, color: STATUS_COLOR.Held},
                                {label: 'Scheduled', value: r.scheduled, color: STATUS_COLOR.Scheduled},
                                {label: 'To schedule', value: r.toSchedule, color: STATUS_COLOR['To schedule']},
                                {label: 'Declined', value: r.declined, color: STATUS_COLOR.Declined},
                            ],
                        }))}
                        legend={legend}
                        limit={10}
                    />
                </div>

                {c.upcoming.length > 0 && (
                    <div className="panel">
                        <div className="panel-head">
                            <div>
                                <div className="panel-title">Coming up</div>
                                <div className="panel-sub">Next scheduled conversations</div>
                            </div>
                        </div>
                        <div className="upcoming">
                            {c.upcoming.map(r => (
                                <div key={r.id} className="upcoming-row">
                                    <span className="upcoming-when">
                                        {r.daysOut === 0 ? 'Today' : `in ${r.daysOut}d`}
                                    </span>
                                    <span className="upcoming-who">{r.employee}</span>
                                    <span className="upcoming-mgr">with {r.manager}</span>
                                    <span className="upcoming-type">{r.type}</span>
                                    <span className="wc-country">{r.country}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">
                                Tracker
                                {status && <span className="panel-filter"> · {status}</span>}
                            </div>
                            <div className="panel-sub">{rows.length} conversations</div>
                        </div>
                        {status && (
                            <button className="panel-more" onClick={() => setStatus(null)}>Clear filter</button>
                        )}
                    </div>
                    <div className="wc-table-wrap">
                        <table className="wc-table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Manager</th>
                                    <th>Organisation</th>
                                    <th>Country</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Scheduled</th>
                                    <th>Sentiment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 60).map(r => (
                                    <tr key={r.id} onClick={() => expandRecord(r.record)} title="Open record">
                                        <td className="strong">{r.employee}</td>
                                        <td>{r.manager}</td>
                                        <td>{r.org}</td>
                                        <td><span className="wc-country">{r.country}</span></td>
                                        <td>{r.type}</td>
                                        <td>
                                            <span className="pill" style={{
                                                background: `${STATUS_COLOR[r.status]}1f`,
                                                color: STATUS_COLOR[r.status],
                                            }}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td>{fmtDate(r.held || r.scheduled)}</td>
                                        <td>
                                            {r.sentiment && (
                                                <span className="sentiment">
                                                    <span
                                                        className="sentiment-dot"
                                                        style={{background: SENTIMENT_COLOR[r.sentiment] || VIZ.neutral}}
                                                    />
                                                    {r.sentiment}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td className="grid-empty" colSpan={8}>Nothing matches this filter.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > 60 && (
                        <div className="panel-note">
                            Showing the first 60 of {rows.length}. Export the CSV for the full list.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
