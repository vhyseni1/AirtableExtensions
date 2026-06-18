import {expandRecord} from '@airtable/blocks/interface/ui';
import {useEffect, useMemo, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {StatusChip} from './components';

// UBS-leaning palette: red lead accent, then deep neutrals/jewels for initiatives.
const INITIATIVE_COLORS = ['#E60000', '#14274E', '#0F766E', '#6D28D9', '#B45309', '#0E7490'];
const RAG = {delivered: '#0EA5E9', 'on-track': '#16A34A', 'at-risk': '#F59E0B', blocked: '#E11D48'};
const RAG_LABEL = {delivered: 'Delivered', 'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked'};

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}));
const fmtShort = ms => new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short'});

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

function HealthDot({health}) {
    return <span className="fp-rag-dot" style={{background: RAG[health] || '#94A3B8'}} title={RAG_LABEL[health] || health} />;
}

// ── Go-live milestone timeline ─────────────────────────────────────────────────
function Timeline({features, colorOf, onPick}) {
    const dated = features.filter(f => f.goLiveMs != null).sort((a, b) => a.goLiveMs - b.goLiveMs);
    const now = Date.now();
    if (dated.length === 0) return <div className="fp-muted">No target go-live dates set.</div>;

    const min = Math.min(now, dated[0].goLiveMs);
    const max = Math.max(now, dated[dated.length - 1].goLiveMs);
    const pad = (max - min) * 0.06 || 86400000 * 15;
    const start = min - pad;
    const end = max + pad;
    const span = end - start || 1;
    const x = ms => `${((ms - start) / span) * 100}%`;

    const ticks = [];
    const d = new Date(start);
    d.setDate(1); d.setHours(0, 0, 0, 0);
    while (d.getTime() <= end) { ticks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }

    return (
        <div className="fp-timeline">
            <div className="fp-timeline-track">
                {ticks.map(t => (
                    <div key={t} className="fp-tl-tick" style={{left: x(t)}}>
                        <span>{new Date(t).toLocaleDateString('en-GB', {month: 'short', year: '2-digit'})}</span>
                    </div>
                ))}
                <div className="fp-tl-today" style={{left: x(now)}} title="Today"><span>Today</span></div>
                {dated.map((f, i) => (
                    <div
                        key={f.id}
                        className={`fp-tl-flag clickable ${i % 2 ? 'down' : 'up'}`}
                        style={{left: x(f.goLiveMs)}}
                        title={`${f.name} · ${f.initiative} · go-live ${fmtDate(f.goLiveMs)} · ${f.pct}%`}
                        onClick={() => onPick(f)}
                    >
                        <span className="fp-tl-marker" style={{background: colorOf(f.initiative)}} />
                        <span className="fp-tl-label" style={{borderColor: colorOf(f.initiative)}}>
                            <b>{fmtShort(f.goLiveMs)}</b> {f.name}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Drill-down drawer (lists → records) ────────────────────────────────────────
function Drawer({stack, onBack, onClose, onFeature, colorOf}) {
    if (stack.length === 0) return null;
    const frame = stack[stack.length - 1];
    return (
        <div className="fp-drawer-backdrop" onClick={onClose}>
            <aside className="fp-drawer" onClick={e => e.stopPropagation()}>
                <div className="fp-drawer-head">
                    <div className="fp-crumbs">
                        {stack.length > 1 && <button type="button" className="fp-crumb-back" onClick={onBack}>← Back</button>}
                        <span className="fp-drawer-title">{frame.title}</span>
                        <span className="fp-col-count">{frame.items.length}</span>
                    </div>
                    <button type="button" className="fp-drawer-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className="fp-drawer-hint">{frame.type === 'features' ? 'Click a feature to see its attributes · ↗ opens the feature record' : 'Click an attribute to open its record'}</div>
                <ul className="fp-drawer-list">
                    {frame.type === 'features'
                        ? frame.items.map(f => (
                            <li key={f.id} className="fp-drawer-row clickable" onClick={() => onFeature(f)}>
                                <HealthDot health={f.health} />
                                <div className="fp-dr-main">
                                    <div className="fp-dr-title">{f.name}</div>
                                    <div className="fp-dr-sub">{f.initiative} · {f.total} attrs · go-live {fmtDate(f.goLiveMs)}</div>
                                </div>
                                <span className="fp-feat-bar"><i style={{width: `${f.pct}%`, background: colorOf(f.initiative)}} /></span>
                                <span className="fp-feat-pct">{f.pct}%</span>
                                <button type="button" className="fp-dr-open" title="Open feature record" onClick={e => { e.stopPropagation(); expandRecord(f.record); }}>↗</button>
                            </li>
                        ))
                        : frame.items.map(a => (
                            <li key={a.id} className="fp-drawer-row clickable" onClick={() => expandRecord(a.record)} title="Open record">
                                <HealthDot health={a.isBlocked ? 'blocked' : a.isDelivered ? 'delivered' : a.isAwaitingReview ? 'at-risk' : 'on-track'} />
                                <div className="fp-dr-main">
                                    <div className="fp-dr-title">{a.businessName || a.attributeId}</div>
                                    <div className="fp-dr-sub">{a.featureName} · {a.currentStageName}{a.assignee ? ` · ${a.assignee}` : ''}</div>
                                </div>
                                <StatusChip status={a.status} />
                            </li>
                        ))}
                    {frame.items.length === 0 && <li className="fp-muted" style={{padding: '12px'}}>Nothing here.</li>}
                </ul>
            </aside>
        </div>
    );
}

export default function Executive({model}) {
    const {byInitiative, features, kpis, phaseCounts, attrs} = model;
    const [mounted, setMounted] = useState(false);
    const [stack, setStack] = useState([]);
    const [narrativeOpen, setNarrativeOpen] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const colorIndex = {};
    byInitiative.forEach((it, i) => (colorIndex[it.name] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]));
    const colorOf = name => colorIndex[name] || '#64748B';

    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    // Drill helpers
    const openFeatures = (title, list) => setStack([{title, type: 'features', items: list}]);
    const openAttrs = (title, list) => setStack([{title, type: 'attrs', items: list}]);
    const pushFeatureAttrs = f => setStack(s => [...s, {title: `${f.name} · attributes`, type: 'attrs', items: attrsOf(f.name)}]);
    const back = () => setStack(s => s.slice(0, -1));
    const close = () => setStack([]);

    const onTrack = features.filter(f => f.health === 'on-track');
    const needAttn = features.filter(f => f.health === 'at-risk' || f.health === 'blocked');
    const delivered = features.filter(f => f.health === 'delivered');
    const now = Date.now();
    const horizon = now + 1000 * 60 * 60 * 24 * 90;
    const goLiveSoon = features.filter(f => f.goLiveMs != null && f.goLiveMs >= now && f.goLiveMs <= horizon && f.pct < 100);

    const attention = attrs
        .filter(a => a.isBlocked || (a.dueDate && Date.parse(a.dueDate) < now && !a.isDelivered))
        .slice(0, 6);

    // ── Narrative: 5–6 data-driven key statements (each drillable) ──
    const blockedAttrs = attrs.filter(a => a.isBlocked);
    const awaitingAttrs = attrs.filter(a => a.isAwaitingReview);
    const readyAttrs = attrs.filter(a => a.isReadyToPush);
    const rankedInit = [...byInitiative].filter(it => it.attrCount > 0).sort((a, b) => b.pct - a.pct);
    const upcoming = features.filter(f => f.goLiveMs != null).sort((a, b) => a.goLiveMs - b.goLiveMs);
    const nextGo = upcoming.find(f => f.goLiveMs >= now) || upcoming[0] || null;
    const bottleneck = PHASE_GROUPS.reduce((b, p) => ((phaseCounts[p] || 0) > (phaseCounts[b] || 0) ? p : b), PHASE_GROUPS[0]);

    const narrative = [];
    narrative.push({
        text: `The programme spans ${byInitiative.length} initiatives and ${features.length} features (${attrs.length} data attributes), at ${kpis.overallPct}% overall maturity.`,
    });
    narrative.push({
        text: `${onTrack.length} of ${features.length} features are on track and ${delivered.length} delivered; ${needAttn.length} need attention.`,
        drill: () => (needAttn.length ? openFeatures('Need attention', needAttn) : openFeatures('On track', onTrack)),
    });
    if (rankedInit.length >= 2 && rankedInit[0].name !== rankedInit[rankedInit.length - 1].name) {
        const top = rankedInit[0];
        const lag = rankedInit[rankedInit.length - 1];
        narrative.push({
            text: `${top.name} leads delivery at ${top.pct}%, while ${lag.name} trails at ${lag.pct}% — the likeliest place to focus.`,
            drill: () => openFeatures(lag.name, lag.features),
        });
    }
    if (nextGo) {
        const risk = nextGo.health === 'blocked' || nextGo.health === 'at-risk';
        narrative.push({
            text: `Next go-live: ${nextGo.name} (${nextGo.initiative}) on ${fmtDate(nextGo.goLiveMs)}, currently ${nextGo.pct}% mature${risk ? ' — at risk' : ''}.`,
            drill: () => pushFeatureAttrs(nextGo),
        });
    }
    if (blockedAttrs.length) {
        narrative.push({
            text: `${blockedAttrs.length} attribute${blockedAttrs.length > 1 ? 's are' : ' is'} blocked and ${awaitingAttrs.length} await sign-off — clearing these unblocks the nearest go-lives.`,
            drill: () => openAttrs('Blocked', blockedAttrs),
        });
    } else if (awaitingAttrs.length) {
        narrative.push({
            text: `${awaitingAttrs.length} attribute${awaitingAttrs.length > 1 ? 's' : ''} await approval, with no active blockers.`,
            drill: () => openAttrs('Awaiting review', awaitingAttrs),
        });
    } else {
        narrative.push({text: 'No blockers and nothing stuck in review — flow is clean.'});
    }
    narrative.push({
        text: `Most work sits in the ${bottleneck} phase (${phaseCounts[bottleneck] || 0} attributes); ${readyAttrs.length} ${readyAttrs.length === 1 ? 'is' : 'are'} ready to advance now.`,
        drill: () => openAttrs(`${bottleneck} phase`, attrs.filter(a => a.phase === bottleneck)),
    });
    const statements = narrative.slice(0, 6);

    return (
        <div className="fp-exec">
            {/* Hero */}
            <section className="fp-hero">
                <div className="fp-hero-headline">
                    <div className="fp-eyebrow">UBS Switzerland · Finance Data Programme</div>
                    <h1>Programme Portfolio Overview</h1>
                    <p className="fp-hero-sub">Executive view across {byInitiative.length} initiatives and {features.length} features — accounting data maturity through to go-live.</p>
                    <button type="button" className="fp-narrative-btn" onClick={() => setNarrativeOpen(true)}>✦ Narrative</button>
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
            <div className="fp-section-title">By initiative</div>
            <div className="fp-initgrid">
                {byInitiative.map(it => {
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
                <div className="fp-panel">
                    <div className="fp-panel-title">Requires attention</div>
                    {attention.length === 0 ? (
                        <div className="fp-muted">Nothing blocked or overdue. 🎉</div>
                    ) : (
                        <ul className="fp-attention">
                            {attention.map(a => (
                                <li key={a.id} className="clickable" onClick={() => expandRecord(a.record)} title="Open record">
                                    <HealthDot health={a.isBlocked ? 'blocked' : 'at-risk'} />
                                    <div>
                                        <div className="fp-att-title">{a.businessName || a.attributeId} <span className="fp-muted">· {a.featureName}</span></div>
                                        <div className="fp-att-sub">{a.isBlocked ? (a.blockedReason || 'Blocked') : `Overdue — due ${a.dueDate}`} · {a.currentStageName}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="fp-panel">
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

            <Drawer stack={stack} onBack={back} onClose={close} onFeature={pushFeatureAttrs} colorOf={colorOf} />

            {narrativeOpen && (
                <div className="fp-modal-backdrop" onClick={() => setNarrativeOpen(false)}>
                    <div className="fp-narrative" onClick={e => e.stopPropagation()}>
                        <div className="fp-narrative-head">
                            <div>
                                <div className="fp-narrative-eyebrow">Executive narrative</div>
                                <h2>Portfolio at a glance</h2>
                            </div>
                            <button type="button" className="fp-drawer-close" onClick={() => setNarrativeOpen(false)} aria-label="Close">×</button>
                        </div>
                        <ol className="fp-narrative-list">
                            {statements.map((s, i) => (
                                <li
                                    key={i}
                                    className={s.drill ? 'clickable' : ''}
                                    onClick={s.drill ? () => { setNarrativeOpen(false); s.drill(); } : undefined}
                                >
                                    <span className="fp-narr-num">{i + 1}</span>
                                    <span className="fp-narr-text">{s.text}</span>
                                    {s.drill && <span className="fp-narr-go" title="View details">›</span>}
                                </li>
                            ))}
                        </ol>
                        <div className="fp-narrative-foot">Click any statement to drill into the underlying features and records.</div>
                    </div>
                </div>
            )}
        </div>
    );
}
