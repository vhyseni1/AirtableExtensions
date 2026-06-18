import {useSession, expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {STATUS, APPROVAL} from './constants';
import {StatusChip, Tag, AcceptanceList} from './components';
import {promoteTask, decideTask, remainingAcceptance} from './actions';

function Lane({title, count, accent, children}) {
    return (
        <div className="fp-lane">
            <div className="fp-lane-head" style={{borderBottomColor: accent}}>
                <span>{title}</span><span className="fp-col-count">{count}</span>
            </div>
            <div className="fp-lane-body">{children}</div>
        </div>
    );
}

export default function Workflow({model}) {
    const session = useSession();
    const {attrs, teamNames, stagesByCode} = model;
    const [team, setTeam] = useState(teamNames[0] || '');
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null);
    const [returningId, setReturningId] = useState(null);
    const [returnComment, setReturnComment] = useState('');

    const lanes = useMemo(() => {
        const incoming = [];
        const pending = [];
        const inProgress = [];
        const blocked = [];
        const ready = [];
        attrs.forEach(a => {
            if (a.approverTeamName === team && a.approvalStatus === APPROVAL.pending) pending.push(a);
            if (a.assignedTeamName !== team) return;
            if (a.status === STATUS.notStarted) incoming.push(a);
            else if (a.status === STATUS.inProgress && !a.isReadyToPush) inProgress.push(a);
            else if (a.status === STATUS.blocked) blocked.push(a);
            else if (a.isReadyToPush) ready.push(a);
        });
        const byAssignee = {};
        inProgress.forEach(a => {
            const k = a.assignee || '(unassigned)';
            (byAssignee[k] = byAssignee[k] || []).push(a);
        });
        return {incoming, pending, inProgress, byAssignee, blocked, ready};
    }, [attrs, team]);

    async function run(id, fn) {
        if (busyId) return; // in-flight guard — a click can't double-fire
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

    const nextName = a => (a.nextCode && stagesByCode[a.nextCode] ? stagesByCode[a.nextCode].name : '— (final)');

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
                <Lane title="Incoming" count={lanes.incoming.length + lanes.pending.length} accent="#3b82f6">
                    {lanes.pending.map(a => (
                        <div className="fp-task" key={a.id}>
                            <div className="fp-task-title" onClick={() => expandRecord(a.record)}>{a.businessName || a.attributeId}</div>
                            <div className="fp-card-meta"><Tag>{a.featureName}</Tag><StatusChip status={a.status} /></div>
                            <div className="fp-task-sub">Awaiting your approval · {a.currentStageName}</div>
                            <AcceptanceList items={a.acceptance} />
                            {returningId === a.id ? (
                                <div className="fp-return">
                                    <textarea placeholder="Reason for returning (required)…" value={returnComment} onChange={e => setReturnComment(e.target.value)} />
                                    <div className="fp-actions">
                                        <button type="button" disabled={busyId === a.id} onClick={() => run(a.id, () => decideTask(model, a, 'return', returnComment, session))}>Confirm return</button>
                                        <button type="button" className="ghost" onClick={() => {setReturningId(null); setReturnComment('');}}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="fp-actions">
                                    <button type="button" className="accept" disabled={busyId === a.id} onClick={() => run(a.id, () => decideTask(model, a, 'accept', '', session))}>
                                        {busyId === a.id ? '…' : `Accept → ${nextName(a)}`}
                                    </button>
                                    <button type="button" className="ghost" onClick={() => setReturningId(a.id)}>Return</button>
                                </div>
                            )}
                        </div>
                    ))}
                    {lanes.incoming.map(a => (
                        <div className="fp-task" key={a.id} onClick={() => expandRecord(a.record)}>
                            <div className="fp-task-title">{a.businessName || a.attributeId}</div>
                            <div className="fp-card-meta"><Tag>{a.featureName}</Tag><StatusChip status={a.status} /></div>
                            <div className="fp-task-sub">New work · {a.currentStageName}</div>
                        </div>
                    ))}
                    {lanes.incoming.length + lanes.pending.length === 0 && <div className="fp-muted">Nothing incoming.</div>}
                </Lane>

                <Lane title="In progress" count={lanes.inProgress.length} accent="#f59e0b">
                    {Object.keys(lanes.byAssignee).sort().map(person => (
                        <div className="fp-assignee" key={person}>
                            <div className="fp-assignee-head">{person} <span className="fp-col-count">{lanes.byAssignee[person].length}</span></div>
                            {lanes.byAssignee[person].map(a => (
                                <div className="fp-task slim" key={a.id} onClick={() => expandRecord(a.record)}>
                                    <div className="fp-task-title">{a.businessName || a.attributeId}</div>
                                    <div className="fp-task-sub">{a.featureName} · {a.currentStageName}{a.environment !== 'N/A' ? ` · ${a.environment}` : ''}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                    {lanes.inProgress.length === 0 && <div className="fp-muted">No work in progress.</div>}
                </Lane>

                <Lane title="Blocked" count={lanes.blocked.length} accent="#ef4444">
                    {lanes.blocked.map(a => (
                        <div className="fp-task" key={a.id} onClick={() => expandRecord(a.record)}>
                            <div className="fp-task-title">{a.businessName || a.attributeId}</div>
                            <div className="fp-card-meta"><Tag>{a.featureName}</Tag></div>
                            <div className="fp-task-blocked">{a.blockedReason || 'Blocked (no reason given)'}</div>
                        </div>
                    ))}
                    {lanes.blocked.length === 0 && <div className="fp-muted">Nothing blocked.</div>}
                </Lane>

                <Lane title="Ready to push" count={lanes.ready.length} accent="#22c55e">
                    {lanes.ready.map(a => {
                        const met = a.acceptance.length === 0 || a.acceptance.every(i => i.done);
                        return (
                            <div className="fp-task" key={a.id}>
                                <div className="fp-task-title" onClick={() => expandRecord(a.record)}>{a.businessName || a.attributeId}</div>
                                <div className="fp-card-meta"><Tag>{a.featureName}</Tag><StatusChip status={a.status} /></div>
                                <div className="fp-task-sub">Next: {nextName(a)}</div>
                                {!met && <div className="fp-muted fp-small">{remainingAcceptance(a).length} acceptance item(s) outstanding</div>}
                                <div className="fp-actions">
                                    <button type="button" className="push" disabled={busyId === a.id} onClick={() => run(a.id, () => promoteTask(model, a, session))}>
                                        {busyId === a.id ? 'Pushing…' : 'Push'}
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
