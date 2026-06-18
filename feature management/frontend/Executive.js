import {PHASE_GROUPS, PHASE_COLORS} from './constants';

// UBS-leaning palette: red lead accent, then deep neutrals/jewels for initiatives.
const INITIATIVE_COLORS = ['#E60000', '#14274E', '#0F766E', '#6D28D9', '#B45309', '#0E7490'];
const RAG = {delivered: '#0EA5E9', 'on-track': '#16A34A', 'at-risk': '#F59E0B', blocked: '#E11D48'};
const RAG_LABEL = {delivered: 'Delivered', 'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked'};

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}));
const fmtShort = ms => new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short'});

// ── SVG progress donut ────────────────────────────────────────────────────────
function Donut({pct, size = 132, stroke = 13, color = '#E60000', children}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return (
        <div className="fp-donut" style={{width: size, height: size}}>
            <svg width={size} height={size} aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDF0F4" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{transition: 'stroke-dashoffset .6s ease'}}
                />
            </svg>
            <div className="fp-donut-center">{children}</div>
        </div>
    );
}

function PhaseStrip({phase}) {
    const total = PHASE_GROUPS.reduce((s, p) => s + (phase[p] || 0), 0) || 1;
    return (
        <div className="fp-phasestrip" role="img" aria-label="Phase distribution">
            {PHASE_GROUPS.map(p => {
                const w = ((phase[p] || 0) / total) * 100;
                return w > 0 ? <span key={p} title={`${p}: ${phase[p]}`} style={{width: `${w}%`, background: PHASE_COLORS[p]}} /> : null;
            })}
        </div>
    );
}

function HealthDot({health}) {
    return <span className="fp-rag-dot" style={{background: RAG[health] || '#94A3B8'}} title={RAG_LABEL[health] || health} />;
}

// ── Go-live milestone timeline ─────────────────────────────────────────────────
function Timeline({features, colorOf}) {
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

    // Month ticks
    const ticks = [];
    const d = new Date(start);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= end) {
        ticks.push(d.getTime());
        d.setMonth(d.getMonth() + 1);
    }

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
                        className={`fp-tl-flag ${i % 2 ? 'down' : 'up'}`}
                        style={{left: x(f.goLiveMs)}}
                        title={`${f.name} · ${f.initiative} · go-live ${fmtDate(f.goLiveMs)} · ${f.pct}%`}
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

export default function Executive({model}) {
    const {byInitiative, features, kpis, phaseCounts, attrs} = model;
    const colorIndex = {};
    byInitiative.forEach((it, i) => (colorIndex[it.name] = INITIATIVE_COLORS[i % INITIATIVE_COLORS.length]));
    const colorOf = name => colorIndex[name] || '#64748B';

    const onTrack = features.filter(f => f.health === 'on-track').length;
    const atRisk = features.filter(f => f.health === 'at-risk' || f.health === 'blocked').length;
    const delivered = features.filter(f => f.health === 'delivered').length;
    const now = Date.now();
    const horizon = now + 1000 * 60 * 60 * 24 * 90;
    const goLiveSoon = features.filter(f => f.goLiveMs != null && f.goLiveMs >= now && f.goLiveMs <= horizon && f.pct < 100).length;

    const attention = attrs
        .filter(a => a.isBlocked || (a.dueDate && Date.parse(a.dueDate) < now && !a.isDelivered))
        .slice(0, 6);

    return (
        <div className="fp-exec">
            {/* Hero */}
            <section className="fp-hero">
                <div className="fp-hero-headline">
                    <div className="fp-eyebrow">UBS Switzerland · Finance Data Programme</div>
                    <h1>Programme Portfolio Overview</h1>
                    <p className="fp-hero-sub">Executive view across {byInitiative.length} initiatives and {features.length} features — accounting data maturity through to go-live.</p>
                    <div className="fp-hero-stats">
                        <div><b>{onTrack}</b><span>On track</span></div>
                        <div><b style={{color: RAG['at-risk']}}>{atRisk}</b><span>Need attention</span></div>
                        <div><b style={{color: RAG.delivered}}>{delivered}</b><span>Delivered</span></div>
                        <div><b>{goLiveSoon}</b><span>Go-live ≤ 90 days</span></div>
                    </div>
                </div>
                <div className="fp-hero-gauge">
                    <Donut pct={kpis.overallPct} size={156} stroke={16}>
                        <div className="fp-donut-pct">{kpis.overallPct}%</div>
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
                                <div>
                                    <div className="fp-initcard-name">{it.name}</div>
                                    <div className="fp-initcard-meta">{it.featureCount} features · {it.attrCount} attributes</div>
                                </div>
                                <Donut pct={it.pct} size={84} stroke={10} color={c}>
                                    <div className="fp-donut-pct sm">{it.pct}%</div>
                                </Donut>
                            </div>

                            <div className="fp-initcard-rag">
                                <span><HealthDot health="on-track" /> {it.onTrack} on track</span>
                                <span><HealthDot health="at-risk" /> {it.atRisk} at risk</span>
                                <span><HealthDot health="delivered" /> {it.delivered} done</span>
                            </div>

                            <PhaseStrip phase={phase} />
                            <div className="fp-initcard-next">Next go-live: <b>{fmtDate(it.nextGoLiveMs)}</b></div>

                            <ul className="fp-initcard-feats">
                                {it.features.map(f => (
                                    <li key={f.id}>
                                        <HealthDot health={f.health} />
                                        <span className="fp-feat-name" title={f.name}>{f.name}</span>
                                        <span className="fp-feat-bar"><i style={{width: `${f.pct}%`, background: c}} /></span>
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
                <Timeline features={features} colorOf={colorOf} />
                <div className="fp-legend">
                    {byInitiative.map(it => (
                        <span key={it.name}><i style={{background: colorOf(it.name)}} />{it.name}</span>
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
                                <li key={a.id}>
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
                                <li key={p}>
                                    <span className="fp-pb-label">{p}</span>
                                    <span className="fp-pb-track"><i style={{width: `${((phaseCounts[p] || 0) / max) * 100}%`, background: PHASE_COLORS[p]}} /></span>
                                    <span className="fp-pb-val">{phaseCounts[p] || 0}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
}
