import {useEffect, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}));
const RAG_COLOR = {Green: '#16A34A', Amber: '#F59E0B', Red: '#E11D48'};

function SlideDonut({pct, color = '#fff'}) {
    const size = 200, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const [p, setP] = useState(0);
    useEffect(() => { const id = requestAnimationFrame(() => setP(pct)); return () => cancelAnimationFrame(id); }, [pct]);
    return (
        <div className="fp-ss-donut" style={{width: size, height: size}}>
            <svg width={size} height={size} aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, p)) / 100)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{transition: 'stroke-dashoffset 1s cubic-bezier(.22,.61,.36,1)'}} />
            </svg>
            <div className="fp-ss-donut-center">{pct}%</div>
        </div>
    );
}

function buildSlides(model, colorOf) {
    const {byInitiative, features, kpis, phaseCounts, attrs} = model;
    const now = Date.now();
    const onTrack = features.filter(f => f.health === 'on-track');
    const needAttn = features.filter(f => f.health === 'at-risk' || f.health === 'blocked');
    const delivered = features.filter(f => f.health === 'delivered');
    const blockedAttrs = attrs.filter(a => a.isBlocked);
    const awaiting = attrs.filter(a => a.isAwaitingReview);
    const ready = attrs.filter(a => a.isReadyToPush);
    const returned = model.handshakes.filter(h => /return/i.test(h.action));
    const upcoming = features.filter(f => f.goLiveMs != null).sort((a, b) => a.goLiveMs - b.goLiveMs);
    const nextGo = upcoming.find(f => f.goLiveMs >= now) || upcoming[0] || null;
    const ranked = [...byInitiative].filter(it => it.attrCount > 0).sort((a, b) => b.pct - a.pct);
    const bottleneck = PHASE_GROUPS.reduce((b, p) => ((phaseCounts[p] || 0) > (phaseCounts[b] || 0) ? p : b), PHASE_GROUPS[0]);
    const overdueFeat = features.filter(f => f.goLiveMs != null && f.goLiveMs < now && f.pct < 100).length;
    const status = overdueFeat > 0 ? 'Red' : (kpis.blocked > 0 || needAttn.length > 0) ? 'Amber' : 'Green';

    const slides = [];

    // 1 — Cover
    slides.push({
        topic: 'UBS Switzerland · Finance Data Programme',
        node: (
            <div className="fp-ss-cover">
                <div>
                    <h1 className="fp-ss-title">Programme Portfolio</h1>
                    <p className="fp-ss-sub">{byInitiative.length} initiatives · {features.length} features · {attrs.length} data attributes</p>
                    <span className="fp-ss-rag" style={{background: RAG_COLOR[status]}}>{status === 'Green' ? 'On track' : status === 'Amber' ? 'Watch' : 'At risk'}</span>
                </div>
                <SlideDonut pct={kpis.overallPct} />
            </div>
        ),
    });

    // 2 — Delivery health
    slides.push({
        topic: 'Delivery health',
        node: (
            <>
                <h2 className="fp-ss-headline">{onTrack.length} of {features.length} features on track</h2>
                <div className="fp-ss-stats">
                    <div><b style={{color: '#7CF2A8'}}>{onTrack.length}</b><span>On track</span></div>
                    <div><b style={{color: '#FFC078'}}>{needAttn.length}</b><span>Need attention</span></div>
                    <div><b style={{color: '#7CD4FF'}}>{delivered.length}</b><span>Delivered</span></div>
                    <div><b>{kpis.overallPct}%</b><span>Overall maturity</span></div>
                </div>
            </>
        ),
    });

    // 3 — Next milestone
    if (nextGo) {
        const risk = nextGo.health === 'blocked' || nextGo.health === 'at-risk';
        slides.push({
            topic: 'Next milestone',
            node: (
                <>
                    <div className="fp-ss-kicker">Next go-live · {fmtDate(nextGo.goLiveMs)}</div>
                    <h2 className="fp-ss-headline">{nextGo.name}</h2>
                    <p className="fp-ss-sub">{nextGo.initiative} · {nextGo.pct}% mature · <span style={{color: risk ? '#FFB1B1' : '#7CF2A8'}}>{risk ? 'At risk' : 'On track'}</span></p>
                    <div className="fp-ss-bar"><i style={{width: `${nextGo.pct}%`, background: colorOf(nextGo.initiative)}} /></div>
                </>
            ),
        });
    }

    // 4 — Momentum (leader vs laggard)
    if (ranked.length >= 2 && ranked[0].name !== ranked[ranked.length - 1].name) {
        const top = ranked[0];
        const lag = ranked[ranked.length - 1];
        slides.push({
            topic: 'Momentum by initiative',
            node: (
                <>
                    <h2 className="fp-ss-headline">{top.name} leads at {top.pct}%</h2>
                    <p className="fp-ss-sub">{lag.name} trails at {lag.pct}% — the likeliest place to focus.</p>
                    <div className="fp-ss-rows">
                        {ranked.map(it => (
                            <div className="fp-ss-row" key={it.name}>
                                <span className="fp-ss-row-name">{it.name}</span>
                                <span className="fp-ss-bar"><i style={{width: `${it.pct}%`, background: colorOf(it.name)}} /></span>
                                <span className="fp-ss-row-pct">{it.pct}%</span>
                            </div>
                        ))}
                    </div>
                </>
            ),
        });
    }

    // 5 — Risks & blockers
    if (blockedAttrs.length || returned.length || awaiting.length) {
        const top = [...blockedAttrs.map(a => `${a.businessName || a.attributeId} — ${a.blockedReason || 'blocked'} (${a.featureName})`),
            ...returned.map(h => `${h.feature} returned at ${h.stage}`)].slice(0, 3);
        slides.push({
            topic: 'Risks & blockers',
            node: (
                <>
                    <h2 className="fp-ss-headline">{blockedAttrs.length} blocked · {returned.length} returned · {awaiting.length} awaiting</h2>
                    <ul className="fp-ss-list">
                        {top.map((t, i) => <li key={i}>{t}</li>)}
                        {top.length === 0 && <li>No active blockers — flow is clean.</li>}
                    </ul>
                </>
            ),
        });
    }

    // 6 — Recent activity
    if (model.handshakes.length) {
        slides.push({
            topic: 'Recent activity',
            node: (
                <>
                    <h2 className="fp-ss-headline">Latest handoffs</h2>
                    <ul className="fp-ss-list">
                        {model.handshakes.slice(0, 5).map(h => (
                            <li key={h.id}><b>{h.feature}</b> — {h.action} at {h.stage} <span className="fp-ss-dim">({h.timestamp})</span></li>
                        ))}
                    </ul>
                </>
            ),
        });
    }

    // 7 — Where the work sits
    const maxPhase = Math.max(1, ...PHASE_GROUPS.map(p => phaseCounts[p] || 0));
    slides.push({
        topic: 'Where the work sits',
        node: (
            <>
                <h2 className="fp-ss-headline">{phaseCounts[bottleneck] || 0} attributes in {bottleneck}</h2>
                <p className="fp-ss-sub">{ready.length} ready to advance now.</p>
                <div className="fp-ss-rows">
                    {PHASE_GROUPS.map(p => (
                        <div className="fp-ss-row" key={p}>
                            <span className="fp-ss-row-name">{p}</span>
                            <span className="fp-ss-bar"><i style={{width: `${((phaseCounts[p] || 0) / maxPhase) * 100}%`, background: PHASE_COLORS[p]}} /></span>
                            <span className="fp-ss-row-pct">{phaseCounts[p] || 0}</span>
                        </div>
                    ))}
                </div>
            </>
        ),
    });

    return slides;
}

