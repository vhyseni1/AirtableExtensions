import {expandRecord} from '@airtable/blocks/interface/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {PHASE_COLORS} from './constants';
import {pathStages} from './data';
import {StatusChip} from './components';
import {useDrill, DrillDrawer} from './drill';

// Validated categorical order (dataviz six checks) — assigned to features in
// fixed model order, never cycled; features beyond 8 fold into "Other" (gray).
const FEATURE_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const OTHER_COLOR = '#8a94a6';

// Canonical stage-code order — used to place team columns left→right.
const CODE_ORDER = ['1', '2', '3', '4', '5a', '5b-MOR', '5b-MIDAS', '5b-Other', '5c', '6', '7', '8', '9', '10'];

const stageLabel = name => String(name || '').replace(/^\s*\d+[a-z]?\.\s*/i, '');

function useMeasuredWidth() {
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
    return [ref, w];
}

// ─── Attribute flow: one line per attribute, features on the y-axis ───────────
// Left edge: features stacked (each attribute starts on its feature's block).
// Columns (x) = teams in pipeline order. Each line traces the teams the
// attribute has ACTUALLY passed through and stops — with an end dot — at the
// team where it sits today; delivered lines run through to the ✓ terminal.
function AttributeFlow({model, featureColorOf, hoverFeature, setHoverFeature, onPick}) {
    const [ref, w] = useMeasuredWidth();
    const {attrs, featureOrder} = model;
    const [hoverId, setHoverId] = useState(null);

    const LANE = 14;      // vertical spacing between attribute tracks
    const FGAP = 18;      // extra gap between feature blocks

    const {teams, lines, features, plotH} = useMemo(() => {
        const teamOf = code => (model.stagesByCode[code] ? model.stagesByCode[code].responsibleTeamName : '');

        // Per attribute: the teams traversed so far (up to & incl. current stage)
        const raws = attrs.map(a => {
            const stages = pathStages(model, a);
            const curIdx = stages.findIndex(s => s.code === a.currentCode);
            const upto = a.isDelivered ? stages : stages.slice(0, Math.max(curIdx, 0) + 1);
            const visited = [];
            upto.forEach(s => {
                const t = teamOf(s.code);
                if (t && visited[visited.length - 1] !== t) visited.push(t);
            });
            return {attr: a, feature: a.featureName || 'Unassigned', visited, delivered: a.isDelivered};
        }).filter(r => r.visited.length);

        // Column order: teams by their earliest stage in the canonical ladder
        // (built from FULL paths so columns don't jump as work progresses).
        const firstCode = {};
        attrs.forEach(a => {
            pathStages(model, a).forEach(s => {
                const t = teamOf(s.code);
                const i = CODE_ORDER.indexOf(s.code);
                if (t && (!(t in firstCode) || i < firstCode[t])) firstCode[t] = i;
            });
        });
        const teamList = Object.keys(firstCode).sort((a, b) => firstCode[a] - firstCode[b]);

        // Each attribute keeps ONE horizontal track for its whole journey
        // (no re-bundling → tracks never cross → nothing to misread).
        const featList = featureOrder.filter(f => raws.some(r => r.feature === f));
        if (raws.some(r => r.feature === 'Unassigned')) featList.push('Unassigned');
        let y = 0;
        const featBlocks = [];
        const lineList = [];
        featList.forEach(f => {
            const rows = raws.filter(r => r.feature === f).sort((a, b) => (a.attr.attributeId > b.attr.attributeId ? 1 : -1));
            const top = y;
            rows.forEach(r => { lineList.push({...r, yStart: y + LANE / 2}); y += LANE; });
            featBlocks.push({name: f, top, height: rows.length * LANE});
            y += FGAP;
        });
        return {teams: teamList, lines: lineList, features: featBlocks, plotH: Math.max(y - FGAP, 120)};
    }, [attrs, model, featureOrder]);

    if (!lines.length) return <div className="fp-muted">Nothing to draw yet.</div>;

    const W = Math.max(w || 980, 680);
    const padT = 48;                            // top: team clamp nodes
    const labelArea = 92;                       // bottom: wrapped team names
    const labelW = Math.min(172, W * 0.19);
    const H = padT + plotH + labelArea;
    const axisY = padT + plotH + 8;
    const nCols = teams.length + 1;             // + Delivered terminal
    const colX = i => labelW + ((i + 1) * (W - labelW - 30)) / nCols;
    const colStep = (W - labelW - 30) / nCols;
    const colIdx = t => teams.indexOf(t);

    const endX = ln => (ln.delivered ? colX(teams.length) : colX(colIdx(ln.visited[ln.visited.length - 1])));
    const stoppedAt = t => lines.filter(l => !l.delivered && l.visited[l.visited.length - 1] === t);
    const isDim = ln => (hoverId && hoverId !== ln.attr.id) || (hoverFeature && hoverFeature !== ln.feature);
    const isHot = ln => hoverId === ln.attr.id || hoverFeature === ln.feature;

    return (
        <div className="fp-flow" ref={ref}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                {/* soft canvas behind the tracks */}
                <defs>
                    <linearGradient id="fpFlowShade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f8fafd" />
                        <stop offset="100%" stopColor="#eef2f8" />
                    </linearGradient>
                </defs>
                <rect x={labelW - 6} y={padT - 12} width={W - labelW - 10} height={plotH + 26} rx={14} fill="url(#fpFlowShade)" />

                {/* column guides */}
                {teams.map((t, i) => (
                    <line key={t} x1={colX(i)} x2={colX(i)} y1={padT - 4} y2={axisY} className="fp-flow-guide" />
                ))}
                <line x1={colX(teams.length)} x2={colX(teams.length)} y1={padT - 4} y2={axisY} className="fp-flow-guide done" />

                {/* team clamp nodes (count = attributes sitting here now) */}
                {teams.map((t, i) => {
                    const n = stoppedAt(t).length;
                    return (
                        <g key={`clamp-${t}`} className="fp-flow-node" onClick={() => onPick(`At ${t}`, stoppedAt(t).map(l => l.attr))}>
                            <rect x={colX(i) - 15} y={12} width={30} height={24} rx={12} className={`fp-flow-clamp${n ? '' : ' empty'}`} />
                            <text x={colX(i)} y={24} textAnchor="middle" dominantBaseline="central" className={`fp-flow-clamp-n${n ? '' : ' empty'}`}>{n}</text>
                            <title>{`${t} — ${n} attribute${n === 1 ? '' : 's'} here now`}</title>
                        </g>
                    );
                })}
                {(() => {
                    const n = lines.filter(l => l.delivered).length;
                    return (
                        <g className="fp-flow-node" onClick={() => onPick('Delivered', lines.filter(l => l.delivered).map(l => l.attr))}>
                            <rect x={colX(teams.length) - 15} y={12} width={30} height={24} rx={12} className={`fp-flow-clamp done${n ? '' : ' empty'}`} />
                            <text x={colX(teams.length)} y={24} textAnchor="middle" dominantBaseline="central" className="fp-flow-clamp-n done">{n}</text>
                            <title>{`Delivered — ${n}`}</title>
                        </g>
                    );
                })()}

                {/* one track per attribute */}
                {lines.map(ln => {
                    const c = featureColorOf(ln.feature);
                    const yy = padT + ln.yStart;
                    const ex = endX(ln);
                    return (
                        <g
                            key={ln.attr.id}
                            className="fp-flow-line"
                            onMouseEnter={() => setHoverId(ln.attr.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onClick={() => expandRecord(ln.attr.record)}
                        >
                            <line x1={labelW} y1={yy} x2={ex} y2={yy} className="fp-flow-hit" />
                            <line
                                x1={labelW} y1={yy} x2={ex} y2={yy}
                                className="fp-flow-path"
                                style={{stroke: c, opacity: isDim(ln) ? 0.08 : isHot(ln) ? 1 : 0.6, strokeWidth: isHot(ln) ? 3.5 : 2.25}}
                            />
                            {/* ticks: only the teams this attribute actually passed */}
                            {ln.visited.slice(0, ln.delivered ? ln.visited.length : -1).map(t => (
                                <circle key={t} cx={colX(colIdx(t))} cy={yy} r={isHot(ln) ? 3.2 : 2.6} className="fp-flow-tick" style={{fill: c, opacity: isDim(ln) ? 0.12 : 1}} />
                            ))}
                            <circle cx={ex} cy={yy} r={isHot(ln) ? 5.5 : 4} className="fp-flow-end" style={{fill: ln.delivered ? '#16a34a' : c, opacity: isDim(ln) ? 0.15 : 1}} />
                            <title>{`${ln.attr.businessName || ln.attr.attributeId} · ${ln.feature}\n${ln.delivered ? 'Delivered ✓' : `Now: ${stageLabel(ln.attr.currentStageName)} (${ln.visited[ln.visited.length - 1]})`} · ${ln.attr.status}`}</title>
                        </g>
                    );
                })}

                {/* bottom axis: horizontal wrapped team names */}
                {teams.map((t, i) => (
                    <g key={t} className="fp-flow-node" onClick={() => onPick(`At ${t}`, stoppedAt(t).map(l => l.attr))}>
                        <foreignObject x={colX(i) - colStep / 2 + 3} y={axisY + 6} width={colStep - 6} height={labelArea - 12}>
                            <div xmlns="http://www.w3.org/1999/xhtml" className="fp-flow-label" title={t}>{t}</div>
                        </foreignObject>
                    </g>
                ))}
                <g className="fp-flow-node" onClick={() => onPick('Delivered', lines.filter(l => l.delivered).map(l => l.attr))}>
                    <foreignObject x={colX(teams.length) - colStep / 2 + 3} y={axisY + 6} width={colStep - 6} height={labelArea - 12}>
                        <div xmlns="http://www.w3.org/1999/xhtml" className="fp-flow-label done" title="Delivered">✓ Delivered</div>
                    </foreignObject>
                </g>

                {/* feature labels on the y-axis (hover isolates the feature) */}
                {features.map(f => (
                    <g
                        key={f.name}
                        className="fp-flow-feat"
                        onMouseEnter={() => setHoverFeature(f.name)}
                        onMouseLeave={() => setHoverFeature(null)}
                        onClick={() => onPick(f.name, attrs.filter(a => (a.featureName || 'Unassigned') === f.name))}
                    >
                        <rect x={4} y={padT + f.top - 2} width={5} height={f.height + 4} rx={2.5} fill={featureColorOf(f.name)} />
                        <text x={15} y={padT + f.top + f.height / 2} dominantBaseline="middle" className="fp-flow-featname">
                            {f.name.length > 21 ? `${f.name.slice(0, 20)}…` : f.name}
                        </text>
                        <title>{f.name}</title>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ─── Journey log (what · who · when) for one attribute ────────────────────────
function JourneyLog({model, attr}) {
    const events = useMemo(
        () => model.handshakes.filter(h => h.attribute === attr.attributeId).slice().reverse(),
        [model.handshakes, attr.attributeId],
    );
    const returns = events.filter(e => /return/i.test(e.action)).length;
    const cycles = events.reduce((m, e) => Math.max(m, Number(e.cycleNumber) || 1), 1);

    return (
        <div className="fp-journey">
            <div className="fp-journey-sub">
                Journey log
                <span className="fp-muted fp-small"> · {events.length} event{events.length === 1 ? '' : 's'} · {returns} return{returns === 1 ? '' : 's'} · cycle {cycles}</span>
            </div>
            {events.length === 0 ? (
                <div className="fp-muted">No handoffs recorded yet — still in its first stage.</div>
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
                                        <span className="fp-jlog-stage">{stageLabel(e.stage)}</span>
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

// ─── One attribute: a lean line collapsed; pointy journey + log expanded ──────
function AttributeRow({model, attr, expanded, onToggle}) {
    const stages = pathStages(model, attr);
    const curIdx = stages.findIndex(s => s.code === attr.currentCode);
    const done = attr.isDelivered ? stages.length : Math.max(curIdx, 0);

    return (
        <li className={`fp-arow${expanded ? ' open' : ''}`}>
            <div className="fp-arow-head clickable" onClick={onToggle} title={expanded ? 'Collapse' : 'Show full journey'}>
                <span className="fp-arow-chev" aria-hidden>{expanded ? '▾' : '▸'}</span>
                <span className="fp-arow-name" onClick={e => { e.stopPropagation(); expandRecord(attr.record); }} title="Open record">
                    {attr.businessName || attr.attributeId}
                </span>
                <span className="fp-mini" role="img" aria-label={`${done} of ${stages.length} steps done`}>
                    {stages.map((s, i) => {
                        const state = attr.isDelivered || i < curIdx ? 'done' : i === curIdx ? 'current' : 'todo';
                        return (
                            <i
                                key={s.code}
                                className={`fp-mini-seg ${state}`}
                                style={state === 'todo' ? undefined : {background: PHASE_COLORS[s.phaseGroup] || '#94a3b8'}}
                                title={`${s.name}${state === 'current' ? ' — current' : ''}`}
                            />
                        );
                    })}
                </span>
                <span className="fp-arow-pos">{attr.isDelivered ? 'Delivered' : stageLabel(attr.currentStageName)}</span>
                {attr.isDelivered ? <span className="fp-arow-done">✓</span> : <StatusChip status={attr.status} />}
            </div>
            {expanded && (
                <div className="fp-arow-body">
                    <div className="fp-chevs" role="img" aria-label={`Journey: step ${Math.max(curIdx, 0) + 1} of ${stages.length}`}>
                        {stages.map((s, i) => {
                            const state = attr.isDelivered || i < curIdx ? 'done' : i === curIdx ? 'current' : 'todo';
                            const c = PHASE_COLORS[s.phaseGroup] || '#94a3b8';
                            return (
                                <div
                                    key={s.code}
                                    className={`fp-chevron ${state}`}
                                    style={state === 'todo' ? undefined : {background: c}}
                                    title={`${s.name} · ${s.phaseGroup} phase${state === 'current' ? ' — current' : state === 'done' ? ' — done' : ''}`}
                                >
                                    <span>{stageLabel(s.name)}</span>
                                </div>
                            );
                        })}
                    </div>
                    <JourneyLog model={model} attr={attr} />
                </div>
            )}
        </li>
    );
}

export default function Traceability({model}) {
    const {attrs, featureOrder} = model;
    const drill = useDrill();
    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);
    const [hoverFeature, setHoverFeature] = useState(null);

    const featureColorOf = useMemo(() => f => {
        const i = featureOrder.indexOf(f);
        return i >= 0 && i < FEATURE_COLORS.length ? FEATURE_COLORS[i] : OTHER_COLOR;
    }, [featureOrder]);

    const featureNames = useMemo(() => {
        const withAttrs = new Set(attrs.map(a => a.featureName).filter(Boolean));
        return featureOrder.filter(f => withAttrs.has(f));
    }, [attrs, featureOrder]);

    const ALL = '__all__';
    const [feature, setFeature] = useState(ALL);
    const [expandedId, setExpandedId] = useState(null);
    const shownFeatures = feature === ALL ? featureNames : [feature];

    return (
        <div className="fp-mode">
            <div className="fp-section-title">Attribute flow — every line is one attribute travelling across teams</div>
            <div className="fp-panel fp-panel-roomy">
                <AttributeFlow
                    model={model}
                    featureColorOf={featureColorOf}
                    hoverFeature={hoverFeature}
                    setHoverFeature={setHoverFeature}
                    onPick={(title, items) => drill.openAttrs(title, items)}
                />
                <div className="fp-panel-hint">Each line is one attribute on its own track, grouped by feature (left). A <b>tick</b> marks every team it has passed through — no tick means that team isn’t on its path — and the line <b>ends with a dot at the team it sits with today</b>; the badge under each column counts them. Delivered attributes run to the ✓ terminal. Hover a line or a feature label to isolate it; click a line to open its record, a column for the list.</div>
            </div>

            <div className="fp-section-title">Attribute traceability — where each attribute is on its journey</div>
            <div className="fp-panel fp-panel-roomy">
                <div className="fp-teambar">
                    <label>Feature
                        <select value={feature} onChange={e => { setFeature(e.target.value); setExpandedId(null); }}>
                            <option value={ALL}>All features</option>
                            {featureNames.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </label>
                    <div className="fp-wf-hint">Every arrow is a stage on the attribute’s <b>own</b> path. Solid = done, highlighted = where it is now. Expand a row for the handoff log.</div>
                </div>
                {shownFeatures.map(f => {
                    const list = attrsOf(f);
                    const feat = model.features.find(x => x.name === f);
                    const delivered = list.filter(a => a.isDelivered).length;
                    return (
                        <div key={f} className="fp-featcard" style={{'--fc': featureColorOf(f)}}>
                            <div className="fp-featcard-head clickable" onClick={() => drill.openAttrs(f, list)} title="See as list">
                                <div className="fp-featcard-title">
                                    <span className="fp-featcard-kicker">Feature</span>
                                    <span className="fp-featcard-name">{f}</span>
                                </div>
                                <div className="fp-featcard-meta">
                                    <span><b>{list.length}</b> attributes</span>
                                    <span><b>{delivered}</b> delivered</span>
                                    {feat && <span><b>{feat.pct}%</b> mature</span>}
                                    {feat && feat.goLive && <span>go-live <b>{feat.goLive}</b></span>}
                                </div>
                            </div>
                            <ul className="fp-arows">
                                {list.map(a => (
                                    <AttributeRow
                                        key={a.id}
                                        model={model}
                                        attr={a}
                                        expanded={expandedId === a.id}
                                        onToggle={() => setExpandedId(x => (x === a.id ? null : a.id))}
                                    />
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>

            <DrillDrawer drill={drill} attrsOf={attrsOf} />
        </div>
    );
}
