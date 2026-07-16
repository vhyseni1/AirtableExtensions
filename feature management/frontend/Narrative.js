import {Fragment, useEffect, useMemo, useState} from 'react';
import {PHASE_GROUPS, STATUS} from './constants';
import Logo from './Logo';

const asOf = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});

// ── Harvey ball — the report's 5-state completion glyph (per the deck Key:
// ○ <10% · ◔ 11–39% · ◑ 40–69% · ◕ 70–99% · ● 100%). Rendered as a proportional
// pie so it reads at any value, not just the five stops. ──
function HarveyBall({pct, size = 15}) {
    const p = Math.max(0, Math.min(100, pct || 0)) / 100;
    const r = size / 2;
    const rr = r - 0.75;
    let fill = null;
    if (p >= 0.999) {
        fill = <circle cx={r} cy={r} r={rr} fill="#111" />;
    } else if (p > 0.001) {
        const ang = p * 2 * Math.PI - Math.PI / 2;
        const x = r + rr * Math.cos(ang);
        const y = r + rr * Math.sin(ang);
        const large = p > 0.5 ? 1 : 0;
        fill = <path d={`M ${r} ${r} L ${r} ${r - rr} A ${rr} ${rr} 0 ${large} 1 ${x} ${y} Z`} fill="#111" />;
    }
    return (
        <svg className="fp-hb" width={size} height={size} aria-hidden>
            <circle cx={r} cy={r} r={rr} fill="#fff" stroke="#111" strokeWidth="1" />
            {fill}
        </svg>
    );
}

