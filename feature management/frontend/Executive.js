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
function Timeline({features, colorOf, onPick}) {
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
                        title={`${f.name} · ${f.initiative} · go-live ${fmtDate(f.goLiveMs)} · ${f.pct}%`}
                        onClick={() => onPick(f)}
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

export default function Executive({model}) {
    const {byInitiative, byEntity, features, kpis, phaseCounts, attrs} = model;
    const [mounted, setMounted] = useState(false);
    const drill = useDrill();
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const colorIndex = {};
    byInitiative.forEach((it, i) => (colorIndex[it.name] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]));
    const colorOf = name => colorIndex[name] || '#64748B';

    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    // Drill helpers (shared drawer)
    const openFeatures = (title, list) => drill.openFeatures(title, list);
    const openAttrs = (title, list) => drill.openAttrs(title, list);
    const pushFeatureAttrs = f => drill.pushAttrs(`${f.name} · attributes`, attrsOf(f.name));

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

            {/* Initiative cards */}
            <div className="fp-section-title">By entity &amp; initiative</div>
            {byEntity.map(e => (
                <div className="fp-entity" key={e.name}>
                    <div className="fp-entity-head clickable" onClick={() => openFeatures(e.name, e.initiatives.flatMap(i => i.features))}>
                        <span className="fp-entity-badge">Entity</span>
                        <span className="fp-entity-name">{e.name}</span>
                        <span className="fp-entity-meta">{e.initiatives.length} initiative{e.initiatives.length === 1 ? '' : 's'} · {e.featureCount} features · {e.pct}% mature</span>
                    </div>
                    <div className="fp-initgrid">
                        {e.initiatives.map(it => {
                            const phase = {};
                            PHASE_GROUPS.forEach(p => (phase[p] = 0));
                            it.features.forEach(f => {
                                const bf = model.byFeature[f.name];
                                if (bf) PHASE_GROUPS.forEach(p => (phase[p] += bf.phase[p] || 0));
                            });
                            const c = colorOf(it.name);
                            return (
                                <div className="fp-initcard" key={it.name} style={{borderTopColor: c}}>
                                    <div className="fp-initcard-head">
                                        <div className="clickable" onClick={() => openFeatures(it.name, it.features)}>
                                            <div className="fp-initcard-name">{it.name}</div>
                                            <div className="fp-initcard-meta">{it.featureCount} features · {it.attrCount} attributes</div>
                                        </div>
                                        <Donut pct={it.pct} size={84} stroke={10} color={c} onClick={() => openFeatures(it.name, it.features)}>
                                            <div className="fp-donut-pct sm"><CountUp value={it.pct} suffix="%" /></div>
                                        </Donut>
                                    </div>

                                    <div className="fp-initcard-rag">
                                        <span className="clickable" onClick={() => openFeatures(`${it.name} · on track`, it.features.filter(f => f.health === 'on-track'))}><HealthDot health="on-track" /> {it.onTrack} on track</span>
                                        <span className="clickable" onClick={() => openFeatures(`${it.name} · at risk`, it.features.filter(f => f.health === 'at-risk' || f.health === 'blocked'))}><HealthDot health="at-risk" /> {it.atRisk} at risk</span>
                                        <span className="clickable" onClick={() => openFeatures(`${it.name} · delivered`, it.features.filter(f => f.health === 'delivered'))}><HealthDot health="delivered" /> {it.delivered} done</span>
                                    </div>

                                    <PhaseStrip phase={phase} mounted={mounted} />
                                    <div className="fp-initcard-next">Next go-live: <b>{fmtDate(it.nextGoLiveMs)}</b></div>

                                    <ul className="fp-initcard-feats">
                                        {it.features.map(f => (
                                            <li key={f.id} className="clickable" onClick={() => pushFeatureAttrs(f)} title="See attributes">
                                                <HealthDot health={f.health} />
                                                <span className="fp-feat-name">{f.name}</span>
                                                <span className="fp-feat-bar"><i style={{width: mounted ? `${f.pct}%` : 0, background: c}} /></span>
                                                <span className="fp-feat-pct">{f.pct}%</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Timeline */}
            <div className="fp-section-title">Delivery timeline — target go-lives</div>
            <div className="fp-panel">
                <Timeline features={features} colorOf={colorOf} onPick={pushFeatureAttrs} />
                <div className="fp-legend">
                    {byInitiative.map(it => (
                        <span key={it.name} className="clickable" onClick={() => openFeatures(it.name, it.features)}><i style={{background: colorOf(it.name)}} />{it.name}</span>
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
