import {expandRecord} from '@airtable/blocks/interface/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {HealthDot} from './components';
import {useDrill, DrillDrawer} from './drill';
import {filterModel} from './data';
import FilterBar, {EMPTY_FILTER} from './FilterBar';

// UBS-leaning palette: red lead accent, then deep neutrals/jewels for initiatives.
const INITIATIVE_COLORS = ['#E60000', '#14274E', '#0F766E', '#6D28D9', '#B45309', '#0E7490'];

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'}));
const fmtShort = ms => new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC'});

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

// ── Feature swimlane — one lane per Milestone; feature cards placed on a shared
// time axis by the feature's Due Date. Each card shows the feature name, its
// attribute count and maturity; clicking a card opens the side panel. Each lane
// shows the milestone span: earliest feature date → the milestone's Due Date.
const SL_GUTTER = 176; // milestone label column width
const SL_CARD_W = 176; // feature card width (for horizontal packing)
const SL_ROW = 40;     // vertical pitch of packed cards inside a lane
const SL_PAD = 16;     // lane padding
function FeatureSwimlane({items, onPick}) {
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

    if (!items.length) return <div className="fp-muted">No features here.</div>;
    const dated = items.filter(f => f.goLiveMs != null);
    if (dated.length === 0) return <div className="fp-muted">No due dates set on these features.</div>;

    // Group features into milestone lanes; order lanes by earliest feature date.
    const groups = {};
    items.forEach(f => { const k = f.milestone || 'No milestone'; (groups[k] = groups[k] || []).push(f); });
    const laneColor = i => INITIATIVE_COLORS[i % INITIATIVE_COLORS.length];
    const laneNames = Object.keys(groups).sort((a, b) => {
        if (a === 'No milestone') return 1;
        if (b === 'No milestone') return -1;
        const da = Math.min(...groups[a].map(f => (f.goLiveMs == null ? Infinity : f.goLiveMs)));
        const db = Math.min(...groups[b].map(f => (f.goLiveMs == null ? Infinity : f.goLiveMs)));
        return da - db;
    });

    const now = Date.now();
    const allMs = dated.map(f => f.goLiveMs);
    const min = Math.min(now, ...allMs);
    const max = Math.max(now, ...allMs);
    const pad = (max - min) * 0.07 || 86400000 * 20;
    const start = min - pad, end = max + pad, span = end - start || 1;
    const W = w || 900;
    const trackW = Math.max(240, W - SL_GUTTER);
    const xOf = ms => SL_GUTTER + ((ms - start) / span) * trackW;

    const ticks = [];
    const d = new Date(start);
    d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
    while (d.getTime() <= end) { ticks.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }

    const lanes = laneNames.map((name, li) => {
        const feats = groups[name].filter(f => f.goLiveMs != null).sort((a, b) => a.goLiveMs - b.goLiveMs);
        const subRight = [];
        const placed = feats.map(f => {
            let x = xOf(f.goLiveMs);
            if (x + SL_CARD_W > SL_GUTTER + trackW) x = SL_GUTTER + trackW - SL_CARD_W;
            if (x < SL_GUTTER) x = SL_GUTTER;
            let row = 0;
            while (row < subRight.length && x < subRight[row] + 8) row++;
            subRight[row] = x + SL_CARD_W;
            return {f, x, row};
        });
        const rows = Math.max(1, subRight.length);
        const startMs = feats.length ? feats[0].goLiveMs : null; // milestone starts at the earliest feature
        const dueList = groups[name].map(f => f.milestoneDueMs).filter(x => x != null);
        const dueMs = dueList.length ? Math.max(...dueList) : null;
        return {name, color: laneColor(li), placed, rows, height: rows * SL_ROW + SL_PAD, count: groups[name].length, startMs, dueMs};
    });
    let yy = 0;
    const tops = lanes.map(l => { const t = yy; yy += l.height; return t; });
    const totalH = yy;

    return (
        <div className="fp-swim" ref={ref}>
            <div className="fp-swim-axis" style={{marginLeft: SL_GUTTER}}>
                {ticks.map(t => (
                    <span key={t} className="fp-swim-tick" style={{left: `${((t - start) / span) * 100}%`}}>
                        {new Date(t).toLocaleDateString('en-GB', {month: 'short', year: '2-digit', timeZone: 'UTC'})}
                    </span>
                ))}
            </div>
            <div className="fp-swim-body" style={{height: totalH}}>
                <div className="fp-swim-today" style={{left: xOf(now)}} title="Today"><span>Today</span></div>
                {lanes.map((l, i) => (
                    <div key={l.name} className={`fp-swim-lane${i % 2 ? ' alt' : ''}`} style={{top: tops[i], height: l.height}}>
                        <div className="fp-swim-label" style={{width: SL_GUTTER, borderLeftColor: l.color}}>
                            <span className="fp-swim-mname" title={l.name}>{l.name}</span>
                            <span className="fp-swim-mcount">{l.count} feature{l.count === 1 ? '' : 's'}{l.dueMs != null ? ` · due ${fmtShort(l.dueMs)}` : ''}</span>
                        </div>
                        {/* milestone span bar: earliest feature date → milestone due date */}
                        {l.startMs != null && l.dueMs != null && l.dueMs > l.startMs && (
                            <div className="fp-swim-span" style={{left: xOf(l.startMs), width: Math.max(2, xOf(l.dueMs) - xOf(l.startMs)), background: l.color}} />
                        )}
                        {l.placed.map(({f, x, row}) => (
                            <div
                                key={f.id}
                                className="fp-swim-card clickable"
                                style={{left: x, top: row * SL_ROW + 5, width: SL_CARD_W - 10, borderLeftColor: l.color}}
                                title={`${f.name} · ${f.total} attributes · ${f.pct}% mature · due ${fmtDate(f.goLiveMs)}`}
                                onClick={() => onPick(f)}
                            >
                                <span className="fp-swim-fname">{f.name}</span>
                                <span className="fp-swim-fmeta">{f.total} attr{f.total === 1 ? '' : 's'} · {f.pct}%</span>
                                <span className="fp-swim-fbar"><i style={{width: `${f.pct}%`, background: l.color}} /></span>
                            </div>
                        ))}
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
    const [tlLevel, setTlLevel] = useState('entity'); // starting level: 'entity' | 'initiative' | 'milestone' | 'feature'
    const [tlPath, setTlPath] = useState([]); // drill stack: [{kind, name, items}]
    const [tlFilter, setTlFilter] = useState(EMPTY_FILTER); // timeline-only Entity/Initiative/Milestone/Feature filter
    const drill = useDrill();
    // A model filtered to the timeline selection — drives ONLY the timeline
    // (the rest of the page keeps the full model). Clearing the filter is a
    // no-op that returns the same model.
    const tlModel = useMemo(() => filterModel(model, tlFilter), [model, tlFilter]);
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
    // Turn an initiative ({name, features, pct}) into a timeline box.
    const toInitBox = it => ({
        id: `i-${it.name}`, name: it.name, initiative: it.name,
        features: it.features, pct: it.pct, goLiveMs: boxDate(it.features), health: healthOf(it.features),
    });
    // Entity boxes (top level), built from the FILTERED timeline model so the
    // Entity/Initiative/Milestone/Feature filter narrows every level.
    const entityTimeline = tlModel.byEntity.map(e => ({
        id: `e-${e.name}`, name: e.name, initiative: e.name,
        features: e.features, pct: e.pct, goLiveMs: boxDate(e.features), health: healthOf(e.features),
        initiatives: e.initiatives,
    }));
    const initTimeline = tlModel.byInitiative.map(toInitBox);

    // Drill actions: Entity → Initiative → Feature swimlane (lanes = milestones).
    // The feature card opens the side panel (attributes) — it is the leaf.
    const drillEntity = e => setTlPath(p => [...p, {kind: 'initiatives', name: e.name, items: e.initiatives.map(toInitBox)}]);
    const drillInitiative = it => setTlPath(p => [...p, {kind: 'swimlane', name: it.name, items: it.features}]);
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
                        <button type="button" className={tlLevel === 'feature' ? 'on' : ''} onClick={() => { setTlLevel('feature'); setTlPath([]); }}>By feature</button>
                    </span>
                )}
            </div>
            <FilterBar
                model={model}
                sel={tlFilter}
                onChange={sel => { setTlFilter(sel); setTlPath([]); }}
                matchCount={tlModel.features.length}
            />
            <div className="fp-panel">
                <div className="fp-tl-hint">
                    {tlFrame
                        ? (tlFrame.kind === 'initiatives'
                            ? 'Click an initiative to open its features, grouped into milestone lanes · ← Back'
                            : 'Features grouped into milestone lanes — click a feature card to open its attributes · ← Back')
                        : tlLevel === 'entity'
                            ? 'Click an entity to drill into its initiatives'
                            : tlLevel === 'initiative'
                                ? 'Click an initiative to open its features, grouped into milestone lanes'
                                : 'Features grouped into milestone lanes — click a feature card to open its attributes'}
                </div>
                {tlFrame ? (
                    tlFrame.kind === 'initiatives' ? (
                        <Timeline features={tlFrame.items} colorOf={colorOf} onDrill={drillInitiative} onPick={it => openFeatures(`${it.name} · features`, it.features)} />
                    ) : (
                        <FeatureSwimlane items={tlFrame.items} onPick={pushFeatureAttrs} />
                    )
                ) : tlLevel === 'entity' ? (
                    <Timeline features={entityTimeline} colorOf={colorOf} onDrill={drillEntity} onPick={e => openInitiatives(e.name, e.initiatives)} />
                ) : tlLevel === 'initiative' ? (
                    <Timeline features={initTimeline} colorOf={colorOf} onDrill={drillInitiative} onPick={it => openFeatures(`${it.name} · features`, it.features)} />
                ) : (
                    <FeatureSwimlane items={tlModel.features} onPick={pushFeatureAttrs} />
                )}
                <div className="fp-legend">
                    {(tlPath.length ? [] : tlLevel === 'entity' ? entityTimeline : tlLevel === 'initiative' ? tlModel.byInitiative : []).map(x => (
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
