import {useSession, expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useRef, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {StatusChip, Tag} from './components';
import {useDrill, DrillDrawer} from './drill';
import {decideTask} from './actions';

const ALL = '__all__';

export default function TeamView({model}) {
    const session = useSession();
    const {attrs, teamNames, usersByTeam, stagesByCode} = model;
    const [team, setTeam] = useState(ALL);
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null);
    const [overCol, setOverCol] = useState(null);
    const [modal, setModal] = useState(null); // {attr, text} — return comment
    const dragId = useRef(null);
    const drill = useDrill();

    const scope = useMemo(
        () => (team === ALL ? attrs : attrs.filter(a => a.assignedTeamName === team)),
        [attrs, team],
    );

    const byPhase = useMemo(() => {
        const m = {};
        PHASE_GROUPS.forEach(p => (m[p] = []));
        scope.forEach(a => { if (m[a.phase]) m[a.phase].push(a); });
        return m;
    }, [scope]);

    const perPerson = useMemo(() => {
        const m = {};
        scope.forEach(a => { const k = a.assignee || '(unassigned)'; m[k] = (m[k] || 0) + 1; });
        return m;
    }, [scope]);

    const nextName = a => (a.nextCode && stagesByCode[a.nextCode] ? stagesByCode[a.nextCode].name : '— (final)');

    async function run(id, fn, okMsg) {
        if (busyId) return;
        setBusyId(id);
        setToast(null);
        try {
            await fn();
            setToast({type: 'ok', msg: okMsg || 'Updated.'});
        } catch (e) {
            setToast({type: 'err', msg: e.message || 'Action failed.'});
        } finally {
            setBusyId(null);
            setModal(null);
        }
    }

    function dropOn(phase, a) {
        if (!a) return;
        const ci = PHASE_GROUPS.indexOf(a.phase);
        const ti = PHASE_GROUPS.indexOf(phase);
        if (ci < 0 || ti === ci) return;
        if (ti > ci) {
            if (!a.hasNext) { setToast({type: 'err', msg: 'Already at the final stage.'}); return; }
            run(a.id, () => decideTask(model, a, 'accept', '', session), `Advanced to ${nextName(a)} — handshake logged.`);
        } else {
            setModal({attr: a, text: ''}); // backward = return (needs a reason)
        }
    }

    function confirmReturn() {
        const {attr, text} = modal;
        if (!text.trim()) { setToast({type: 'err', msg: 'A comment is required to return.'}); return; }
        run(attr.id, () => decideTask(model, attr, 'return', text, session), 'Returned — handshake logged.');
    }

    const onDrop = phase => e => {
        e.preventDefault();
        setOverCol(null);
        const a = scope.find(x => x.id === dragId.current);
        dropOn(phase, a);
        dragId.current = null;
    };

    return (
        <div className="fp-mode">
            <div className="fp-teambar">
                <label>Team
                    <select value={team} onChange={e => setTeam(e.target.value)}>
                        <option value={ALL}>All teams (programme)</option>
                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <div className="fp-wf-hint">Drag a requirement to a <b>later phase</b> to advance it (handshake logged), or drag it <b>back</b> to return with a comment.</div>
            </div>

            {toast && (
                <div className={`fp-toast ${toast.type === 'err' ? 'err' : 'ok'}`} role="status">{toast.msg}</div>
            )}

            <div className="fp-kpis fp-kpis-sm">
                <div className="fp-kpi clickable" onClick={() => drill.openAttrs('Attributes', scope)}><div className="fp-kpi-value">{scope.length}</div><div className="fp-kpi-label">Attributes</div></div>
                <div className="fp-kpi clickable" onClick={() => drill.openAttrs('Active', scope.filter(a => a.isActive))}><div className="fp-kpi-value">{scope.filter(a => a.isActive).length}</div><div className="fp-kpi-label">Active</div></div>
                <div className="fp-kpi clickable" onClick={() => drill.openAttrs('Blocked', scope.filter(a => a.isBlocked))}><div className="fp-kpi-value" style={{color: '#e11d48'}}>{scope.filter(a => a.isBlocked).length}</div><div className="fp-kpi-label">Blocked</div></div>
                <div className="fp-kpi clickable" onClick={() => drill.openAttrs('Ready to push', scope.filter(a => a.isReadyToPush))}><div className="fp-kpi-value" style={{color: '#16a34a'}}>{scope.filter(a => a.isReadyToPush).length}</div><div className="fp-kpi-label">Ready to push</div></div>
            </div>

            {team !== ALL && (
                <>
                    <div className="fp-section-title">Team &amp; load</div>
                    <div className="fp-people">
                        {(usersByTeam[team] || []).map(u => <Tag key={u} title="Team member">{u}</Tag>)}
                        {Object.keys(perPerson).sort().map(p => (
                            <span key={p} className="fp-tag clickable" title={`See ${p}'s attributes`} onClick={() => drill.openAttrs(p, scope.filter(a => (a.assignee || '(unassigned)') === p))}>{p} · {perPerson[p]}</span>
                        ))}
                        {(usersByTeam[team] || []).length === 0 && Object.keys(perPerson).length === 0 && <span className="fp-muted">Nothing assigned.</span>}
                    </div>
                </>
            )}

            <div className="fp-section-title">Pipeline board — drag to move across phases</div>
            <div className="fp-board fp-board-kanban">
                {PHASE_GROUPS.map(p => (
                    <div
                        key={p}
                        className={`fp-col${overCol === p ? ' over' : ''}`}
                        onDragOver={e => { e.preventDefault(); setOverCol(p); }}
                        onDragLeave={() => setOverCol(c => (c === p ? null : c))}
                        onDrop={onDrop(p)}
                    >
                        <div className="fp-col-head" style={{borderBottomColor: PHASE_COLORS[p]}}>
                            <span>{p}</span><span className="fp-col-count">{byPhase[p].length}</span>
                        </div>
                        <div className="fp-col-body">
                            {byPhase[p].map(a => (
                                <div
                                    key={a.id}
                                    className={`fp-card${busyId === a.id ? ' busy' : ''}`}
                                    style={{borderLeftColor: PHASE_COLORS[p]}}
                                    draggable
                                    onDragStart={() => { dragId.current = a.id; }}
                                    onDragEnd={() => { dragId.current = null; setOverCol(null); }}
                                >
                                    <div className="fp-card-title" onClick={() => expandRecord(a.record)}>{a.businessName || a.attributeId}</div>
                                    <div className="fp-card-meta"><Tag>{a.featureName}</Tag>{a.environment && a.environment !== 'N/A' && <Tag>{a.environment}</Tag>}</div>
                                    <div className="fp-card-row"><StatusChip status={a.status} /></div>
                                    <div className="fp-card-sub">{a.currentStageName}{a.assignee ? ` · ${a.assignee}` : ''}{a.dueDate ? ` · due ${a.dueDate}` : ''}</div>
                                    {a.isBlocked && a.blockedReason && <div className="fp-task-blocked">{a.blockedReason}</div>}
                                </div>
                            ))}
                            {byPhase[p].length === 0 && <div className="fp-kempty">Drop here</div>}
                        </div>
                    </div>
                ))}
            </div>

            {modal && (
                <div className="fp-modal-backdrop" onClick={() => setModal(null)}>
                    <div className="fp-modal" onClick={e => e.stopPropagation()}>
                        <h3>Return to a previous phase</h3>
                        <p className="fp-muted">{modal.attr.businessName || modal.attr.attributeId} · {modal.attr.currentStageName}</p>
                        <textarea autoFocus placeholder="What needs to change? (required)" value={modal.text} onChange={e => setModal({...modal, text: e.target.value})} />
                        <div className="fp-actions">
                            <button type="button" className="push" disabled={busyId === modal.attr.id} onClick={confirmReturn}>Return</button>
                            <button type="button" className="ghost" onClick={() => setModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <DrillDrawer drill={drill} />
        </div>
    );
}
