import {expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS, STATUS_COLORS} from './constants';
import {KpiCard, StatusChip, Tag} from './components';

// Translate a hex phase color into a faint background for heatmap cells.
function heatBg(phase, count, max) {
    if (!count) return 'transparent';
    const hex = PHASE_COLORS[phase] || '#64748b';
    const alpha = 0.15 + 0.6 * (max ? count / max : 0);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function PipelineRail({phaseCounts}) {
    return (
        <div className="fp-rail" role="list" aria-label="Pipeline phases">
            {PHASE_GROUPS.map((p, i) => (
                <div className="fp-rail-seg" role="listitem" key={p}>
                    <div className="fp-rail-card" style={{borderTopColor: PHASE_COLORS[p]}}>
                        <div className="fp-rail-count" style={{color: PHASE_COLORS[p]}}>
                            {phaseCounts[p] || 0}
                        </div>
                        <div className="fp-rail-name">{p}</div>
                    </div>
                    {i < PHASE_GROUPS.length - 1 && <div className="fp-rail-arrow" aria-hidden>→</div>}
                </div>
            ))}
        </div>
    );
}

function FlowCard({task}) {
    const color = STATUS_COLORS[task.status] || '#cbd5e1';
    return (
        <button
            type="button"
            className="fp-card"
            style={{borderLeftColor: color}}
            onClick={() => expandRecord(task.record)}
            title="Open record"
        >
            <div className="fp-card-title">{task.attributeBusinessName || task.taskId}</div>
            <div className="fp-card-meta">
                <Tag title="Feature">{task.featureName}</Tag>
                {task.environment && task.environment !== 'N/A' && <Tag title="Environment">{task.environment}</Tag>}
            </div>
            <div className="fp-card-row">
                <StatusChip status={task.status} />
                {task.dependencyWarning && <span className="fp-warn" title="Upstream stage not yet done">⚠ dep</span>}
            </div>
            <div className="fp-card-sub">
                {task.stageName} · {task.assignedTeamName}
                {task.assignee ? ` · ${task.assignee}` : ''}
            </div>
        </button>
    );
}

export default function ModeA({model}) {
    const {kpis, phaseCounts, byFeature, featureOrder, tasks, teamNames, handshakes} = model;
    const [fFeature, setFFeature] = useState('');
    const [fTeam, setFTeam] = useState('');
    const [fStatus, setFStatus] = useState('');

    const statusOptions = useMemo(
        () => Array.from(new Set(tasks.map(t => t.status).filter(Boolean))).sort(),
        [tasks],
    );

    // Flow board: active tasks, filtered, grouped by phase.
    const board = useMemo(() => {
        const groups = {};
        PHASE_GROUPS.forEach(p => (groups[p] = []));
        tasks.forEach(t => {
            if (!t.isActive) return;
            if (fFeature && t.featureName !== fFeature) return;
            if (fTeam && t.assignedTeamName !== fTeam) return;
            if (fStatus && t.status !== fStatus) return;
            if (groups[t.phaseGroup]) groups[t.phaseGroup].push(t);
        });
        return groups;
    }, [tasks, fFeature, fTeam, fStatus]);

    const heatMax = useMemo(() => {
        let m = 0;
        Object.values(byFeature).forEach(v => PHASE_GROUPS.forEach(p => (m = Math.max(m, v.phase[p] || 0))));
        return m;
    }, [byFeature]);

    return (
        <div className="fp-mode">
            <PipelineRail phaseCounts={phaseCounts} />

            <div className="fp-kpis">
                <KpiCard label="Active" value={kpis.active} />
                <KpiCard label="Awaiting review" value={kpis.awaitingReview} accent="#f59e0b" />
                <KpiCard label="Blocked" value={kpis.blocked} accent="#ef4444" />
                <KpiCard label="Ready to push" value={kpis.readyToPush} accent="#22c55e" />
                <KpiCard label="Delivered features" value={kpis.deliveredFeatures} />
                <KpiCard label="Overall % complete" value={`${kpis.overallPct}%`} />
            </div>

            <div className="fp-filters">
                <label>Feature
                    <select value={fFeature} onChange={e => setFFeature(e.target.value)}>
                        <option value="">All</option>
                        {featureOrder.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </label>
                <label>Team
                    <select value={fTeam} onChange={e => setFTeam(e.target.value)}>
                        <option value="">All</option>
                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <label>Status
                    <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
                        <option value="">All</option>
                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            </div>

            <div className="fp-section-title">Flow board — active work by phase</div>
            <div className="fp-board">
                {PHASE_GROUPS.map(p => (
                    <div className="fp-col" key={p}>
                        <div className="fp-col-head" style={{borderBottomColor: PHASE_COLORS[p]}}>
                            <span>{p}</span>
                            <span className="fp-col-count">{board[p].length}</span>
                        </div>
                        <div className="fp-col-body">
                            {board[p].map(t => <FlowCard task={t} key={t.id} />)}
                            {board[p].length === 0 && <div className="fp-muted fp-empty">—</div>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="fp-two-col">
                <div>
                    <div className="fp-section-title">Feature × Phase heatmap</div>
                    <table className="fp-heat">
                        <thead>
                            <tr>
                                <th className="fp-heat-corner">Feature</th>
                                {PHASE_GROUPS.map(p => (
                                    <th key={p} style={{color: PHASE_COLORS[p]}}>{p}</th>
                                ))}
                                <th>%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {featureOrder.map(f => {
                                const row = byFeature[f] || {phase: {}, pct: 0};
                                return (
                                    <tr key={f}>
                                        <td className="fp-heat-feature">{f}</td>
                                        {PHASE_GROUPS.map(p => {
                                            const c = row.phase[p] || 0;
                                            return (
                                                <td key={p} style={{backgroundColor: heatBg(p, c, heatMax)}}>
                                                    {c || ''}
                                                </td>
                                            );
                                        })}
                                        <td className="fp-heat-pct">{row.pct}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div>
                    <div className="fp-section-title">Recent handshakes</div>
                    <ul className="fp-feed">
                        {handshakes.slice(0, 12).map(h => (
                            <li key={h.id}>
                                <div className="fp-feed-top">
                                    <StatusChip status={h.action} />
                                    <span className="fp-feed-ts">{h.timestamp}</span>
                                </div>
                                <div className="fp-feed-route">
                                    {h.fromTeam} <span aria-hidden>→</span> {h.toTeam}
                                </div>
                                <div className="fp-feed-sub">
                                    {h.feature} · {h.stage} · {h.decisionMaker}
                                </div>
                            </li>
                        ))}
                        {handshakes.length === 0 && <li className="fp-muted">No handshakes yet.</li>}
                    </ul>
                </div>
            </div>
        </div>
    );
}
