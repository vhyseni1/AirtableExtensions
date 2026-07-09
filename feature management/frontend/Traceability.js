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
function AttributeFlow({model, featureColorOf, hoverFeature, onPick}) {
    const [ref, w] = useMeasuredWidth();
    const {attrs, featureOrder} = model;
    const [hoverId, setHoverId] = useState(null);

    const LANE = 13;      // vertical spacing between attribute lines
    const FGAP = 16;      // extra gap between feature blocks

    const {teams, lines, features, plotH} = useMemo(() => {
        const teamOf = code => (model.stagesByCode[code] ? model.stagesByCode[code].responsibleTeamName : '');
        const featIdx = f => { const i = featureOrder.indexOf(f); return i < 0 ? 999 : i; };

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

        // y start slots: features stacked in fixed order, attributes within
        const featList = featureOrder.filter(f => raws.some(r => r.feature === f));
        if (raws.some(r => r.feature === 'Unassigned')) featList.push('Unassigned');
        let y = 0;
        const featBlocks = [];
        const sorted = [];
        featList.forEach(f => {
            const rows = raws.filter(r => r.feature === f).sort((a, b) => (a.attr.attributeId > b.attr.attributeId ? 1 : -1));
            const top = y;
            rows.forEach(r => { sorted.push({...r, yStart: y + LANE / 2}); y += LANE; });
            featBlocks.push({name: f, top, height: rows.length * LANE});
            y += FGAP;
        });
        const height = Math.max(y - FGAP, 120);

        // Per-column lanes: lines through a team stack by start order (keeps
        // features contiguous), bundle centred on the plot's midline.
        const mid = height / 2;
        const laneY = {};
        teamList.forEach(t => {
            const through = sorted.filter(r => r.visited.includes(t));
            const top = mid - ((through.length - 1) * LANE) / 2;
            through.forEach((r, i) => { laneY[`${t}|${r.attr.id}`] = top + i * LANE; });
        });

        const lineList = sorted.map(r => ({
            ...r,
            pts: [{x: -1, y: r.yStart}, ...r.visited.map((t, i) => ({x: teamList.indexOf(t), y: laneY[`${t}|${r.attr.id}`], team: t, last: i === r.visited.length - 1}))],
            fi: featIdx(r.feature),
        }));
        return {teams: teamList, lines: lineList, features: featBlocks, plotH: height};
    }, [attrs, model, featureOrder]);

    if (!lines.length) return <div className="fp-muted">Nothing to draw yet.</div>;

    const W = Math.max(w || 980, 680);
    const padT = 54;
    const padB = 18;
    const labelW = Math.min(170, W * 0.18);
    const H = padT + plotH + padB;
    const nCols = teams.length + 1; // + Delivered terminal
    const colX = i => labelW + ((i + 1) * (W - labelW - 26)) / nCols;
    const xOf = p => (p.x === -1 ? labelW : colX(p.x));
    const yOf = p => padT + p.y;

    const pathFor = ln => {
        let d = '';
        const pts = ln.pts;
        for (let i = 0; i < pts.length; i++) {
            const x = xOf(pts[i]);
            const y = yOf(pts[i]);
            if (i === 0) { d = `M ${x} ${y}`; continue; }
            const px = xOf(pts[i - 1]);
            const py = yOf(pts[i - 1]);
            const mx = (px + x) / 2;
            d += ` C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
        }
        if (ln.delivered) {
            const lastPt = pts[pts.length - 1];
            const x = xOf(lastPt);
            const y = yOf(lastPt);
            const dx = colX(teams.length);
            d += ` C ${(x + dx) / 2} ${y}, ${(x + dx) / 2} ${y}, ${dx} ${y}`;
        }
        return d;
    };

    const stoppedAt = t => lines.filter(l => !l.delivered && l.pts[l.pts.length - 1].team === t);
    const isDim = ln => (hoverId && hoverId !== ln.attr.id) || (hoverFeature && hoverFeature !== ln.feature);
    const isHot = ln => hoverId === ln.attr.id || hoverFeature === ln.feature;

    return (
        <div className="fp-flow" ref={ref}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                {/* team columns */}
                {teams.map((t, i) => {
                    const stopped = stoppedAt(t);
                    const short = t.length > 20 ? `${t.slice(0, 19)}…` : t;
                    return (
                        <g key={t} className="fp-flow-node" onClick={() => onPick(`At ${t}`, stopped.map(l => l.attr))}>
                            <line x1={colX(i)} x2={colX(i)} y1={padT - 8} y2={H - padB} className="fp-flow-guide" />
                            <text x={colX(i)} y={padT - 26} textAnchor="start" className="fp-flow-name" transform={`rotate(-22 ${colX(i)} ${padT - 26})`}>{short}</text>
                            {stopped.length > 0 && (
                                <g>
                                    <circle cx={colX(i)} cy={padT - 12} r={9} className="fp-flow-badge" />
                                    <text x={colX(i)} y={padT - 12} textAnchor="middle" dominantBaseline="central" className="fp-flow-badge-n">{stopped.length}</text>
                                </g>
                            )}
                            <title>{`${t} — ${stopped.length} attribute${stopped.length === 1 ? '' : 's'} here now`}</title>
                        </g>
                    );
                })}
                {/* delivered terminal */}
                <g className="fp-flow-node" onClick={() => onPick('Delivered', lines.filter(l => l.delivered).map(l => l.attr))}>
                    <line x1={colX(teams.length)} x2={colX(teams.length)} y1={padT - 8} y2={H - padB} className="fp-flow-guide done" />
                    <text x={colX(teams.length)} y={padT - 26} textAnchor="start" className="fp-flow-name done" transform={`rotate(-22 ${colX(teams.length)} ${padT - 26})`}>✓ Delivered</text>
                </g>

                {/* one line per attribute */}
                {lines.map(ln => {
                    const c = featureColorOf(ln.feature);
                    const endPt = ln.delivered ? {x: colX(teams.length), y: yOf(ln.pts[ln.pts.length - 1])} : {x: xOf(ln.pts[ln.pts.length - 1]), y: yOf(ln.pts[ln.pts.length - 1])};
                    return (
                        <g
                            key={ln.attr.id}
                            className="fp-flow-line"
                            onMouseEnter={() => setHoverId(ln.attr.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onClick={() => expandRecord(ln.attr.record)}
                        >
                            <path d={pathFor(ln)} className="fp-flow-hit" />
                            <path
                                d={pathFor(ln)}
                                className="fp-flow-path"
                                style={{stroke: c, opacity: isDim(ln) ? 0.08 : isHot(ln) ? 1 : 0.62, strokeWidth: isHot(ln) ? 3.5 : 2.25}}
                            />
                            <circle cx={endPt.x} cy={endPt.y} r={isHot(ln) ? 5.5 : 4} className={`fp-flow-end${ln.delivered ? ' done' : ''}`} style={{fill: ln.delivered ? '#16a34a' : c, opacity: isDim(ln) ? 0.15 : 1}} />
                            <title>{`${ln.attr.businessName || ln.attr.attributeId} · ${ln.feature}\n${ln.delivered ? 'Delivered ✓' : `Now: ${stageLabel(ln.attr.currentStageName)} (${ln.pts[ln.pts.length - 1].team})`} · ${ln.attr.status}`}</title>
                        </g>
                    );
                })}

                {/* feature labels on the y-axis */}
                {features.map(f => (
                    <g key={f.name} className="fp-flow-feat" onClick={() => onPick(f.name, attrs.filter(a => (a.featureName || 'Unassigned') === f.name))}>
                        <rect x={4} y={padT + f.top - 2} width={5} height={f.height + 4} rx={2.5} fill={featureColorOf(f.name)} />
                        <text x={15} y={padT + f.top + f.height / 2} dominantBaseline="middle" className="fp-flow-featname">
                            {f.name.length > 20 ? `${f.name.slice(0, 19)}…` : f.name}
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

// ─── The pointy strip: an attribute's path as process arrows ──────────────────
function AttributeRow({model, attr, expanded, onToggle}) {
    const stages = pathStages(model, attr);
    const curIdx = stages.findIndex(s => s.code === attr.currentCode);

    return (
        <li className={`fp-arow${expanded ? ' open' : ''}`}>
            <div className="fp-arow-head clickable" onClick={onToggle} title={expanded ? 'Collapse' : 'Show journey log'}>
                <span className="fp-arow-chev" aria-hidden>{expanded ? '▾' : '▸'}</span>
                <span className="fp-arow-name" onClick={e => { e.stopPropagation(); expandRecord(attr.record); }} title="Open record">
                    {attr.businessName || attr.attributeId}
                </span>
                {attr.isDelivered ? <span className="fp-arow-done">✓ Delivered</span> : <StatusChip status={attr.status} />}
            </div>
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
            {expanded && <JourneyLog model={model} attr={attr} />}
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
                <div className="fp-legend fp-legend-top">
                    {featureNames.map(f => (
                        <span
                            key={f}
                            className={`clickable${hoverFeature && hoverFeature !== f ? ' fp-dim' : ''}`}
                            onMouseEnter={() => setHoverFeature(f)}
                            onMouseLeave={() => setHoverFeature(null)}
                            onClick={() => drill.openAttrs(f, attrsOf(f))}
                        >
                            <i style={{background: featureColorOf(f)}} />{f}
                        </span>
                    ))}
                </div>
                <AttributeFlow
                    model={model}
                    featureColorOf={featureColorOf}
                    hoverFeature={hoverFeature}
                    onPick={(title, items) => drill.openAttrs(title, items)}
                />
                <div className="fp-panel-hint">Lines start on their feature (left) and trace the teams the attribute has passed through — a line <b>stops with a dot at the team it sits with today</b>; the badge on each column counts them. Delivered attributes run through to the ✓ terminal. Hover to follow one attribute or one feature; click a line to open its record, a column for the list.</div>
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
                    return (
                        <div key={f} className="fp-featgroup">
                            <div className="fp-featgroup-head clickable" onClick={() => drill.openAttrs(f, list)}>
                                <i style={{background: featureColorOf(f)}} />
                                {f} <span className="fp-col-count">{list.length}</span>
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
