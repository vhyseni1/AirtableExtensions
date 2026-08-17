import {expandRecord} from '@airtable/blocks/interface/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {HealthDot} from './components';
import {useDrill, DrillDrawer} from './drill';

// UBS-leaning palette: red lead accent, then deep neutrals/jewels for initiatives.
const INITIATIVE_COLORS = ['#E60000', '#14274E', '#0F766E', '#6D28D9', '#B45309', '#0E7490'];

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}));
const fmtShort = ms => new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit'});

// ── Count-up number ───────────────────────────────────────────────────────────
function useCountUp(target, ms = 850) {
    const [v, setV] = useState(0);
    useEffect(() => {
        let raf;
        const start = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - start) / ms);
            setV(Math.round(target * (t * (2 - t)))); // easeOutQuad
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms]);
    return v;
}
function CountUp({value, suffix}) {
    return <>{useCountUp(value)}{suffix || ''}</>;
}

// ── Animated SVG progress donut ────────────────────────────────────────────────
function Donut({pct, size = 132, stroke = 13, color = '#E60000', onClick, children}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const [p, setP] = useState(0);
    useEffect(() => {
        const id = requestAnimationFrame(() => setP(pct));
        return () => cancelAnimationFrame(id);
    }, [pct]);
    const off = c * (1 - Math.max(0, Math.min(100, p)) / 100);
    return (
        <div className={`fp-donut${onClick ? ' clickable' : ''}`} style={{width: size, height: size}} onClick={onClick}>
            <svg width={size} height={size} aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDF0F4" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{transition: 'stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)'}}
                />
            </svg>
            <div className="fp-donut-center">{children}</div>
        </div>
    );
}

function PhaseStrip({phase, mounted}) {
    const total = PHASE_GROUPS.reduce((s, p) => s + (phase[p] || 0), 0) || 1;
    return (
        <div className="fp-phasestrip" role="img" aria-label="Phase distribution">
            {PHASE_GROUPS.map(p => {
                const w = ((phase[p] || 0) / total) * 100;
                return w > 0 ? <span key={p} title={`${p}: ${phase[p]}`} style={{width: mounted ? `${w}%` : 0, background: PHASE_COLORS[p]}} /> : null;
            })}
        </div>
    );
}

