import {useSession, expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useRef, useState} from 'react';
import {STATUS, APPROVAL} from './constants';
import {StatusChip, Tag} from './components';
import {useDrill, DrillDrawer} from './drill';
import RelEditor from './RelEditor';
import {promoteTask, decideTask, setStatus, remainingAcceptance} from './actions';

const COLS = [
    {key: 'todo', title: 'To do', accent: '#94A3B8', hint: 'Not started'},
    {key: 'inprogress', title: 'In progress', accent: '#3B82F6', hint: 'Being worked'},
    {key: 'blocked', title: 'Blocked', accent: '#E11D48', hint: 'Impediment'},
    {key: 'review', title: 'In review', accent: '#F59E0B', hint: 'Awaiting approval'},
    {key: 'cleared', title: 'Approved · advance', accent: '#16A34A', hint: 'Moves to next stage'},
];

function laneOf(a) {
    if (a.isBlocked) return 'blocked';
    if (a.status === STATUS.submitted || a.approvalStatus === APPROVAL.pending) return 'review';
    if (a.status === STATUS.approved || a.isDelivered) return 'cleared';
    if (a.status === STATUS.notStarted) return 'todo';
    return 'inprogress';
}

export default function Workflow({model}) {
    const session = useSession();
    const {attrs, teamNames, stagesByCode} = model;
    const [team, setTeam] = useState(teamNames[0] || '');
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null);
    const [overCol, setOverCol] = useState(null);
    const [modal, setModal] = useState(null); // {kind:'block'|'return', attr, text}
    const [rel, setRel] = useState(null); // {attr, mode}
    const dragId = useRef(null);
    const drill = useDrill();
    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    const visible = useMemo(
        () => attrs.filter(a => a.assignedTeamName === team || (a.isAwaitingReview && a.approverTeamName === team)),
        [attrs, team],
    );
    const lanes = useMemo(() => {
        const out = {};
        COLS.forEach(c => (out[c.key] = []));
        visible.forEach(a => out[laneOf(a)].push(a));
        return out;
    }, [visible]);

    const nextName = a => (a.nextCode && stagesByCode[a.nextCode] ? stagesByCode[a.nextCode].name : '— (final)');

    async function run(id, fn, okMsg) {
        if (busyId) return;
        setBusyId(id);
        setToast(null);
        try {
            await fn();
            setToast({type: 'ok', msg: okMsg || 'Updated.'});
        } catch (e) {
            setToast({type: 'err', msg: e.message || 'Action failed.', remaining: e.remaining});
        } finally {
            setBusyId(null);
            setModal(null);
        }
    }

    // Resolve a drop into the matching action (handoffs write Handshakes).
    function dropOn(colKey, a) {
        if (!a || laneOf(a) === colKey) return;
        switch (colKey) {
            case 'todo':
                return run(a.id, () => setStatus(model, a, STATUS.notStarted), 'Moved to To do.');
            case 'inprogress':
                if (a.isAwaitingReview) { setModal({kind: 'return', attr: a, text: ''}); return; }
                return run(a.id, () => setStatus(model, a, STATUS.inProgress), 'Moved to In progress.');
            case 'blocked':
                setModal({kind: 'block', attr: a, text: ''});
                return;
            case 'review':
                return run(a.id, () => promoteTask(model, a, session), 'Submitted for review — handshake logged.');
            case 'cleared':
                return run(a.id, () => decideTask(model, a, 'accept', '', session), 'Approved & advanced — handshake logged.');
            default:
                return undefined;
        }
    }

    function confirmModal() {
        const {kind, attr, text} = modal;
        if (kind === 'block') return run(attr.id, () => setStatus(model, attr, STATUS.blocked, text), 'Marked blocked.');
        if (kind === 'return') {
            if (!text.trim()) { setToast({type: 'err', msg: 'A comment is required to return.'}); return; }
            return run(attr.id, () => decideTask(model, attr, 'return', text, session), 'Returned — handshake logged.');
        }
        return undefined;
    }

    const onDrop = colKey => e => {
        e.preventDefault();
        setOverCol(null);
        const a = visible.find(x => x.id === dragId.current);
        dropOn(colKey, a);
        dragId.current = null;
    };

    return (
        <div className="fp-mode">
            <div className="fp-teambar">
                <label>My team
                    <select value={team} onChange={e => setTeam(e.target.value)}>
                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <div className="fp-wf-hint">Drag a card between columns to advance work. <b>In review</b> and <b>Approve</b> moves are recorded as handshakes.</div>
            </div>

            {toast && (
                <div className={`fp-toast ${toast.type === 'err' ? 'err' : 'ok'}`} role="status">
                    {toast.msg}
                    {toast.remaining && toast.remaining.length > 0 && <ul>{toast.remaining.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                </div>
            )}

            <div className="fp-kanban">
                {COLS.map(col => (
                    <div
                        key={col.key}
                        className={`fp-kcol${overCol === col.key ? ' over' : ''}`}
                        onDragOver={e => { e.preventDefault(); setOverCol(col.key); }}
                        onDragLeave={() => setOverCol(c => (c === col.key ? null : c))}
                        onDrop={onDrop(col.key)}
                    >
                        <div className="fp-kcol-head" style={{borderTopColor: col.accent}}>
                            <span>{col.title}</span>
                            <span className="fp-col-count clickable" title="Open as list" onClick={() => drill.openAttrs(col.title, lanes[col.key])}>{lanes[col.key].length}</span>
                        </div>
                        <div className="fp-kcol-hint">{col.hint}</div>
                        <div className="fp-kcol-body">
                            {lanes[col.key].map(a => {
                                const met = a.acceptance.length === 0 || a.acceptance.every(i => i.done);
                                return (
                                    <div
                                        key={a.id}
                                        className={`fp-kcard${busyId === a.id ? ' busy' : ''}`}
                                        style={{borderLeftColor: col.accent}}
                                        draggable
                                        onDragStart={() => { dragId.current = a.id; }}
                                        onDragEnd={() => { dragId.current = null; setOverCol(null); }}
                                    >
                                        <div className="fp-kcard-title" onClick={() => expandRecord(a.record)}>
                                            {a.businessName || a.attributeId}
                                        </div>
                                        <div className="fp-kcard-meta">
                                            <span className="fp-tag clickable" title="See feature attributes" onClick={() => drill.openAttrs(`${a.featureName} · attributes`, attrsOf(a.featureName))}>{a.featureName}</span>
                                            <button type="button" className="fp-kcard-rel" title="Relate — fork out or address by" onClick={e => { e.stopPropagation(); setRel({attr: a, mode: 'menu'}); }}>+ relate</button>
                                            {a.environment && a.environment !== 'N/A' && <Tag>{a.environment}</Tag>}
                                        </div>
                                        <div className="fp-kcard-stage">{a.currentStageName}</div>
                                        <div className="fp-kcard-foot">
                                            <StatusChip status={a.status} />
                                            <span className={`fp-acc ${met ? 'met' : ''}`} title="Acceptance criteria met">
                                                {a.acceptance.filter(i => i.done).length}/{a.acceptance.length || 0} ✓
                                            </span>
                                        </div>
                                        {col.key === 'review' && <div className="fp-kcard-next">→ {nextName(a)} on approve</div>}
                                        {a.isBlocked && a.blockedReason && <div className="fp-task-blocked">{a.blockedReason}</div>}
                                        {!met && a.status === STATUS.inProgress && (
                                            <div className="fp-muted fp-small">{remainingAcceptance(a).length} acceptance item(s) left before review</div>
                                        )}
                                    </div>
                                );
                            })}
                            {lanes[col.key].length === 0 && <div className="fp-kempty">Drop here</div>}
                        </div>
                    </div>
                ))}
            </div>

            {modal && (
                <div className="fp-modal-backdrop" onClick={() => setModal(null)}>
                    <div className="fp-modal" onClick={e => e.stopPropagation()}>
                        <h3>{modal.kind === 'block' ? 'Reason for blocking' : 'Reason for returning'}</h3>
                        <p className="fp-muted">{modal.attr.businessName || modal.attr.attributeId} · {modal.attr.currentStageName}</p>
                        <textarea
                            autoFocus
                            placeholder={modal.kind === 'block' ? 'What is blocking this?' : 'What needs to change? (required)'}
                            value={modal.text}
                            onChange={e => setModal({...modal, text: e.target.value})}
                        />
                        <div className="fp-actions">
                            <button type="button" className={modal.kind === 'return' ? 'push' : 'accept'} disabled={busyId === modal.attr.id} onClick={confirmModal}>
                                {modal.kind === 'block' ? 'Mark blocked' : 'Return'}
                            </button>
                            <button type="button" className="ghost" onClick={() => setModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <DrillDrawer drill={drill} attrsOf={attrsOf} />
            {rel && <RelEditor model={model} attr={rel.attr} initialMode={rel.mode} onClose={() => setRel(null)} />}
        </div>
    );
}