export default function Narrative({model, colorOf, onClose}) {
    const slides = buildSlides(model, colorOf || (() => '#E60000'));
    const [i, setI] = useState(0);
    const n = slides.length;
    const go = d => setI(x => Math.max(0, Math.min(n - 1, x + d)));

    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setI(x => Math.min(n - 1, x + 1)); }
            else if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [n, onClose]);

    const slide = slides[i];
    return (
        <div className="fp-ss">
            <div className="fp-ss-top">
                <div className="fp-ss-brand"><span className="fp-logo">UBS</span> Finance Data Programme · Narrative</div>
                <div className="fp-ss-topright">
                    <span className="fp-ss-count">{i + 1} / {n}</span>
                    <button type="button" className="fp-ss-close" onClick={onClose} aria-label="Close">×</button>
                </div>
            </div>

            <div className="fp-ss-stage">
                <button type="button" className="fp-ss-arrow left" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">‹</button>
                <div className="fp-ss-slide" key={i}>
                    <div className="fp-ss-topic">{slide.topic}</div>
                    {slide.node}
                </div>
                <button type="button" className="fp-ss-arrow right" onClick={() => go(1)} disabled={i === n - 1} aria-label="Next">›</button>
            </div>

            <div className="fp-ss-dots">
                {slides.map((s, idx) => (
                    <button type="button" key={idx} className={`fp-ss-dot${idx === i ? ' active' : ''}`} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} title={s.topic} />
                ))}
            </div>
        </div>
    );
}