// Cumulative onboarding curve (attributes reaching each lifecycle gate) — the
// deck's "Feeds DEV/UAT/PROD %" mini chart, drawn from the funnel totals.
function FunnelCurve({points}) {
    const w = 220, h = 96, pad = 6;
    const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
    const yOf = v => h - pad - (v / 100) * (h - pad * 2);
    const line = points.map((v, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');
    return (
        <svg className="fp-rp-curve" width={w} height={h} aria-hidden>
            <line x1={pad} y1={yOf(0)} x2={w - pad} y2={yOf(0)} stroke="#d7dce3" />
            <line x1={pad} y1={yOf(100)} x2={w - pad} y2={yOf(100)} stroke="#eef1f5" strokeDasharray="3 3" />
            <path d={`${line} L ${xs[xs.length - 1]} ${yOf(0)} L ${xs[0]} ${yOf(0)} Z`} fill="rgba(230,0,0,.08)" />
            <path d={line} fill="none" stroke="#E60000" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((v, i) => <circle key={i} cx={xs[i]} cy={yOf(v)} r={2.6} fill="#E60000" />)}
        </svg>
    );
}

// ── Live model → the exact numbers each report page needs ──
function buildData(model) {
    const attrs = model.attrs;
    const inProg = [STATUS.inProgress, STATUS.blocked, STATUS.returned];
    const isNS = a => a.status === STATUS.notStarted;
    const isIP = a => inProg.includes(a.status);
    const isDev = a => a.status === STATUS.submitted;
    const isUat = a => a.status === STATUS.approved;
    const isSigned = a => a.status === STATUS.done || a.isDelivered;
    const isNA = a => a.status === STATUS.cancelled;

    // Funnel gates (cumulative "reached at least this stage").
    const gReq = a => !isNS(a) && !isNA(a);
    const gModel = a => PHASE_GROUPS.indexOf(a.phase) >= 1;
    const gVest = a => isDev(a) || isUat(a) || isSigned(a);
    const gUat = a => isUat(a) || isSigned(a);
    const gDone = a => isSigned(a);

    const funnel = list => {
        const t = list.length;
        const g = pred => { const c = list.filter(pred).length; return {c, pct: t ? Math.round((c / t) * 100) : 0}; };
        return {t, req: g(gReq), model: g(gModel), vest: g(gVest), uat: g(gUat), done: g(gDone)};
    };
    const attrsOf = feats => { const s = new Set(feats.map(f => f.name)); return attrs.filter(a => s.has(a.featureName)); };

    const initRows = model.byInitiative
        .filter(it => it.attrCount > 0)
        .map(it => ({name: it.name, f: funnel(attrsOf(it.features))}))
        .sort((a, b) => b.f.t - a.f.t);
    const entityRows = model.byEntity
        .filter(e => e.features.length > 0)
        .map(e => ({name: e.name, f: funnel(attrsOf(e.features))}));
    const totalF = funnel(attrs);

    // Pods = the team currently holding each attribute.
    const podMap = {};
    attrs.forEach(a => { const t = a.assignedTeamName || 'Unassigned'; (podMap[t] = podMap[t] || []).push(a); });
    const podRow = list => {
        const t = list.length;
        const c = pred => list.filter(pred).length;
        const na = c(isNA);
        const base = t - na;
        const dev = c(isDev), uat = c(isUat), signed = c(isSigned);
        return {
            t, ns: c(isNS), ip: c(isIP), dev, uat, signed, na, base,
            vestPct: base ? Math.round(((dev + uat + signed) / base) * 100) : 0,
            uatPct: base ? Math.round(((uat + signed) / base) * 100) : 0,
            signPct: base ? Math.round((signed / base) * 100) : 0,
        };
    };
    const pods = Object.keys(podMap)
        .map(name => ({name, r: podRow(podMap[name])}))
        .sort((a, b) => b.r.t - a.r.t);
    const podTotal = podRow(attrs);

    // Auto-comments — one crisp line per initiative, the way the deck reads.
    const comments = initRows.slice(0, 8).map(r => ({
        name: r.name,
        text: `${r.f.model.c} of ${r.f.t} modelled · ${r.f.vest.c} DEV-complete · ${r.f.uat.c} in UAT · ${r.f.done.c} signed-off.`,
    }));

    const teamsEngaged = pods.filter(p => p.name !== 'Unassigned').length;
    const totalTeams = model.teamNames.length || teamsEngaged;
    const deliveredFeat = model.features.filter(f => f.health === 'delivered').length;
    const featTotal = model.features.length;

    return {initRows, entityRows, totalF, pods, podTotal, comments, teamsEngaged, totalTeams, deliveredFeat, featTotal};
}

// ── Report pages ──────────────────────────────────────────────────────────────
function CoverPage({model, d}) {
    return (
        <div className="fp-rp-cover">
            <div className="fp-rp-cover-main">
                <div className="fp-rp-eyebrow">UBS Switzerland · ampliFI</div>
                <h1 className="fp-rp-title">Product to ledger onboarding — data</h1>
                <div className="fp-rp-asof">as of {asOf}</div>
                <p className="fp-rp-lede">
                    <b>{d.totalF.uat.pct}%</b> of data attributes deployed &amp; tested in UAT · <b>{d.totalF.done.pct}%</b> signed-off
                </p>
                <div className="fp-rp-coverstats">
                    <div><b>{model.byInitiative.length}</b><span>Initiatives</span></div>
                    <div><b>{model.features.length}</b><span>Features</span></div>
                    <div><b>{model.attrs.length}</b><span>Attributes</span></div>
                    <div><b>{model.kpis.overallPct}%</b><span>Overall maturity</span></div>
                </div>
            </div>
            <div className="fp-rp-cover-side">
                <FunnelCurve points={[d.totalF.req.pct, d.totalF.model.pct, d.totalF.vest.pct, d.totalF.uat.pct, d.totalF.done.pct]} />
                <div className="fp-rp-curve-key">Req → Model → VEST → UAT → Complete</div>
            </div>
        </div>
    );
}

const GATES = [
    {key: 'req', label: 'Req.'},
    {key: 'model', label: 'Model'},
    {key: 'vest', label: 'VEST (DEV completed)'},
    {key: 'uat', label: 'UAT deployed & tested'},
    {key: 'done', label: 'UAT complete'},
];

// Shared column widths so the Initiatives and Entity tables line up exactly
// (Req under Req, Model under Model, …).
function FunnelCols() {
    return (
        <colgroup>
            <col style={{width: '16%'}} />
            {GATES.map(g => (
                <Fragment key={g.key}>
                    <col style={{width: '5.2%'}} />
                    <col style={{width: '11.6%'}} />
                </Fragment>
            ))}
        </colgroup>
    );
}

function FunnelHead() {
    return (
        <thead>
            <tr>
                <th rowSpan={2} className="fp-rp-rowname">Products / Initiatives</th>
                {GATES.map(g => <th key={g.key} colSpan={2} className="fp-rp-grouphead">{g.label}</th>)}
            </tr>
            <tr>
                {GATES.map(g => (
                    <Fragment key={g.key}>
                        <th className="fp-rp-sub">#</th>
                        <th className="fp-rp-sub">% compl</th>
                    </Fragment>
                ))}
            </tr>
        </thead>
    );
}

function FunnelRow({name, f, strong}) {
    return (
        <tr className={strong ? 'fp-rp-total' : ''}>
            <td className="fp-rp-rowname">{name}</td>
            {GATES.map(g => (
                <Fragment key={g.key}>
                    <td className="fp-rp-num">{f[g.key].c}</td>
                    <td className="fp-rp-pct"><HarveyBall pct={f[g.key].pct} /><span>{f[g.key].pct}%</span></td>
                </Fragment>
            ))}
        </tr>
    );
}

function OnboardingPage({d}) {
    return (
        <div className="fp-rp-page">
            <div className="fp-rp-head">
                <div>
                    <div className="fp-rp-eyebrow">ampliFI · Product to ledger onboarding</div>
                    <h2 className="fp-rp-h2">Product attributes onboarded and tested</h2>
                </div>
                <div className="fp-rp-headnum"><b>{d.totalF.uat.pct}%</b><span>attributes deployed &amp; tested in UAT</span></div>
            </div>

            <div className="fp-rp-cols">
                <aside className="fp-rp-rail">
                    <div className="fp-rp-rail-title">Onboarding at a glance</div>
                    <div className="fp-rp-railstat"><b>{d.totalF.done.c}</b> of {d.totalF.t}<span>attributes signed-off ({d.totalF.done.pct}%)</span></div>
                    <div className="fp-rp-railstat"><b>{d.totalF.uat.c}</b> of {d.totalF.t}<span>deployed &amp; tested in UAT ({d.totalF.uat.pct}%)</span></div>
                    <div className="fp-rp-railstat"><b>{d.teamsEngaged}</b> of {d.totalTeams}<span>pods engaged</span></div>
                    <div className="fp-rp-railstat"><b>{d.deliveredFeat}</b> of {d.featTotal}<span>features delivered</span></div>
                    <FunnelCurve points={[d.totalF.req.pct, d.totalF.model.pct, d.totalF.vest.pct, d.totalF.uat.pct, d.totalF.done.pct]} />
                    <div className="fp-rp-curve-key">Req → Model → VEST → UAT → Complete</div>
                </aside>

                <div className="fp-rp-tablewrap">
                    <table className="fp-rp-table">
                        <FunnelCols />
                        <FunnelHead />
                        <tbody>
                            {d.initRows.map(r => <FunnelRow key={r.name} name={r.name} f={r.f} />)}
                            <FunnelRow name="Total" f={d.totalF} strong />
                        </tbody>
                    </table>

                    {d.entityRows.length > 0 && (
                        <table className="fp-rp-table fp-rp-table-entity">
                            <FunnelCols />
                            <thead>
                                <tr>
                                    <th className="fp-rp-rowname">Entity</th>
                                    {GATES.map(g => <th key={g.key} colSpan={2} className="fp-rp-grouphead">{g.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {d.entityRows.map(r => <FunnelRow key={r.name} name={r.name} f={r.f} />)}
                            </tbody>
                        </table>
                    )}

                    <div className="fp-rp-comments">
                        <div className="fp-rp-comments-title">Comments</div>
                        <ul>
                            {d.comments.map(c => <li key={c.name}><b>{c.name}:</b> {c.text}</li>)}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="fp-rp-key">
                <b>Key:</b> Req. = requirement work begun · Model = modelled (past Requirements phase) · VEST = validated/enriched/transformed in DEV · UAT deployed &amp; tested = approved in UAT · UAT complete = signed-off / delivered. Harvey ball: ○ &lt;10% · ◔ 11–39% · ◑ 40–69% · ◕ 70–99% · ● 100%. Δ w-o-w / m-o-m not yet tracked (—).
            </div>
        </div>
    );
}

function PodPage({d}) {
    const Row = ({name, r, strong}) => (
        <tr className={strong ? 'fp-rp-total' : ''}>
            <td className="fp-rp-rowname">{name}</td>
            <td className="fp-rp-num">{r.t}</td>
            <td className="fp-rp-num">{r.ns}</td>
            <td className="fp-rp-num">{r.ip}</td>
            <td className="fp-rp-num">{r.dev}</td>
            <td className="fp-rp-num">{r.uat}</td>
            <td className="fp-rp-num">{r.signed}</td>
            <td className="fp-rp-num fp-rp-muted">{r.na}</td>
            <td className="fp-rp-num fp-rp-strongcol">{r.base}</td>
            <td className="fp-rp-pct"><HarveyBall pct={r.vestPct} /><span>{r.vestPct}%</span></td>
            <td className="fp-rp-pct"><HarveyBall pct={r.uatPct} /><span>{r.uatPct}%</span></td>
            <td className="fp-rp-pct"><HarveyBall pct={r.signPct} /><span>{r.signPct}%</span></td>
        </tr>
    );
    return (
        <div className="fp-rp-page">
            <div className="fp-rp-head">
                <div>
                    <div className="fp-rp-eyebrow">ampliFI · Sourcing &amp; VESTing</div>
                    <h2 className="fp-rp-h2">Sourcing &amp; VESTing status by pod</h2>
                </div>
                <div className="fp-rp-headnum"><b>{d.podTotal.vestPct}%</b><span>VESTed across all pods</span></div>
            </div>

            <div className="fp-rp-tablewrap">
                <table className="fp-rp-table fp-rp-table-pod">
                    <colgroup>
                        <col style={{width: '16%'}} />
                        <col style={{width: '6%'}} />
                        <col style={{width: '7.5%'}} />
                        <col style={{width: '7.5%'}} />
                        <col style={{width: '9%'}} />
                        <col style={{width: '7.5%'}} />
                        <col style={{width: '8%'}} />
                        <col style={{width: '5.5%'}} />
                        <col style={{width: '7.5%'}} />
                        <col style={{width: '6%'}} />
                        <col style={{width: '6%'}} />
                        <col style={{width: '6%'}} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="fp-rp-rowname">Crew / Pod</th>
                            <th className="fp-rp-sub">Total</th>
                            <th className="fp-rp-sub">Not started</th>
                            <th className="fp-rp-sub">In progress</th>
                            <th className="fp-rp-sub">DEV complete — awaiting UAT</th>
                            <th className="fp-rp-sub">UAT — tested</th>
                            <th className="fp-rp-sub">UAT — business sign-off</th>
                            <th className="fp-rp-sub">n/a</th>
                            <th className="fp-rp-sub">Total (excl. n/a)</th>
                            <th className="fp-rp-sub">VESTed</th>
                            <th className="fp-rp-sub">UAT deployed &amp; tested</th>
                            <th className="fp-rp-sub">Signed off by Finance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {d.pods.map(p => <Row key={p.name} name={p.name} r={p.r} />)}
                        <Row name="Total" r={d.podTotal} strong />
                    </tbody>
                </table>
            </div>

            <div className="fp-rp-key">
                <b>Key:</b> a pod is the team currently holding an attribute. Status columns map to the attribute workflow: DEV complete — awaiting UAT = submitted for review · UAT — tested = approved · UAT — business sign-off = done. VESTed / UAT deployed &amp; tested / Signed off by Finance are % of each pod&rsquo;s in-scope attributes (excl. n/a). Harvey ball: ○ &lt;10% · ◔ 11–39% · ◑ 40–69% · ◕ 70–99% · ● 100%.
            </div>
        </div>
    );
}

function buildDeck(model, d) {
    return [
        {topic: 'Cover', node: <CoverPage model={model} d={d} />},
        {topic: 'Product attributes onboarded and tested', node: <OnboardingPage d={d} />},
        {topic: 'Sourcing & VESTing status by pod', node: <PodPage d={d} />},
    ];
}

const SLIDE_MS = 16000;

export default function Narrative({model, onClose}) {
    const d = useMemo(() => buildData(model), [model]);
    const slides = useMemo(() => buildDeck(model, d), [model, d]);
    const [i, setI] = useState(0);
    const [playing, setPlaying] = useState(false);
    const n = slides.length;
    const go = delta => { setPlaying(false); setI(x => Math.max(0, Math.min(n - 1, x + delta))); };

    useEffect(() => {
        if (!playing) return undefined;
        const t = setTimeout(() => setI(x => (x + 1) % n), SLIDE_MS);
        return () => clearTimeout(t);
    }, [playing, i, n]);

    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [n, onClose]);

    const slide = slides[i];
    return (
        <div className="fp-ss fp-rp">
            <div className="fp-ss-top">
                <div className="fp-ss-brand"><Logo /> ampliFI · Narrative</div>
                <div className="fp-ss-topright">
                    <button type="button" className="fp-ss-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
                        {playing ? '❚❚' : '▶'}
                    </button>
                    <span className="fp-ss-count">{i + 1} / {n}</span>
                    <button type="button" className="fp-ss-close" onClick={onClose} aria-label="Close">×</button>
                </div>
            </div>

            <div className="fp-ss-stage">
                <button type="button" className="fp-ss-arrow left" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">‹</button>
                <div className="fp-ss-slide" key={i}>
                    {slide.node}
                    <div className="fp-rp-foot"><Logo /></div>
                </div>
                <button type="button" className="fp-ss-arrow right" onClick={() => go(1)} disabled={i === n - 1} aria-label="Next">›</button>
            </div>

            <div className="fp-ss-dots">
                {slides.map((s, idx) => (
                    <button type="button" key={idx} className={`fp-ss-dot${idx === i ? ' active' : ''}`} onClick={() => { setPlaying(false); setI(idx); }} aria-label={`Slide ${idx + 1}`} title={s.topic} />
                ))}
            </div>
        </div>
    );
}
