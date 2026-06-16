import {useSession, expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {STATUS, APPROVAL} from './constants';
import {StatusChip, Tag, AcceptanceList} from './components';
import {promoteTask, decideTask, remainingAcceptance} from './actions';

function Lane({title, count, accent, children}) {
    return (
        <div className="fp-lane">
            <div className="fp-lane-head" style={{borderBottomColor: accent}}>
                <span>{title}</span>
                <span className="fp-col-count">{count}</span>
            </div>
            <div className="fp-lane-body">{children}</div>
        </div>
    );
}

export default function ModeB({model}) {
    const session = useSession();
    const {tasks, teamNames, stagesByCode} = model;
    const [team, setTeam] = useState(teamNames[0] || '');
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null); // {type, msg, remaining?}
    const [returningId, setReturningId] = useState(null);
    const [returnComment, setReturnComment] = useState('');

    const lanes = useMemo(() => {
        const incoming = [];
        const pendingApprovals = [];
        const inProgress = [];
        const blocked = [];
        const ready = [];
        tasks.forEach(t => {
            // Pending approvals routed to this team (may be assigned elsewhere).
            if (t.approverTeamName === team && t.approvalStatus === APPROVAL.pending) {
                pendingApprovals.push(t);
            }
            if (t.assignedTeamName !== team) return;
            if (t.status === STATUS.notStarted) {
                const up = t.prevCode ? model.tasksByKey[`${t.attrKey}|${t.prevCode}`] : null;
                const upstreamDone = !t.prevCode || (up && (up.status === STATUS.done || up.status === STATUS.approved));
                if (upstreamDone) incoming.push(t);
            } else if (t.status === STATUS.inProgress) {
                inProgress.push(t);
            } else if (t.status === STATUS.blocked) {
                blocked.push(t);
            } else if (t.isReadyToPush) {
                ready.push(t);
            }
        });
        // group in-progress by assignee
        const byAssignee = {};
        inProgress.forEach(t => {
            const k = t.assignee || '(unassigned)';
            (byAssignee[k] = byAssignee[k] || []).push(t);
        });
        return {incoming, pendingApprovals, inProgress, byAssignee, blocked, ready};
    }, [tasks, team, model.tasksByKey]);

    async function run(id, fn) {
        if (busyId) return; // guard double-fire while a write is in flight (§8)
        setBusyId(id);
        setToast(null);
        try {
            await fn();
            setToast({type: 'ok', msg: 'Done — board updated.'});
        } catch (e) {
            setToast({type: 'err', msg: e.message || 'Action failed.', remaining: e.remaining});
        } finally {
            setBusyId(null);
            setReturningId(null);
            setReturnComment('');
        }
    }

    const nextName = t => (t.nextCode && stagesByCode[t.nextCode] ? stagesByCode[t.nextCode].name : '—');

    return (
        <div className="fp-mode">
            <div className="fp-teambar">
                <label>My team
                    <select value={team} onChange={e => setTeam(e.target.value)}>
                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <div className="fp-muted">Signed in as {(session.currentUser && (session.currentUser.name || session.currentUser.email)) || 'unknown'}</div>
            </div>

            {toast && (
                <div className={`fp-toast ${toast.type === 'err' ? 'err' : 'ok'}`} role="status">
                    {toast.msg}
                    {toast.remaining && toast.remaining.length > 0 && (
                        <ul>{toast.remaining.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    )}
                </div>
            )}

            <div className="fp-lanes">
                <Lane title="Incoming" count={lanes.incoming.length + lanes.pendingApprovals.length} accent="#3b82f6">
                    {lanes.pendingApprovals.map(t => (
                        <div className="fp-task" key={t.id}>
                            <div className="fp-task-title" onClick={() => expandRecord(t.record)}>
                                {t.attributeBusinessName || t.taskId}
                            </div>
                            <div className="fp-card-meta"><Tag>{t.featureName}</Tag><StatusChip status={t.status} /></div>
                            <div className="fp-task-sub">Awaiting your approval · {t.stageName}</div>
                            <AcceptanceList items={t.acceptance} />
                            {returningId === t.id ? (
                                <div className="fp-return">
                                    <textarea
                                        placeholder="Reason for returning (required)…"
                                        value={returnComment}
                                        onChange={e => setReturnComment(e.target.value)}
                                    />
                                    <div className="fp-actions">
                                        <button type="button" disabled={busyId === t.id} onClick={() => run(t.id, () => decideTask(model, t, 'return', returnComment, session))}>Confirm return</button>
                                        <button type="button" className="ghost" onClick={() => {setReturningId(null); setReturnComment('');}}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="fp-actions">
                                    <button type="button" className="accept" disabled={busyId === t.id} onClick={() => run(t.id, () => decideTask(model, t, 'accept', '', session))}>
                                        {busyId === t.id ? '…' : 'Accept'}
                                    </button>
                                    <button type="button" className="ghost" onClick={() => setReturningId(t.id)}>Return</button>
                                </div>
                            )}
                        </div>
                    ))}
                    {lanes.incoming.map(t => (
                        <div className="fp-task" key={t.id}>
                            <div className="fp-task-title" onClick={() => expandRecord(t.record)}>{t.attributeBusinessName || t.taskId}</div>
                            <div className="fp-card-meta"><Tag>{t.featureName}</Tag><StatusChip status={t.status} /></div>
                            <div className="fp-task-sub">Handed to you · {t.stageName}</div>
                        </div>
                    ))}
                    {lanes.incoming.length + lanes.pendingApprovals.length === 0 && <div className="fp-muted">Nothing incoming.</div>}
                </Lane>

                <Lane title="In progress" count={lanes.inProgress.length} accent="#f59e0b">
                    {Object.keys(lanes.byAssignee).sort().map(person => (
                        <div className="fp-assignee" key={person}>
                            <div className="fp-assignee-head">{person} <span className="fp-col-count">{lanes.byAssignee[person].length}</span></div>
                            {lanes.byAssignee[person].map(t => (
                                <div className="fp-task slim" key={t.id} onClick={() => expandRecord(t.record)}>
                                    <div className="fp-task-title">{t.attributeBusinessName || t.taskId}</div>
                                    <div className="fp-task-sub">{t.featureName} · {t.stageName}{t.environment !== 'N/A' ? ` · ${t.environment}` : ''}{t.dependencyWarning ? ' · ⚠ upstream not done' : ''}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                    {lanes.inProgress.length === 0 && <div className="fp-muted">No work in progress.</div>}
                </Lane>

                <Lane title="Blocked" count={lanes.blocked.length} accent="#ef4444">
                    {lanes.blocked.map(t => (
                        <div className="fp-task" key={t.id} onClick={() => expandRecord(t.record)}>
                            <div className="fp-task-title">{t.attributeBusinessName || t.taskId}</div>
                            <div className="fp-card-meta"><Tag>{t.featureName}</Tag></div>
                            <div className="fp-task-blocked">{t.blockedReason || 'Blocked (no reason given)'}</div>
                        </div>
                    ))}
                    {lanes.blocked.length === 0 && <div className="fp-muted">Nothing blocked.</div>}
                </Lane>

                <Lane title="Ready to push" count={lanes.ready.length} accent="#22c55e">
                    {lanes.ready.map(t => {
                        const met = t.acceptance.length === 0 || t.acceptance.every(i => i.done);
                        return (
                            <div className="fp-task" key={t.id}>
                                <div className="fp-task-title" onClick={() => expandRecord(t.record)}>{t.attributeBusinessName || t.taskId}</div>
                                <div className="fp-card-meta"><Tag>{t.featureName}</Tag><StatusChip status={t.status} /></div>
                                <div className="fp-task-sub">Next: {nextName(t)}</div>
                                {!met && <div className="fp-muted fp-small">{remainingAcceptance(t).length} acceptance item(s) outstanding</div>}
                                <div className="fp-actions">
                                    <button type="button" className="push" disabled={busyId === t.id} onClick={() => run(t.id, () => promoteTask(model, t, session))}>
                                        {busyId === t.id ? 'Pushing…' : 'Push'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {lanes.ready.length === 0 && <div className="fp-muted">Nothing ready to push.</div>}
                </Lane>
            </div>
        </div>
    );
}
