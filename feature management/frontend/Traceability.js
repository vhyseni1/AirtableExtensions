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

// ─── Multi-node Sankey: attributes flowing team → team along their paths ──────
// x = teams (in pipeline order), node height & ribbon thickness = number of
// attributes, ribbons colored by feature. Hover a feature (ribbon or legend)
// to isolate its flow; click a ribbon/node for the list → records.
function TeamFlow({model, featureColorOf, hoverFeature, setHoverFeature, onPick}) {
    const [ref, w] = useMeasuredWidth();
    const {attrs, featureOrder} = model;

    const {teams, links} = useMemo(() => {
        const teamOf = code => (model.stagesByCode[code] ? model.stagesByCode[code].responsibleTeamName : '');
        const teamFirstCode = {};
        const nodeItems = {};
        const linkMap = new Map();

        attrs.forEach(a => {
            const codes = pathStages(model, a).map(s => s.code);
            const seq = [];
            codes.forEach(c => {
                const t = teamOf(c);
                if (t && seq[seq.length - 1] !== t) seq.push(t);
                if (t && !(t in teamFirstCode)) teamFirstCode[t] = CODE_ORDER.indexOf(c);
                if (t && CODE_ORDER.indexOf(c) < teamFirstCode[t]) teamFirstCode[t] = CODE_ORDER.indexOf(c);
            });
            seq.forEach(t => { (nodeItems[t] = nodeItems[t] || []).push(a); });
            const f = a.featureName || 'Unassigned';
            for (let i = 0; i + 1 < seq.length; i++) {
                const key = `${seq[i]}→${seq[i + 1]}|${f}`;
                if (!linkMap.has(key)) linkMap.set(key, {from: seq[i], to: seq[i + 1], feature: f, items: []});
                linkMap.get(key).items.push(a);
            }
        });

        const teamList = Object.keys(nodeItems)
            .sort((a, b) => (teamFirstCode[a] ?? 99) - (teamFirstCode[b] ?? 99))
            .map(name => ({name, items: nodeItems[name]}));
        const colOf = {};
        teamList.forEach((t, i) => (colOf[t.name] = i));
        const featIdx = f => { const i = featureOrder.indexOf(f); return i < 0 ? 999 : i; };
        const linkList = [...linkMap.values()].sort(
            (a, b) => colOf[a.from] - colOf[b.from] || colOf[a.to] - colOf[b.to] || featIdx(a.feature) - featIdx(b.feature),
        );
        return {teams: teamList, links: linkList};
    }, [attrs, model, featureOrder]);

    if (!teams.length) return <div className="fp-muted">Nothing to draw yet.</div>;

    const W = Math.max(w || 960, 640);
    const H = 400;
    const padT = 46;
    const padB = 16;
    const plotH = H - padT - padB;
    const nodeW = 14;
    const colX = i => 20 + (i * (W - 40 - nodeW)) / Math.max(teams.length - 1, 1);
    const colOf = {};
    teams.forEach((t, i) => (colOf[t.name] = i));

    const maxVal = Math.max(...teams.map(t => t.items.length));
    const scale = (plotH * 0.78) / maxVal;

    // Node geometry: vertically centered; in/out flows stacked from the top,
    // the smaller side centered within the node.
    const node = {};
    teams.forEach(t => {
        const inLinks = links.filter(l => l.to === t.name);
        const outLinks = links.filter(l => l.from === t.name);
        const inV = inLinks.reduce((s, l) => s + l.items.length, 0);
        const outV = outLinks.reduce((s, l) => s + l.items.length, 0);
        const h = Math.max(t.items.length, 1) * scale;
        const y = padT + (plotH - h) / 2;
        node[t.name] = {y, h, inOff: y + (h - inV * scale) / 2, outOff: y + (h - outV * scale) / 2};
    });

    const ribbons = links.map(l => {
        const s = node[l.from];
        const t = node[l.to];
        const lh = l.items.length * scale;
        const sy = s.outOff; s.outOff += lh;
        const ty = t.inOff; t.inOff += lh;
        const x0 = colX(colOf[l.from]) + nodeW;
        const x1 = colX(colOf[l.to]);
        const mx = (x0 + x1) / 2;
        const d = `M ${x0} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${x1} ${ty}`
            + ` L ${x1} ${ty + lh} C ${mx} ${ty + lh}, ${mx} ${sy + lh}, ${x0} ${sy + lh} Z`;
        return {...l, d};
    });

    const faded = f => hoverFeature && hoverFeature !== f;

    return (
        <div className="fp-flow" ref={ref}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                {ribbons.map(r => (
                    <path
                        key={`${r.from}|${r.to}|${r.feature}`}
                        d={r.d}
                        className="fp-flow-link"
                        style={{fill: featureColorOf(r.feature), opacity: hoverFeature === r.feature ? 0.78 : faded(r.feature) ? 0.08 : 0.42}}
                        onMouseEnter={() => setHoverFeature(r.feature)}
                        onMouseLeave={() => setHoverFeature(null)}
                        onClick={() => onPick(`${r.feature}: ${r.from} → ${r.to}`, r.items)}
                    >
                        <title>{`${r.feature} · ${r.from} → ${r.to} · ${r.items.length} attribute${r.items.length === 1 ? '' : 's'}`}</title>
                    </path>
                ))}
                {teams.map((t, i) => {
                    const n = node[t.name];
                    const short = t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name;
                    return (
                        <g key={t.name} className="fp-flow-node" onClick={() => onPick(t.name, attrs.filter(a => a.assignedTeamName === t.name))}>
                            <rect x={colX(i)} y={n.y} width={nodeW} height={n.h} rx={4} />
                            <text x={colX(i) + nodeW / 2} y={n.y - 22} textAnchor="middle" className="fp-flow-name" transform={`rotate(-14 ${colX(i) + nodeW / 2} ${n.y - 22})`}>{short}</text>
                            <text x={colX(i) + nodeW / 2} y={n.y - 8} textAnchor="middle" className="fp-flow-count">{t.items.length}</text>
                            <title>{`${t.name} · ${t.items.length} attributes pass through`}</title>
                        </g>
                    );
                })}
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
            <div className="fp-section-title">Flow of work — how attributes travel across teams</div>
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
                <TeamFlow
                    model={model}
                    featureColorOf={featureColorOf}
                    hoverFeature={hoverFeature}
                    setHoverFeature={setHoverFeature}
                    onPick={(title, items) => drill.openAttrs(title, items)}
                />
                <div className="fp-panel-hint">Each ribbon is a feature’s attributes handed from one team to the next along their delivery path — thickness = number of attributes. Hover a feature to isolate its flow; click a ribbon or team for the list, then any row to open the record.</div>
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