// ── Delivery timeline — markers on a line, labels stacked in clean lanes ───────
const TL_ROW = 66;   // lane vertical pitch — must exceed the card height
const CARD_W = 178;  // fixed card width — used for exact horizontal packing
function Timeline({features, colorOf, onPick, onDrill}) {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    // A single click drills in when we can (onDrill), otherwise it opens the
    // record/attribute drawer (onPick). No double-click — one click, one action.
    const onFlag = f => { if (onDrill) onDrill(f); else onPick(f); };
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width));
        ro.observe(el);
        setW(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    const dated = features.filter(f => f.goLiveMs != null).sort((a, b) => a.goLiveMs - b.goLiveMs);
    const now = Date.now();
    if (dated.length === 0) return <div className="fp-muted">No target go-live dates set.</div>;

    const min = Math.min(now, dated[0].goLiveMs);
    const max = Math.max(now, dated[dated.length - 1].goLiveMs);
    const pad = (max - min) * 0.07 || 86400000 * 20;
    const start = min - pad;
    const end = max + pad;
    const span = end - start || 1;
    const pct = ms => ((ms - start) / span) * 100;

    // Greedy lane packing: a label drops to the next lane whenever its fixed-width
    // card would collide with the last one placed in that lane. Same-lane cards are
    // therefore horizontally clear, and lanes are TL_ROW apart vertically — so no
    // card can overlap another.
    const W = w || 900;
    const laneRight = [];
    const placed = dated.map(f => {
        const cx = (pct(f.goLiveMs) / 100) * W;
        const left = cx - CARD_W / 2;
        let lane = 0;
        while (lane < laneRight.length && left < laneRight[lane] + 14) lane++;
        laneRight[lane] = cx + CARD_W / 2;
        return {f, lane};
    });
    const rows = Math.max(1, laneRight.length);

    const ticks = [];
    const d = new Date(start);
    d.setDate(1); d.setHours(0, 0, 0, 0);
    while (d.getTime() <= end) { ticks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }

    return (
        <div className="fp-timeline" ref={ref} style={{minHeight: 92 + rows * TL_ROW}}>
            <div className="fp-timeline-track">
                {ticks.map(t => (
                    <div key={t} className="fp-tl-tick" style={{left: `${pct(t)}%`}}>
                        <span>{new Date(t).toLocaleDateString('en-GB', {month: 'short', year: '2-digit'})}</span>
                    </div>
                ))}
                <div className="fp-tl-today" style={{left: `${pct(now)}%`, bottom: -(rows * TL_ROW + 14)}}><span>Today</span></div>
                {placed.map(({f, lane}) => (
                    <div
                        key={f.id}
                        className="fp-tl-flag"
                        style={{left: `${pct(f.goLiveMs)}%`}}
                        title={`${f.name} · ${f.initiative} · go-live ${fmtDate(f.goLiveMs)} · ${f.pct}%${onDrill ? '\n(click to drill in)' : ''}`}
                        onClick={() => onFlag(f)}
                    >
                        <span className="fp-tl-marker" style={{borderColor: colorOf(f.initiative)}} />
                        <span className="fp-tl-connector" style={{height: lane * TL_ROW + 10}} />
                        <span className="fp-tl-label" style={{borderLeftColor: colorOf(f.initiative)}}>
                            <span className="fp-tl-line"><b>{fmtShort(f.goLiveMs)}</b><span className="fp-tl-pct">{f.pct}%</span></span>
                            <span className="fp-tl-feat">{f.name}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Entity card — aggregates across the entity; lists its initiatives (capped).
const CARD_CAP = 10;
function EntityCard({e, colorOf, mounted, model, openInitiatives, openFeatures}) {
    const [showAll, setShowAll] = useState(false);
    const feats = e.initiatives.flatMap(i => i.features);
    const phase = {};
    PHASE_GROUPS.forEach(p => (phase[p] = 0));
    feats.forEach(f => {
        const bf = model.byFeature[f.name];
        if (bf) PHASE_GROUPS.forEach(p => (phase[p] += bf.phase[p] || 0));
    });
    const onTrack = feats.filter(f => f.health === 'on-track');
    const atRisk = feats.filter(f => f.health === 'at-risk' || f.health === 'blocked');
    const delivered = feats.filter(f => f.health === 'delivered');
    const goLives = feats.map(f => f.goLiveMs).filter(x => x != null);
    const c = colorOf(e.name);
    const shown = showAll ? e.initiatives : e.initiatives.slice(0, CARD_CAP);

    return (
        <div className="fp-initcard" style={{borderTopColor: c}}>
            <div className="fp-initcard-head">
                <div className="clickable" onClick={() => openInitiatives(e.name, e.initiatives)}>
                    <div className="fp-initcard-kicker">Entity</div>
                    <div className="fp-initcard-name">{e.name}</div>
                    <div className="fp-initcard-meta">{e.initiatives.length} initiative{e.initiatives.length === 1 ? '' : 's'} · {e.featureCount} features · {e.attrCount} attributes</div>
                </div>
                <Donut pct={e.pct} size={84} stroke={10} color={c} onClick={() => openInitiatives(e.name, e.initiatives)}>
                    <div className="fp-donut-pct sm"><CountUp value={e.pct} suffix="%" /></div>
                </Donut>
            </div>

            <div className="fp-initcard-rag">
                <span className="clickable" onClick={() => openFeatures(`${e.name} · on track`, onTrack)}><HealthDot health="on-track" /> {onTrack.length} on track</span>
                <span className="clickable" onClick={() => openFeatures(`${e.name} · at risk`, atRisk)}><HealthDot health="at-risk" /> {atRisk.length} at risk</span>
                <span className="clickable" onClick={() => openFeatures(`${e.name} · delivered`, delivered)}><HealthDot health="delivered" /> {delivered.length} done</span>
            </div>

            <PhaseStrip phase={phase} mounted={mounted} />
            <div className="fp-initcard-next">Next go-live: <b>{fmtDate(goLives.length ? Math.min(...goLives) : null)}</b></div>

            <ul className="fp-initcard-feats">
                {shown.map(it => (
                    <li key={it.name} className="clickable" onClick={() => openFeatures(it.name, it.features)} title="See features">
                        <span className="fp-feat-dot" style={{background: c}} />
                        <span className="fp-feat-name">{it.name}</span>
                        <span className="fp-feat-bar"><i style={{width: mounted ? `${it.pct}%` : 0, background: c}} /></span>
                        <span className="fp-feat-pct">{it.pct}%</span>
                    </li>
                ))}
            </ul>
            {e.initiatives.length > CARD_CAP && (
                <button type="button" className="fp-showmore" onClick={() => setShowAll(s => !s)}>
                    {showAll ? 'Show less' : `Show ${e.initiatives.length - CARD_CAP} more`}
                </button>
            )}
        </div>
    );
}

export default function Executive({model}) {
    const {byInitiative, byEntity, features, kpis, phaseCounts, attrs} = model;
    const [mounted, setMounted] = useState(false);
    const [tlLevel, setTlLevel] = useState('entity'); // starting level: 'entity' | 'initiative' | 'feature'
    const [tlPath, setTlPath] = useState([]); // drill stack: [{kind:'initiatives'|'features', name, items}]
    const drill = useDrill();
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const colorIndex = {};
    byEntity.forEach((e, i) => (colorIndex[e.name] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]));
    byInitiative.forEach((it, i) => { if (!(it.name in colorIndex)) colorIndex[it.name] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]; });
    Array.from(new Set(features.map(f => f.milestone || 'No milestone'))).forEach((m, i) => { if (!(m in colorIndex)) colorIndex[m] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]; });
    const colorOf = name => colorIndex[name] || '#64748B';

    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    // Drill helpers (shared drawer)
    const openInitiatives = (title, list) => drill.openInitiatives(title, list);
    const openFeatures = (title, list) => drill.openFeatures(title, list);
    const openAttrs = (title, list) => drill.openAttrs(title, list);
    const pushFeatureAttrs = f => drill.pushAttrs(`${f.name} · attributes`, attrsOf(f.name));

    // ── Hierarchical timeline: Entity → Initiative → Milestone → Feature →
    // Attribute. Every level is the SAME timeline widget, so one click always
    // drills one level down. Entity/initiative/milestone boxes sit on the axis
    // by a representative date; the attribute level places each attribute by its
    // Due Date and opens the record on click.
    const boxDate = feats => {
        const g = feats.map(f => f.goLiveMs).filter(x => x != null);
        return g.length ? Math.max(...g) : null;
    };
    const healthOf = feats => {
        const anyRisk = feats.some(f => f.health === 'at-risk' || f.health === 'blocked');
        const allDone = feats.length > 0 && feats.every(f => f.health === 'delivered');
        return allDone ? 'delivered' : anyRisk ? 'at-risk' : 'on-track';
    };
    const wmean = feats => {
        const w = feats.reduce((s, f) => s + (f.total || 0), 0);
        if (w) return Math.round(feats.reduce((s, f) => s + (f.pct || 0) * (f.total || 0), 0) / w);
        return feats.length ? Math.round(feats.reduce((s, f) => s + (f.pct || 0), 0) / feats.length) : 0;
    };
    const parseMs = s => { const t = s ? Date.parse(s) : NaN; return Number.isNaN(t) ? null : t; };
    // Attributes of a feature → timeline items placed by DUE DATE.
    const attrItemsOf = featureName => attrsOf(featureName).map(a => ({
        id: a.id, name: a.businessName || a.attributeId, initiative: featureName,
        milestone: '', goLiveMs: parseMs(a.dueDate), pct: Math.round((a.maturity || 0) * 100),
        health: a.isDelivered ? 'delivered' : a.isBlocked ? 'blocked' : 'on-track', record: a.record,
    }));
    // Group a set of features into Milestone boxes (from the feature's Milestone;
    // dated by the Milestone Due Date, falling back to latest feature go-live).
    const milestonesOf = feats => {
        const groups = {};
        feats.forEach(f => { const k = f.milestone || 'No milestone'; (groups[k] = groups[k] || []).push(f); });
        return Object.keys(groups).map(name => {
            const fs = groups[name];
            const dues = fs.map(f => parseMs(f.milestoneDue)).filter(x => x != null);
            return {
                id: `m-${name}`, name, initiative: name,
                features: fs, pct: wmean(fs),
                goLiveMs: dues.length ? Math.max(...dues) : boxDate(fs),
                health: healthOf(fs),
            };
        });
    };
    // Turn an initiative ({name, features, pct}) into a timeline box.
    const toInitBox = it => ({
        id: `i-${it.name}`, name: it.name, initiative: it.name,
        features: it.features, pct: it.pct, goLiveMs: boxDate(it.features), health: healthOf(it.features),
    });
    // Entity boxes (top level) — carrying raw initiatives for the next drill.
    const entityTimeline = byEntity.map(e => ({
        id: `e-${e.name}`, name: e.name, initiative: e.name,
        features: e.features, pct: e.pct, goLiveMs: boxDate(e.features), health: healthOf(e.features),
        initiatives: e.initiatives,
    }));
    const initTimeline = byInitiative.map(toInitBox);
    const milestoneTimeline = milestonesOf(features);

    // Drill actions (push onto the stack): entity → initiatives → milestones →
    // features → attributes.
    const drillEntity = e => setTlPath(p => [...p, {kind: 'initiatives', name: e.name, items: e.initiatives.map(toInitBox)}]);
    const drillInitiative = it => setTlPath(p => [...p, {kind: 'milestones', name: it.name, items: milestonesOf(it.features)}]);
    const drillMilestone = m => setTlPath(p => [...p, {kind: 'features', name: m.name, items: m.features}]);
    const drillFeature = f => setTlPath(p => [...p, {kind: 'attrs', name: f.name, items: attrItemsOf(f.name)}]);
    const tlFrame = tlPath.length ? tlPath[tlPath.length - 1] : null;

    const onTrack = features.filter(f => f.health === 'on-track');
    const needAttn = features.filter(f => f.health === 'at-risk' || f.health === 'blocked');
    const delivered = features.filter(f => f.health === 'delivered');
    const now = Date.now();
    const horizon = now + 1000 * 60 * 60 * 24 * 90;
    const goLiveSoon = features.filter(f => f.goLiveMs != null && f.goLiveMs >= now && f.goLiveMs <= horizon && f.pct < 100);

    const blockedAttrs = attrs.filter(a => a.isBlocked);
    const overdueAttrs = attrs.filter(a => !a.isBlocked && a.dueDate && Date.parse(a.dueDate) < now && !a.isDelivered);
    const returnedHandshakes = model.handshakes.filter(h => /return/i.test(h.action));

    // ── Requires attention — typed across features, attributes & handshakes ──
    const attentionItems = [];
    needAttn.forEach(f => attentionItems.push({
        key: `f-${f.id}`, type: 'Feature', health: f.health,
        title: f.name,
        sub: `${f.blocked ? `${f.blocked} blocked · ` : ''}${f.pct}% mature · ${f.initiative}${f.goLiveMs != null && f.goLiveMs < now && f.pct < 100 ? ' · past go-live' : ''}`,
        onClick: () => pushFeatureAttrs(f),
    }));
    blockedAttrs.forEach(a => attentionItems.push({
        key: `a-${a.id}`, type: 'Attribute', health: 'blocked',
        title: a.businessName || a.attributeId,
        sub: `${a.blockedReason || 'Blocked'} · ${a.currentStageName} · ${a.featureName}`,
        onClick: () => expandRecord(a.record),
    }));
    overdueAttrs.forEach(a => attentionItems.push({
        key: `o-${a.id}`, type: 'Attribute', health: 'at-risk',
        title: a.businessName || a.attributeId,
        sub: `Overdue — due ${a.dueDate} · ${a.currentStageName} · ${a.featureName}`,
        onClick: () => expandRecord(a.record),
    }));
    returnedHandshakes.slice(0, 4).forEach(h => attentionItems.push({
        key: `h-${h.id}`, type: 'Handshake', health: 'at-risk',
        title: `${h.feature} — returned for rework`,
        sub: `${h.stage} · ${h.fromTeam} → ${h.toTeam} · ${h.timestamp}`,
        onClick: () => expandRecord(h.record),
    }));
    const attnCounts = {
        Feature: attentionItems.filter(i => i.type === 'Feature').length,
        Attribute: attentionItems.filter(i => i.type === 'Attribute').length,
        Handshake: attentionItems.filter(i => i.type === 'Handshake').length,
    };

    return (
        <div className="fp-exec">
            {/* Hero */}
            <section className="fp-hero">
                <div className="fp-hero-headline">
                    <div className="fp-eyebrow">UBS Switzerland · ampliFI</div>
                    <h1>Program Overview</h1>
                    <p className="fp-hero-sub">Executive view across initiatives, backlog features and attributes.</p>
                    <div className="fp-hero-stats">
                        <button type="button" onClick={() => openFeatures('On track', onTrack)}><b><CountUp value={onTrack.length} /></b><span>On track</span></button>
                        <button type="button" onClick={() => openFeatures('Need attention', needAttn)}><b style={{color: '#ff9d57'}}><CountUp value={needAttn.length} /></b><span>Need attention</span></button>
                        <button type="button" onClick={() => openFeatures('Delivered', delivered)}><b style={{color: '#6fd1ff'}}><CountUp value={delivered.length} /></b><span>Delivered</span></button>
                        <button type="button" onClick={() => openFeatures('Go-live ≤ 90 days', goLiveSoon)}><b><CountUp value={goLiveSoon.length} /></b><span>Go-live ≤ 90 days</span></button>
                    </div>
                </div>
                <div className="fp-hero-gauge">
                    <Donut pct={kpis.overallPct} size={156} stroke={16} onClick={() => openFeatures('All features', features)}>
                        <div className="fp-donut-pct"><CountUp value={kpis.overallPct} suffix="%" /></div>
                        <div className="fp-donut-cap">Portfolio<br />maturity</div>
                    </Donut>
                </div>
            </section>

            {/* Entity cards */}
            <div className="fp-section-title">By entity</div>
            <div className="fp-initgrid">
                {byEntity.map(e => (
                    <EntityCard key={e.name} e={e} colorOf={colorOf} mounted={mounted} model={model} openInitiatives={openInitiatives} openFeatures={openFeatures} />
                ))}
            </div>

            {/* Timeline */}
            <div className="fp-section-title">
                Delivery timeline — target go-lives
                {tlPath.length ? (
                    <>
                        <button type="button" className="fp-tl-back" onClick={() => setTlPath(p => p.slice(0, -1))}>← Back</button>
                        {tlPath.map((fr, i) => (
                            <span key={`${fr.name}-${i}`} className="fp-tl-crumb"><i style={{background: colorOf(fr.name)}} />{fr.name}</span>
                        ))}
                    </>
                ) : (
                    <span className="fp-seg">
                        <button type="button" className={tlLevel === 'entity' ? 'on' : ''} onClick={() => { setTlLevel('entity'); setTlPath([]); }}>By entity</button>
                        <button type="button" className={tlLevel === 'initiative' ? 'on' : ''} onClick={() => { setTlLevel('initiative'); setTlPath([]); }}>By initiative</button>
                        <button type="button" className={tlLevel === 'milestone' ? 'on' : ''} onClick={() => { setTlLevel('milestone'); setTlPath([]); }}>By milestone</button>
                        <button type="button" className={tlLevel === 'feature' ? 'on' : ''} onClick={() => { setTlLevel('feature'); setTlPath([]); }}>By feature</button>
                    </span>
                )}
            </div>
            <div className="fp-panel">
                <div className="fp-tl-hint">
                    {tlFrame
                        ? (tlFrame.kind === 'initiatives'
                            ? 'Click an initiative to drill into its milestones · ← Back'
                            : tlFrame.kind === 'milestones'
                                ? 'Click a milestone to drill into its features · ← Back'
                                : tlFrame.kind === 'features'
                                    ? 'Click a feature to drill into its attributes (by due date) · ← Back'
                                    : 'Click an attribute to open its record · ← Back')
                        : tlLevel === 'entity'
                            ? 'Click an entity to drill into its initiatives'
                            : tlLevel === 'initiative'
                                ? 'Click an initiative to drill into its milestones'
                                : tlLevel === 'milestone'
                                    ? 'Click a milestone to drill into its features'
                                    : 'Click a feature to drill into its attributes'}
                </div>
                {tlFrame ? (
                    tlFrame.kind === 'initiatives' ? (
                        <Timeline features={tlFrame.items} colorOf={colorOf} onDrill={drillInitiative} onPick={it => openFeatures(`${it.name} · features`, it.features)} />
                    ) : tlFrame.kind === 'milestones' ? (
                        <Timeline features={tlFrame.items} colorOf={colorOf} onDrill={drillMilestone} onPick={m => openFeatures(`${m.name} · features`, m.features)} />
                    ) : tlFrame.kind === 'features' ? (
                        <Timeline features={tlFrame.items} colorOf={colorOf} onDrill={drillFeature} onPick={pushFeatureAttrs} />
                    ) : (
                        <Timeline features={tlFrame.items} colorOf={colorOf} onPick={it => expandRecord(it.record)} />
                    )
                ) : tlLevel === 'entity' ? (
                    <Timeline features={entityTimeline} colorOf={colorOf} onDrill={drillEntity} onPick={e => openInitiatives(e.name, e.initiatives)} />
                ) : tlLevel === 'initiative' ? (
                    <Timeline features={initTimeline} colorOf={colorOf} onDrill={drillInitiative} onPick={it => openFeatures(`${it.name} · features`, it.features)} />
                ) : tlLevel === 'milestone' ? (
                    <Timeline features={milestoneTimeline} colorOf={colorOf} onDrill={drillMilestone} onPick={m => openFeatures(`${m.name} · features`, m.features)} />
                ) : (
                    <Timeline features={features} colorOf={colorOf} onDrill={drillFeature} onPick={pushFeatureAttrs} />
                )}
                <div className="fp-legend">
                    {(tlPath.length ? [] : tlLevel === 'entity' ? entityTimeline : tlLevel === 'initiative' ? byInitiative : tlLevel === 'milestone' ? milestoneTimeline : []).map(x => (
                        <span key={x.name} className="clickable" onClick={() => openFeatures(x.name, x.features)}><i style={{background: colorOf(x.name)}} />{x.name}</span>
                    ))}
                </div>
            </div>

            {/* Attention + phase distribution */}
            <div className="fp-exec-2col">
                <div className="fp-panel fp-panel-roomy">
                    <div className="fp-panel-title">Requires attention</div>
                    {attentionItems.length === 0 ? (
                        <div className="fp-muted">Nothing blocked, overdue or returned. 🎉</div>
                    ) : (
                        <>
                            <div className="fp-attn-summary">
                                {attnCounts.Feature > 0 && <span><b>{attnCounts.Feature}</b> feature{attnCounts.Feature === 1 ? '' : 's'}</span>}
                                {attnCounts.Attribute > 0 && <span><b>{attnCounts.Attribute}</b> attribute{attnCounts.Attribute === 1 ? '' : 's'}</span>}
                                {attnCounts.Handshake > 0 && <span><b>{attnCounts.Handshake}</b> handoff{attnCounts.Handshake === 1 ? '' : 's'}</span>}
                            </div>
                            <ul className="fp-attention">
                                {attentionItems.slice(0, 8).map(item => (
                                    <li key={item.key} className="clickable" onClick={item.onClick} title="Open">
                                        <HealthDot health={item.health} />
                                        <div className="fp-att-main">
                                            <div className="fp-att-title">{item.title}</div>
                                            <div className="fp-att-sub">{item.sub}</div>
                                        </div>
                                        <span className={`fp-att-type t-${item.type.toLowerCase()}`}>{item.type}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

                <div className="fp-panel fp-panel-roomy">
                    <div className="fp-panel-title">Where the work sits</div>
                    <ul className="fp-phasebars">
                        {PHASE_GROUPS.map(p => {
                            const max = Math.max(1, ...PHASE_GROUPS.map(q => phaseCounts[q] || 0));
                            return (
                                <li key={p} className="clickable" onClick={() => openAttrs(`${p} phase`, attrs.filter(a => a.phase === p))} title="See attributes">
                                    <span className="fp-pb-label">{p}</span>
                                    <span className="fp-pb-track"><i style={{width: mounted ? `${((phaseCounts[p] || 0) / max) * 100}%` : 0, background: PHASE_COLORS[p]}} /></span>
                                    <span className="fp-pb-val">{phaseCounts[p] || 0}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            <DrillDrawer drill={drill} attrsOf={attrsOf} colorOf={colorOf} />
        </div>
    );
}
