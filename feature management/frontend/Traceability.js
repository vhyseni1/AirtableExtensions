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

// Human label for a stage: drop the "3." / "5b." prefix, keep the name.
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

// ─── Work by team: stacked columns (x = team, y = attributes, stack = feature) ─
function TeamColumns({model, featureColorOf, onPick}) {
    const [ref, w] = useMeasuredWidth();
    const {attrs, featureOrder} = model;

    const {teams, maxTotal} = useMemo(() => {
        const byTeam = {};
        attrs.forEach(a => {
            if (!a.assignedTeamName) return;
            const t = (byTeam[a.assignedTeamName] = byTeam[a.assignedTeamName] || {});
            const f = a.featureName || 'Unassigned';
            (t[f] = t[f] || []).push(a);
        });
        const order = [...featureOrder, 'Unassigned'];
        const list = Object.keys(byTeam).map(name => {
            const segs = order
                .filter(f => byTeam[name][f])
                .map(f => ({feature: f, items: byTeam[name][f]}));
            return {name, segs, total: segs.reduce((s, x) => s + x.items.length, 0)};
        }).sort((a, b) => b.total - a.total);
        return {teams: list, maxTotal: Math.max(1, ...list.map(t => t.total))};
    }, [attrs, featureOrder]);

    if (!teams.length) return <div className="fp-muted">No assigned work to draw.</div>;

    const W = Math.max(w || 900, 560);
    const padL = 34;
    const padR = 8;
    const padT = 24;
    const plotH = 280;
    const labelH = 78;
    const H = padT + plotH + labelH;
    const plotW = W - padL - padR;
    const slot = plotW / teams.length;
    const colW = Math.max(26, Math.min(64, slot * 0.58));

    const step = Math.max(1, Math.ceil(maxTotal / 4));
    const yMax = step * Math.ceil(maxTotal / step);
    const ticks = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    const yOf = v => padT + plotH - (v / yMax) * plotH;

    // Top-rounded rect (4px rounded data-end, baseline end stays square).
    const topRect = (x, y, wd, h, r) => {
        const rr = Math.min(r, h / 2, wd / 2);
        return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + wd - rr} ${y} Q ${x + wd} ${y} ${x + wd} ${y + rr} L ${x + wd} ${y + h} Z`;
    };

    return (
        <div className="fp-cols" ref={ref}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                {ticks.map(v => (
                    <g key={v}>
                        <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} className="fp-col-grid" />
                        <text x={padL - 8} y={yOf(v)} textAnchor="end" dominantBaseline="middle" className="fp-col-tick">{v}</text>
                    </g>
                ))}
                {teams.map((t, i) => {
                    const cx = padL + slot * i + slot / 2;
                    const x = cx - colW / 2;
                    let cum = 0;
                    const short = t.name.length > 24 ? `${t.name.slice(0, 23)}…` : t.name;
                    return (
                        <g key={t.name}>
                            {t.segs.map((s, j) => {
                                const h = (s.items.length / yMax) * plotH;
                                const yTop = padT + plotH - cum - h;
                                cum += h;
                                const isTop = j === t.segs.length - 1;
                                const drawH = Math.max(h - 2, 2); // 2px surface gap between segments
                                return (
                                    <path
                                        key={s.feature}
                                        d={isTop ? topRect(x, yTop, colW, drawH, 4) : `M ${x} ${yTop} h ${colW} v ${drawH} h ${-colW} Z`}
                                        fill={featureColorOf(s.feature)}
                                        className="fp-col-seg"
                                        onClick={() => onPick(`${t.name} · ${s.feature}`, s.items)}
                                    >
                                        <title>{`${t.name} · ${s.feature} — ${s.items.length} attribute${s.items.length === 1 ? '' : 's'}`}</title>
                                    </path>
                                );
                            })}
                            <text x={cx} y={padT + plotH - cum - 8} textAnchor="middle" className="fp-col-total">{t.total}</text>
                            <g className="fp-col-teamlabel" onClick={() => onPick(t.name, attrs.filter(a => a.assignedTeamName === t.name))}>
                                <text x={cx} y={padT + plotH + 14} textAnchor="end" transform={`rotate(-26 ${cx} ${padT + plotH + 14})`}>{short}</text>
                                <title>{t.name}</title>
                            </g>
                        </g>
                    );
                })}
                <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} className="fp-col-axis" />
            </svg>
        </div>
    );
}

// ─── One attribute's full journey: named steps + handoff log ──────────────────
function Journey({model, attr}) {
    const stages = pathStages(model, attr);
    const curIdx = stages.findIndex(s => s.code === attr.currentCode);

    const events = useMemo(
        () => model.handshakes.filter(h => h.attribute === attr.attributeId).slice().reverse(),
        [model.handshakes, attr.attributeId],
    );
    const returns = events.filter(e => /return/i.test(e.action)).length;
    const cycles = events.reduce((m, e) => Math.max(m, Number(e.cycleNumber) || 1), 1);

    return (
        <div className="fp-journey">
            <div className="fp-stepper" role="img" aria-label={`Journey: step ${curIdx + 1} of ${stages.length}`}>
                {stages.map((s, i) => {
                    const state = attr.isDelivered || i < curIdx ? 'done' : i === curIdx ? 'current' : 'todo';
                    const c = PHASE_COLORS[s.phaseGroup] || '#94a3b8';
                    return (
                        <div className={`fp-step ${state}`} key={s.code} style={{'--step': c}} title={`${s.name} · ${s.phaseGroup} phase`}>
                            {i > 0 && <span className="fp-step-link" />}
                            <span className="fp-step-dot">{state === 'done' ? '✓' : state === 'current' ? '●' : ''}</span>
                            <span className="fp-step-name">{stageLabel(s.name)}</span>
                        </div>
                    );
                })}
                <div className={`fp-step ${attr.isDelivered ? 'done' : 'todo'} fp-step-finish`} title="Delivered">
                    <span className="fp-step-link" />
                    <span className="fp-step-dot">🏁</span>
                    <span className="fp-step-name">Delivered</span>
                </div>
            </div>

            <div className="fp-journey-sub">
                Journey log
                <span className="fp-muted fp-small"> · {events.length} event{events.length === 1 ? '' : 's'} · {returns} return{returns === 1 ? '' : 's'} · cycle {cycles}</span>
            </div>
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

// ─── A feature's attributes, each with its position on the journey ────────────
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
                <StatusChip status={attr.status} />
            </div>
            {expanded && <Journey model={model} attr={attr} />}
        </li>
    );
}

export default function Traceability({model}) {
    const {attrs, featureOrder} = model;
    const drill = useDrill();
    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    const featureColorOf = useMemo(() => f => {
        const i = featureOrder.indexOf(f);
        return i >= 0 && i < FEATURE_COLORS.length ? FEATURE_COLORS[i] : OTHER_COLOR;
    }, [featureOrder]);

    const featureNames = useMemo(() => {
        const withAttrs = new Set(attrs.map(a => a.featureName).filter(Boolean));
        return featureOrder.filter(f => withAttrs.has(f));
    }, [attrs, featureOrder]);

    const [feature, setFeature] = useState(featureNames[0] || '');
    const featAttrs = useMemo(() => attrsOf(feature), [attrsOf, feature]);
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="fp-mode">
            <div className="fp-section-title">Work by team — attributes stacked by feature</div>
            <div className="fp-panel fp-panel-roomy">
                <div className="fp-legend fp-legend-top">
                    {featureNames.map(f => (
                        <span key={f} className="clickable" onClick={() => drill.openAttrs(f, attrsOf(f))}>
                            <i style={{background: featureColorOf(f)}} />{f}
                        </span>
                    ))}
                </div>
                <TeamColumns model={model} featureColorOf={featureColorOf} onPick={(title, items) => drill.openAttrs(title, items)} />
                <div className="fp-panel-hint">Column height = attributes a team currently owns; segments = features. Click a segment, team or legend entry for the list, then any row to open the record.</div>
            </div>

            <div className="fp-section-title">Attribute traceability — where each attribute is on its journey</div>
            <div className="fp-panel fp-panel-roomy">
                <div className="fp-teambar">
                    <label>Feature
                        <select value={feature} onChange={e => { setFeature(e.target.value); setExpandedId(null); }}>
                            {featureNames.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </label>
                    <div className="fp-wf-hint">All of this feature’s attributes, each on its <b>own</b> path (gateway and sourcing branches included). Expand a row for the full journey and handoff log.</div>
                </div>
                {featAttrs.length === 0 ? (
                    <div className="fp-muted">No attributes on this feature.</div>
                ) : (
                    <ul className="fp-arows">
                        {featAttrs.map(a => (
                            <AttributeRow
                                key={a.id}
                                model={model}
                                attr={a}
                                expanded={expandedId === a.id}
                                onToggle={() => setExpandedId(x => (x === a.id ? null : a.id))}
                            />
                        ))}
                    </ul>
                )}
            </div>

            <DrillDrawer drill={drill} attrsOf={attrsOf} />
        </div>
    );
}
