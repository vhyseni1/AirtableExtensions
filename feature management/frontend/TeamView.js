import {expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {StatusChip, Tag} from './components';

export default function TeamView({model}) {
    const {attrs, teamNames, usersByTeam} = model;
    const [team, setTeam] = useState(teamNames[0] || '');

    const mine = useMemo(() => attrs.filter(a => a.assignedTeamName === team), [attrs, team]);

    // Group this team's work by phase, and count load per assignee.
    const {byPhase, perPerson} = useMemo(() => {
        const phase = {};
        PHASE_GROUPS.forEach(p => (phase[p] = []));
        const person = {};
        mine.forEach(a => {
            if (phase[a.phase]) phase[a.phase].push(a);
            const k = a.assignee || '(unassigned)';
            person[k] = (person[k] || 0) + 1;
        });
        return {byPhase: phase, perPerson: person};
    }, [mine]);

    const roster = usersByTeam[team] || [];

    return (
        <div className="fp-mode">
            <div className="fp-teambar">
                <label>Team
                    <select value={team} onChange={e => setTeam(e.target.value)}>
                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <div className="fp-roster">
                    {roster.map(u => <Tag key={u} title="Team member">{u}</Tag>)}
                    {roster.length === 0 && <span className="fp-muted fp-small">No users listed on this team.</span>}
                </div>
            </div>

            <div className="fp-kpis fp-kpis-sm">
                <div className="fp-kpi"><div className="fp-kpi-value">{mine.length}</div><div className="fp-kpi-label">Attributes owned</div></div>
                <div className="fp-kpi"><div className="fp-kpi-value">{mine.filter(a => a.isActive).length}</div><div className="fp-kpi-label">Active</div></div>
                <div className="fp-kpi"><div className="fp-kpi-value" style={{color: '#ef4444'}}>{mine.filter(a => a.isBlocked).length}</div><div className="fp-kpi-label">Blocked</div></div>
                <div className="fp-kpi"><div className="fp-kpi-value" style={{color: '#22c55e'}}>{mine.filter(a => a.isReadyToPush).length}</div><div className="fp-kpi-label">Ready to push</div></div>
            </div>

            <div className="fp-section-title">Load by person</div>
            <div className="fp-people">
                {Object.keys(perPerson).sort().map(p => (
                    <Tag key={p}>{p} · {perPerson[p]}</Tag>
                ))}
                {Object.keys(perPerson).length === 0 && <span className="fp-muted">Nothing assigned.</span>}
            </div>

            <div className="fp-section-title">Work by stage</div>
            <div className="fp-board">
                {PHASE_GROUPS.map(p => (
                    <div className="fp-col" key={p}>
                        <div className="fp-col-head" style={{borderBottomColor: PHASE_COLORS[p]}}>
                            <span>{p}</span><span className="fp-col-count">{byPhase[p].length}</span>
                        </div>
                        <div className="fp-col-body">
                            {byPhase[p].map(a => (
                                <button type="button" className="fp-card" key={a.id} style={{borderLeftColor: PHASE_COLORS[p]}} onClick={() => expandRecord(a.record)}>
                                    <div className="fp-card-title">{a.businessName || a.attributeId}</div>
                                    <div className="fp-card-meta"><Tag>{a.featureName}</Tag>{a.environment && a.environment !== 'N/A' && <Tag>{a.environment}</Tag>}</div>
                                    <div className="fp-card-row"><StatusChip status={a.status} /></div>
                                    <div className="fp-card-sub">{a.currentStageName}{a.assignee ? ` · ${a.assignee}` : ''}{a.dueDate ? ` · due ${a.dueDate}` : ''}</div>
                                    {a.isBlocked && a.blockedReason && <div className="fp-task-blocked">{a.blockedReason}</div>}
                                </button>
                            ))}
                            {byPhase[p].length === 0 && <div className="fp-muted fp-empty">—</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
