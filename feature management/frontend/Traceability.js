import {expandRecord} from '@airtable/blocks/interface/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {pathStages} from './data';
import {StatusChip, Tag} from './components';
import {useDrill, DrillDrawer} from './drill';

// ─── Sankey: work by team → phase ─────────────────────────────────────────────
// Two-column flow, pure SVG. Ribbon width = attribute count; ribbons carry the
// phase hue with a surface stroke as the separation gap; nodes are direct-labeled
// (name + count) so identity never rides on color alone.
function TeamSankey({attrs, onPick}) {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width));
        ro.observe(el);
        setW(el.clientWidth);
        return () => ro.disconnect();
    }, []);
    const [hover, setHover] = useState(null); // 'team|phase'

    const {teams, phases, links} = useMemo(() => {
        const byTeam = {};
        attrs.forEach(a => {
            if (!a.assignedTeamName || !a.phase) return;
            const t = (byTeam[a.assignedTeamName] = byTeam[a.assignedTeamName] || {});
            (t[a.phase] = t[a.phase] || []).push(a);
        });
        const teamList = Object.keys(byTeam)
            .map(name => ({name, total: Object.values(byTeam[name]).reduce((s, l) => s + l.length, 0)}))
            .sort((a, b) => b.total - a.total);
        const phaseTotals = {};
        PHASE_GROUPS.forEach(p => (phaseTotals[p] = 0));
        const linkList = [];
        teamList.forEach(t => {
            PHASE_GROUPS.forEach(p => {
                const items = byTeam[t.name][p];
                if (items && items.length) {
                    linkList.push({team: t.name, phase: p, items});
                    phaseTotals[p] += items.length;
                }
            });
        });
        const phaseList = PHASE_GROUPS.filter(p => phaseTotals[p] > 0).map(p => ({name: p, total: phaseTotals[p]}));
        return {teams: teamList, phases: phaseList, links: linkList};
    }, [attrs]);

    if (!teams.length) return <div className="fp-muted">No assigned work to draw.</div>;

    const W = Math.max(w || 900, 560);
    const labelL = Math.min(230, W * 0.26);
    const labelR = Math.min(150, W * 0.18);
    const nodeW = 12;
    const gap = 12;
    const total = links.reduce((s, l) => s + l.items.length, 0);
    const innerH = Math.max(300, teams.length * 40, phases.length * 46);
    const scale = Math.min(
        (innerH - gap * (teams.length - 1)) / total,
        (innerH - gap * (phases.length - 1)) / total,
    );
    const H = innerH + 20;
    const x0 = labelL;
    const x1 = W - labelR - nodeW;

    // Node positions (stacked, proportional heights)
    let y = 10;
    const teamPos = {};
    teams.forEach(t => { teamPos[t.name] = {y, h: t.total * scale}; y += t.total * scale + gap; });
    y = 10;
    const phasePos = {};
    phases.forEach(p => { phasePos[p.name] = {y, h: p.total * scale}; y += p.total * scale + gap; });

    // Link offsets within each node (teams stack their links in phase order;
    // phases stack theirs in team order — links[] is already in that order).
    const tOff = {};
    const pOff = {};
    const ribbons = links.map(l => {
        const h = l.items.length * scale;
        const ty = teamPos[l.team].y + (tOff[l.team] = tOff[l.team] || 0);
        tOff[l.team] += h;
        const py = phasePos[l.phase].y + (pOff[l.phase] = pOff[l.phase] || 0);
        pOff[l.phase] += h;
        const mx = (x0 + nodeW + x1) / 2;
        const d = `M ${x0 + nodeW} ${ty} C ${mx} ${ty}, ${mx} ${py}, ${x1} ${py}`
            + ` L ${x1} ${py + h} C ${mx} ${py + h}, ${mx} ${ty + h}, ${x0 + nodeW} ${ty + h} Z`;
        return {...l, d, h};
    });

    const dim = key => hover && hover !== key;

    return (
        <div className="fp-sankey" ref={ref}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                {ribbons.map(r => {
                    const key = `${r.team}|${r.phase}`;
                    return (
                        <path
                            key={key}
                            d={r.d}
                            className="fp-sk-link"
                            style={{fill: PHASE_COLORS[r.phase], opacity: hover === key ? 0.82 : dim(key) ? 0.14 : 0.44}}
                            onMouseEnter={() => setHover(key)}
                            onMouseLeave={() => setHover(null)}
                            onClick={() => onPick(`${r.team} · ${r.phase}`, r.items)}
                        >
                            <title>{`${r.team} → ${r.phase} · ${r.items.length} attribute${r.items.length === 1 ? '' : 's'}`}</title>
                        </path>
                    );
                })}
                {teams.map(t => (
                    <g key={t.name} className="fp-sk-node" onClick={() => onPick(t.name, attrs.filter(a => a.assignedTeamName === t.name))}>
                        <rect x={x0} y={teamPos[t.name].y} width={nodeW} height={Math.max(teamPos[t.name].h, 3)} rx={3} fill="#14274e" />
                        <text x={x0 - 10} y={teamPos[t.name].y + Math.max(teamPos[t.name].h, 3) / 2} textAnchor="end" dominantBaseline="middle">
                            <tspan className="fp-sk-name">{t.name.length > 30 ? `${t.name.slice(0, 29)}…` : t.name}</tspan>
                            <tspan className="fp-sk-count" dx={6}>{t.total}</tspan>
                        </text>
                        <title>{`${t.name} · ${t.total}`}</title>
                    </g>
                ))}
                {phases.map(p => (
                    <g key={p.name} className="fp-sk-node" onClick={() => onPick(`${p.name} phase`, attrs.filter(a => a.phase === p.name))}>
                        <rect x={x1} y={phasePos[p.name].y} width={nodeW} height={Math.max(phasePos[p.name].h, 3)} rx={3} fill={PHASE_COLORS[p.name]} />
                        <text x={x1 + nodeW + 10} y={phasePos[p.name].y + Math.max(phasePos[p.name].h, 3) / 2} dominantBaseline="middle">
                            <tspan className="fp-sk-name">{p.name}</tspan>
                            <tspan className="fp-sk-count" dx={6}>{p.total}</tspan>
                        </text>
                        <title>{`${p.name} · ${p.total}`}</title>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ─── Attribute journey — start → finish stepper + handoff log ─────────────────
function Journey({model, attr}) {
    const stages = pathStages(model, attr);
    const curIdx = stages.findIndex(s => s.code === attr.currentCode);
    const doneUpTo = attr.isDelivered ? stages.length - 1 : curIdx;

    const events = useMemo(
        () => model.handshakes.filter(h => h.attribute === attr.attributeId).slice().reverse(),
        [model.handshakes, attr.attributeId],
    );
    const cycles = events.reduce((m, e) => Math.max(m, Number(e.cycleNumber) || 1), 1);
    const returns = events.filter(e => /return/i.test(e.action)).length;

    return (
        <div className="fp-journey">
            <div className="fp-journey-head">
                <div>
                    <div className="fp-journey-title clickable" onClick={() => expandRecord(attr.record)} title="Open record">
                        {attr.businessName || attr.attributeId} <span className="fp-muted">· {attr.featureName}</span>
                    </div>
                    <div className="fp-journey-meta">
                        <StatusChip status={attr.status} />
                        <Tag>{attr.currentStageName}</Tag>
                        {attr.assignedTeamName && <Tag>{attr.assignedTeamName}</Tag>}
                    </div>
                </div>
                <div className="fp-journey-stats">
                    <span><b>{Math.max(doneUpTo, 0)}</b>/{stages.length - 1} handoffs done</span>
                    <span><b>{events.length}</b> events</span>
                    <span><b>{returns}</b> returns · cycle {cycles}</span>
                </div>
            </div>

            {/* Stepper: the attribute's own path, start → finish */}
            <div className="fp-stepper" role="img" aria-label={`Journey: stage ${curIdx + 1} of ${stages.length}`}>
                {stages.map((s, i) => {
                    const state = attr.isDelivered || i < curIdx ? 'done' : i === curIdx ? 'current' : 'todo';
                    const c = PHASE_COLORS[s.phaseGroup] || '#94a3b8';
                    return (
                        <div className={`fp-step ${state}`} key={s.code} style={{'--step': c}} title={`${s.name} · ${s.phaseGroup}`}>
                            {i > 0 && <span className="fp-step-link" />}
                            <span className="fp-step-dot">{state === 'done' ? '✓' : ''}</span>
                            <span className="fp-step-code">{s.code}</span>
                            {state === 'current' && !attr.isDelivered && (
                                <span className="fp-step-now" style={{borderColor: c}}>{s.name}</span>
                            )}
                        </div>
                    );
                })}
                <div className={`fp-step ${attr.isDelivered ? 'done' : 'todo'} fp-step-finish`} title="Delivered">
                    <span className="fp-step-link" />
                    <span className="fp-step-dot">🏁</span>
                    <span className="fp-step-code">Done</span>
                </div>
            </div>

            {/* Handoff log — what, who, when */}
            <div className="fp-journey-sub">Journey log</div>
            {events.length === 0 ? (
                <div className="fp-muted">No handoffs recorded yet — this attribute is still in its first stage.</div>
            ) : (
                <ul className="fp-jlog">
                    {events.map(e => {
                        const isReturn = /return/i.test(e.action);
                        return (
                            <li key={e.id} className="clickable" onClick={() => expandRecord(e.record)} title="Open handshake record">
                                <span className={`fp-jlog-dot${isReturn ? ' ret' : ''}`}>{isReturn ? '↩' : '→'}</span>
                                <div className="fp-jlog-main">
                                    <div className="fp-jlog-top">
                                        <StatusChip status={e.action} />
                                        <span className="fp-jlog-stage">{e.stage}</span>
                                        <span className="fp-jlog-when">{e.timestamp}</span>
                                    </div>
                                    <div className="fp-jlog-who">{e.fromTeam} <span aria-hidden>→</span> {e.toTeam || '—'} · {e.decisionMaker || 'team'}</div>
                                    {e.comments && <div className="fp-jlog-note">“{e.comments}”</div>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default function Traceability({model}) {
    const {attrs} = model;
    const drill = useDrill();
    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    const byFeature = useMemo(() => {
        const m = {};
        attrs.forEach(a => { (m[a.featureName || 'Unassigned'] = m[a.featureName || 'Unassigned'] || []).push(a); });
        return m;
    }, [attrs]);
    const [selId, setSelId] = useState(attrs.length ? attrs[0].id : null);
    const selected = attrs.find(a => a.id === selId) || attrs[0] || null;

    return (
        <div className="fp-mode">
            <div className="fp-section-title">Flow of work — team → phase</div>
            <div className="fp-panel fp-panel-roomy">
                <div className="fp-panel-hint">Ribbon width = number of attributes a team currently owns in that phase. Click a ribbon or node to see the list, then any row to open the record.</div>
                <TeamSankey attrs={attrs} onPick={(title, items) => drill.openAttrs(title, items)} />
            </div>

            <div className="fp-section-title">Attribute traceability — the journey, start to finish</div>
            <div className="fp-panel fp-panel-roomy">
                <div className="fp-teambar">
                    <label>Attribute
                        <select value={selected ? selected.id : ''} onChange={e => setSelId(e.target.value)}>
                            {Object.keys(byFeature).sort().map(f => (
                                <optgroup key={f} label={f}>
                                    {byFeature[f].map(a => (
                                        <option key={a.id} value={a.id}>{a.businessName || a.attributeId} ({a.attributeId})</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <div className="fp-wf-hint">Every step is this attribute’s own path — gateway and sourcing branches included.</div>
                </div>
                {selected ? <Journey model={model} attr={selected} /> : <div className="fp-muted">No attributes found.</div>}
            </div>

            <DrillDrawer drill={drill} attrsOf={attrsOf} />
        </div>
    );
}
