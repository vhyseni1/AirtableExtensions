// Programme — the PMO board: milestones, workstream health, and what is late.
//
// The RAG shown is derived, not typed: a milestone past its date with work
// still open renders Red whatever the plan claims. The typed value is kept
// beside it so a disagreement is visible rather than silently overwritten.

import {useMemo, useState} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import {StatTile, BarList} from '../components/Charts';
import {ExportMenu} from '../components/Controls';
import {fmtNum} from '../lib/orgMetrics';
import {toCSV, downloadText} from '../lib/exports';
import {VIZ, RAG_COLORS, PHASES} from '../config';

const FILTERS = [
    {key: 'all', label: 'All'},
    {key: 'open', label: 'Open'},
    {key: 'overdue', label: 'Past due'},
    {key: 'soon', label: 'Next 14 days'},
];

function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString(undefined, {day: '2-digit', month: 'short', year: '2-digit'});
}

function dueLabel(m) {
    if (m.done) return 'Complete';
    if (m.daysOut == null) return 'No date';
    if (m.daysOut < 0) return `${Math.abs(m.daysOut)}d late`;
    if (m.daysOut === 0) return 'Today';
    return `in ${m.daysOut}d`;
}

export default function Programme({programme}) {
    const [filter, setFilter] = useState('open');
    const [workstream, setWorkstream] = useState(null);

    const rows = useMemo(() => {
        if (!programme.available) return [];
        let out = programme.milestones;
        if (filter === 'open') out = out.filter(m => !m.done);
        if (filter === 'overdue') out = out.filter(m => m.overdue);
        if (filter === 'soon') out = out.filter(m => !m.done && m.daysOut != null && m.daysOut >= 0 && m.daysOut <= 14);
        if (workstream) out = out.filter(m => m.workstream === workstream);
        return out;
    }, [programme, filter, workstream]);

    const exportItems = useMemo(() => [{
        label: 'CSV · milestone plan',
        run: () => downloadText(
            toCSV(
                ['Workstream', 'Milestone', 'Phase', 'Owner', 'Due', 'Status',
                    'Progress %', 'RAG (typed)', 'RAG (derived)', 'Days out'],
                programme.milestones.map(m => [
                    m.workstream, m.milestone, m.phase, m.owner,
                    m.due ? m.due.toISOString().slice(0, 10) : '',
                    m.status, m.progress, m.typedRag, m.rag, m.daysOut ?? '',
                ]),
            ),
            'programme-milestones.csv',
        ),
    }], [programme]);

    if (!programme.available) {
        return (
            <div className="empty-state">
                The Programme view needs a table named <code>Programme Milestones</code>.
                See <code>sample-data/IMPORT.md</code> — the sample CSV is in that folder.
            </div>
        );
    }

    const p = programme;

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Programme office</span>
                    <h2 className="toolbar-heading">Delivery plan</h2>
                </div>
                <div className="toolbar-right">
                    <div className="seg-toggle">
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                className={`seg-btn ${filter === f.key ? 'active' : ''}`}
                                onClick={() => setFilter(f.key)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="dashboard-scroll">
                <div className="tile-row">
                    <StatTile
                        label="Delivered"
                        value={`${Math.round(p.completion)}%`}
                        sub={`${p.milestones.filter(m => m.done).length} of ${p.milestones.length} milestones`}
                        tone="good"
                        accent={VIZ.positive}
                        spark={p.byWorkstream.map(w => w.progress)}
                    />
                    <StatTile
                        label="Past due"
                        value={fmtNum(p.overdue.length)}
                        sub={p.overdue.length ? 'need a recovery date' : 'nothing late'}
                        tone={p.overdue.length ? 'critical' : 'good'}
                        accent={p.overdue.length ? VIZ.negative : VIZ.positive}
                    />
                    <StatTile
                        label="Due in 14 days"
                        value={fmtNum(p.dueSoon.length)}
                        sub="landing this fortnight"
                        tone="warn"
                        accent={VIZ.status.selection.color}
                    />
                    <StatTile
                        label="Red milestones"
                        value={fmtNum(p.ragCounts.Red)}
                        sub={`${p.ragCounts.Amber} amber · ${p.ragCounts.Green} green`}
                        tone={p.ragCounts.Red ? 'critical' : undefined}
                        accent={RAG_COLORS.Red.color}
                    />
                    <StatTile
                        label="Current phase"
                        value={p.currentPhase ? p.currentPhase.phase : '—'}
                        sub={p.nextMilestone ? `next: ${dueLabel(p.nextMilestone)}` : 'plan complete'}
                        accent={VIZ.magnitude}
                    />
                </div>

                {/* Phase rail — where the programme is on its own spine. */}
                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Phases</div>
                            <div className="panel-sub">Milestones complete in each phase</div>
                        </div>
                    </div>
                    <div className="phase-bar">
                        {PHASES.filter(ph => p.byPhase.some(x => x.phase === ph)).map(ph => {
                            const x = p.byPhase.find(b => b.phase === ph);
                            const active = p.currentPhase && p.currentPhase.phase === ph;
                            return (
                                <div key={ph} className={`phase-seg${active ? ' active' : ''}${x.done === x.total ? ' complete' : ''}`}>
                                    <div className="phase-seg-fill" style={{width: `${x.progress}%`}} />
                                    <div className="phase-seg-text">
                                        <span className="phase-seg-name">{ph}</span>
                                        <span className="phase-seg-count">{x.done}/{x.total}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="panel-grid">
                    <BarList
                        title="Workstream progress"
                        subtitle="Click a bar to filter the board"
                        format={v => `${Math.round(v)}%`}
                        legend={Object.values(RAG_COLORS).map(r => ({label: r.label, color: r.color}))}
                        rows={p.byWorkstream.map(w => ({
                            label: w.workstream,
                            value: w.progress,
                            color: RAG_COLORS[w.rag].color,
                        }))}
                        limit={10}
                    />

                    <div className="panel">
                        <div className="panel-head">
                            <div>
                                <div className="panel-title">Owners</div>
                                <div className="panel-sub">Accountable lead per workstream</div>
                            </div>
                        </div>
                        <div className="owner-list">
                            {p.byWorkstream.map(w => (
                                <button
                                    key={w.workstream}
                                    className={`owner-row${workstream === w.workstream ? ' active' : ''}`}
                                    onClick={() => setWorkstream(workstream === w.workstream ? null : w.workstream)}
                                >
                                    <span className="owner-rag" style={{background: RAG_COLORS[w.rag].color}} />
                                    <span className="owner-name">{w.owner || '—'}</span>
                                    <span className="owner-ws">{w.workstream}</span>
                                    <span className="owner-count">
                                        {w.done}/{w.total}
                                        {w.overdue > 0 && <em className="owner-late"> · {w.overdue} late</em>}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">
                                Milestones
                                {workstream && <span className="panel-filter"> · {workstream}</span>}
                            </div>
                            <div className="panel-sub">
                                RAG is derived — a milestone past its date with work open reads Red
                                whatever the plan says. A disagreement shows the typed value beside it.
                            </div>
                        </div>
                        {workstream && (
                            <button className="panel-more" onClick={() => setWorkstream(null)}>Clear filter</button>
                        )}
                    </div>
                    <div className="wc-table-wrap">
                        <table className="wc-table">
                            <thead>
                                <tr>
                                    <th style={{width: 34}} />
                                    <th>Milestone</th>
                                    <th>Workstream</th>
                                    <th>Owner</th>
                                    <th>Due</th>
                                    <th>Status</th>
                                    <th style={{width: 130}}>Progress</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(m => (
                                    <tr
                                        key={m.id}
                                        className={m.overdue ? 'is-consult' : ''}
                                        onClick={() => expandRecord(m.record)}
                                        title="Open record"
                                    >
                                        <td>
                                            <span className="ms-rag" style={{background: RAG_COLORS[m.rag].color}} />
                                        </td>
                                        <td className="strong">
                                            {m.milestone}
                                            {m.rag !== m.typedRag && (
                                                <span className="ms-conflict" title={`Plan says ${m.typedRag}`}>
                                                    plan: {m.typedRag}
                                                </span>
                                            )}
                                        </td>
                                        <td>{m.workstream}</td>
                                        <td>{m.owner}</td>
                                        <td>
                                            {fmtDate(m.due)}
                                            <span className={`ms-due${m.overdue ? ' late' : ''}`}>{dueLabel(m)}</span>
                                        </td>
                                        <td>
                                            <span className={`pill pill-${m.done ? 'good' : m.status === 'Blocked' ? 'critical' : 'muted'}`}>
                                                {m.status}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="ms-progress">
                                                <span
                                                    className="ms-progress-fill"
                                                    style={{
                                                        width: `${m.done ? 100 : m.progress}%`,
                                                        background: RAG_COLORS[m.rag].color,
                                                    }}
                                                />
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td className="grid-empty" colSpan={7}>Nothing matches this filter.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
