import {useEffect, useMemo, useRef, useState} from 'react';
import {PHASE_GROUPS, PHASE_COLORS, STATUS} from './constants';
import Logo from './Logo';

// ─── Narrative ────────────────────────────────────────────────────────────────
// The executive story deck: one full-bleed card per message, each animating in
// on arrival. Every number is derived live from the model — nothing is authored.
// Slides remount on change (key={i} on the stage), so the entrance animations
// replay every time a card is reached.

const asOf = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
const fmtShort = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC'}));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

// ─── Motion primitives ────────────────────────────────────────────────────────

// Honour the OS setting: no count-ups, no growth, just the final value.
function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const on = e => setReduced(e.matches);
        if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }
        mq.addListener(on);
        return () => mq.removeListener(on);
    }, []);
    return reduced;
}

function useCountUp(target, ms = 900) {
    const reduced = useReducedMotion();
    const [v, setV] = useState(reduced ? target : 0);
    useEffect(() => {
        if (reduced) { setV(target); return undefined; }
        let raf;
        const start = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - start) / ms);
            setV(Math.round(target * (t * (2 - t))));   // easeOutQuad
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms, reduced]);
    return v;
}
function CountUp({value, suffix}) {
    return <>{useCountUp(value)}{suffix || ''}</>;
}

// Flips false → true one frame after mount, so CSS transitions have a "from".
function useEnter() {
    const [on, setOn] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setOn(true));
        return () => cancelAnimationFrame(id);
    }, []);
    return on;
}

// ─── Chart primitives ─────────────────────────────────────────────────────────

function Donut({pct, size = 260, stroke = 22, color = '#38BDF8', label, sub}) {
    const on = useEnter();
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, on ? pct : 0)) / 100);
    const gid = `fp-st-grad-${String(color).replace('#', '')}`;
    return (
        <div className="fp-st-donut" style={{width: size, height: size}}>
            <svg width={size} height={size} aria-hidden>
                <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={color} />
                        <stop offset="100%" stopColor={color} stopOpacity="0.45" />
                    </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{transition: 'stroke-dashoffset 1.15s cubic-bezier(.22,.61,.36,1)'}}
                />
            </svg>
            <div className="fp-st-donut-mid">
                <div className="fp-st-donut-val"><CountUp value={pct} suffix="%" /></div>
                {label && <div className="fp-st-donut-lbl">{label}</div>}
                {sub && <div className="fp-st-donut-sub">{sub}</div>}
            </div>
        </div>
    );
}

// A ranked row: label, growing bar, value. Stagger via `i`.
function BarRow({label, pct, value, color, i = 0, note}) {
    const on = useEnter();
    return (
        <div className="fp-st-bar" style={{animationDelay: `${60 + i * 55}ms`}}>
            <div className="fp-st-bar-label" title={label}>{label}</div>
            <div className="fp-st-bar-track">
                <div
                    className="fp-st-bar-fill"
                    style={{
                        width: on ? `${Math.max(0, Math.min(100, pct))}%` : 0,
                        background: `linear-gradient(90deg, ${color}, ${color}99)`,
                        transitionDelay: `${120 + i * 55}ms`,
                    }}
                />
            </div>
            <div className="fp-st-bar-val">{value}</div>
            {note && <div className="fp-st-bar-note">{note}</div>}
        </div>
    );
}

// Proportional stacked bar — the pod status mix.
function StackBar({segments, total, i = 0}) {
    const on = useEnter();
    return (
        <div className="fp-st-stack" style={{animationDelay: `${60 + i * 55}ms`}}>
            {segments.map((s, k) =>
                s.n > 0 ? (
                    <span
                        key={s.key}
                        title={`${s.label}: ${s.n}`}
                        style={{
                            width: on ? `${(s.n / (total || 1)) * 100}%` : 0,
                            background: s.color,
                            transitionDelay: `${140 + i * 55 + k * 40}ms`,
                        }}
                    />
                ) : null,
            )}
        </div>
    );
}

// The onboarding funnel, drawn as centred bars that narrow gate by gate.
function Funnel({gates}) {
    const on = useEnter();
    return (
        <div className="fp-st-funnel">
            {gates.map((g, i) => (
                <div className="fp-st-fn-row" key={g.key} style={{animationDelay: `${80 + i * 90}ms`}}>
                    <div className="fp-st-fn-bar-wrap">
                        <div
                            className="fp-st-fn-bar"
                            style={{
                                width: on ? `${Math.max(4, g.pct)}%` : '4%',
                                background: `linear-gradient(90deg, ${g.color}, ${g.color}66)`,
                                transitionDelay: `${140 + i * 90}ms`,
                            }}
                        >
                            <span className="fp-st-fn-pct"><CountUp value={g.pct} suffix="%" /></span>
                        </div>
                    </div>
                    <div className="fp-st-fn-meta">
                        <div className="fp-st-fn-name">{g.label}</div>
                        <div className="fp-st-fn-count">{g.c} of {g.t}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function Stat({value, label, suffix, color, i = 0}) {
    return (
        <div className="fp-st-stat" style={{animationDelay: `${100 + i * 70}ms`}}>
            <div className="fp-st-stat-val" style={color ? {color} : undefined}>
                <CountUp value={value} suffix={suffix} />
            </div>
            <div className="fp-st-stat-lbl">{label}</div>
        </div>
    );
}

// ─── Live model → the numbers each card needs ─────────────────────────────────
function buildData(model) {
    const attrs = model.attrs;
    const inProg = [STATUS.inProgress, STATUS.blocked, STATUS.returned];
    const isNS = a => a.status === STATUS.notStarted;
    const isIP = a => inProg.includes(a.status);
    const isDev = a => a.status === STATUS.submitted;
    const isUat = a => a.status === STATUS.approved;
    const isSigned = a => a.status === STATUS.done || a.isDelivered;
    const isNA = a => a.status === STATUS.cancelled;

    // Funnel gates — cumulative "reached at least this gate".
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

    const totalF = funnel(attrs);
    const initRows = model.byInitiative
        .filter(it => it.attrCount > 0)
        .map(it => ({name: it.name, pct: it.pct, attrCount: it.attrCount, featureCount: it.featureCount,
                     atRisk: it.atRisk, delivered: it.delivered, nextGoLiveMs: it.nextGoLiveMs, f: funnel(attrsOf(it.features))}))
        .sort((a, b) => b.pct - a.pct);
    const entityRows = model.byEntity.filter(e => e.features.length > 0);

    // Pods = the team currently holding each attribute.
    const podMap = {};
    attrs.forEach(a => { const t = a.assignedTeamName || 'Unassigned'; (podMap[t] = podMap[t] || []).push(a); });
    const podRow = list => {
        const t = list.length;
        const c = pred => list.filter(pred).length;
        const na = c(isNA);
        const base = t - na;
        const dev = c(isDev), uat = c(isUat), signed = c(isSigned);
        return {t, ns: c(isNS), ip: c(isIP), dev, uat, signed, na, base,
                signPct: base ? Math.round((signed / base) * 100) : 0};
    };
    const pods = Object.keys(podMap).map(name => ({name, r: podRow(podMap[name])})).sort((a, b) => b.r.t - a.r.t);
    const podTotal = podRow(attrs);

    // Delivery risk, straight off the feature health the model already derives.
    const atRisk = model.features
        .filter(f => f.health === 'at-risk' || f.health === 'blocked')
        .sort((a, b) => (a.goLiveMs == null ? 1 : b.goLiveMs == null ? -1 : a.goLiveMs - b.goLiveMs));
    const now = Date.now();
    const upcoming = model.features
        .filter(f => f.goLiveMs != null && f.goLiveMs >= now && f.health !== 'delivered')
        .sort((a, b) => a.goLiveMs - b.goLiveMs)
        .slice(0, 6);

    const teamsEngaged = pods.filter(p => p.name !== 'Unassigned').length;
    const totalTeams = model.teamNames.length || teamsEngaged;
    const deliveredFeat = model.features.filter(f => f.health === 'delivered').length;

    return {totalF, initRows, entityRows, pods, podTotal, atRisk, upcoming,
            teamsEngaged, totalTeams, deliveredFeat, featTotal: model.features.length};
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function Card({accent, kicker, title, lede, children, footnote}) {
    return (
        <div className="fp-st-card" style={{'--st-accent': accent}}>
            <div className="fp-st-head">
                <div className="fp-st-kicker">{kicker}</div>
                <h2 className="fp-st-title">{title}</h2>
                {lede && <p className="fp-st-lede">{lede}</p>}
            </div>
            <div className="fp-st-body">{children}</div>
            {footnote && <div className="fp-st-foot-note">{footnote}</div>}
        </div>
    );
}

function CoverCard({model, d}) {
    return (
        <Card
            accent="#38BDF8"
            kicker="Executive narrative"
            title={<>Portfolio at <em><CountUp value={model.kpis.overallPct} suffix="%" /></em> maturity</>}
            lede={`Every initiative, feature and attribute in the base, as of ${asOf}.`}
            footnote="Maturity is how far each attribute has travelled its own stage path, weighted by attribute count."
        >
            <div className="fp-st-cover">
                <Donut pct={model.kpis.overallPct} label="overall" sub={`${d.totalF.done.c} of ${d.totalF.t} signed off`} />
                <div className="fp-st-statgrid">
                    <Stat i={0} value={model.byInitiative.length} label="Initiatives" />
                    <Stat i={1} value={model.features.length} label="Features" />
                    <Stat i={2} value={model.attrs.length} label="Attributes" />
                    <Stat i={3} value={d.deliveredFeat} label="Delivered" color="#4ADE80" />
                    <Stat i={4} value={model.kpis.blocked} label="Blocked" color="#FB7185" />
                    <Stat i={5} value={model.kpis.awaitingReview} label="Awaiting review" color="#FBBF24" />
                </div>
            </div>
        </Card>
    );
}

function FunnelCard({d}) {
    const gates = [
        {key: 'req', label: 'Requirements begun', color: '#38BDF8', ...d.totalF.req, t: d.totalF.t},
        {key: 'model', label: 'Modelled', color: '#818CF8', ...d.totalF.model, t: d.totalF.t},
        {key: 'vest', label: 'VESTed — DEV complete', color: '#A78BFA', ...d.totalF.vest, t: d.totalF.t},
        {key: 'uat', label: 'Deployed & tested in UAT', color: '#F472B6', ...d.totalF.uat, t: d.totalF.t},
        {key: 'done', label: 'Signed off', color: '#4ADE80', ...d.totalF.done, t: d.totalF.t},
    ];
    return (
        <Card
            accent="#A78BFA"
            kicker="Onboarding funnel"
            title={<>{d.totalF.uat.pct}% reach UAT, <em>{d.totalF.done.pct}%</em> are signed off</>}
            lede={`Share of all ${d.totalF.t} attributes that have reached each gate. Each gate is cumulative.`}
            footnote="Drop between two bars is where attributes are queuing — the widest gap is the constraint."
        >
            <Funnel gates={gates} />
        </Card>
    );
}

function InitiativesCard({d}) {
    return (
        <Card
            accent="#2DD4BF"
            kicker="By initiative"
            title={`${plural(d.initRows.length, 'initiative')} in flight`}
            lede="Ranked by maturity. Bar length is progress; the count on the right is attributes carried."
            footnote="An initiative's maturity is the attribute-weighted mean of its features, so big features count for more."
        >
            <div className="fp-st-rows">
                {d.initRows.map((r, i) => (
                    <BarRow
                        key={r.name}
                        i={i}
                        label={r.name}
                        pct={r.pct}
                        color={r.atRisk > 0 ? '#FB923C' : '#2DD4BF'}
                        value={`${r.pct}%`}
                        note={`${r.attrCount} attr · ${plural(r.featureCount, 'feature')}${r.atRisk ? ` · ${r.atRisk} at risk` : ''}${r.nextGoLiveMs != null ? ` · next ${fmtShort(r.nextGoLiveMs)}` : ''}`}
                    />
                ))}
                {d.initRows.length === 0 && <div className="fp-st-empty">No initiatives carry attributes yet.</div>}
            </div>
        </Card>
    );
}

function EntitiesCard({d}) {
    return (
        <Card
            accent="#FBBF24"
            kicker="By entity"
            title={`${plural(d.entityRows.length, 'entity', 'entities')} onboarding`}
            lede="Each ring is one entity's attribute-weighted maturity."
        >
            <div className="fp-st-ringrow">
                {d.entityRows.map((e, i) => (
                    <div className="fp-st-ring" key={e.name} style={{animationDelay: `${80 + i * 90}ms`}}>
                        <Donut pct={e.pct} size={132} stroke={12} color="#FBBF24" />
                        <div className="fp-st-ring-name">{e.name}</div>
                        <div className="fp-st-ring-sub">{e.attrCount} attr · {plural(e.featureCount, 'feature')}</div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

const POD_SEGMENTS = [
    {key: 'ns', label: 'Not started', color: 'rgba(255,255,255,.16)'},
    {key: 'ip', label: 'In progress', color: '#38BDF8'},
    {key: 'dev', label: 'DEV complete', color: '#A78BFA'},
    {key: 'uat', label: 'UAT tested', color: '#FBBF24'},
    {key: 'signed', label: 'Signed off', color: '#4ADE80'},
];

function PodsCard({d}) {
    return (
        <Card
            accent="#34D399"
            kicker="By pod"
            title={<>{d.teamsEngaged} of {d.totalTeams} pods are carrying work</>}
            lede="Where every attribute sits right now, by the team currently holding it."
            footnote={
                <span className="fp-st-legend">
                    {POD_SEGMENTS.map(s => (
                        <span key={s.key}><i style={{background: s.color}} />{s.label}</span>
                    ))}
                </span>
            }
        >
            <div className="fp-st-rows">
                {d.pods.map((p, i) => (
                    <div className="fp-st-podrow" key={p.name}>
                        <div className="fp-st-bar-label" title={p.name}>{p.name}</div>
                        <StackBar i={i} total={p.r.t} segments={POD_SEGMENTS.map(s => ({...s, n: p.r[s.key]}))} />
                        <div className="fp-st-bar-val">{p.r.t}</div>
                    </div>
                ))}
                {d.pods.length === 0 && <div className="fp-st-empty">No attributes are assigned to a team.</div>}
            </div>
        </Card>
    );
}

function RiskCard({d}) {
    return (
        <Card
            accent="#FB7185"
            kicker="Delivery risk"
            title={d.atRisk.length ? <><em>{d.atRisk.length}</em> {d.atRisk.length === 1 ? 'feature needs' : 'features need'} a decision</> : 'Nothing is off track'}
            lede={d.atRisk.length ? 'Blocked, or past a go-live date that has not been met.' : 'No feature is blocked or past its go-live date.'}
            footnote="Health is derived: blocked if any attribute is blocked, at risk if the go-live date has passed and it is under 100%."
        >
            <div className="fp-st-tiles">
                {d.atRisk.slice(0, 8).map((f, i) => (
                    <div className="fp-st-tile risk" key={f.name} style={{animationDelay: `${70 + i * 60}ms`}}>
                        <div className="fp-st-tile-top">
                            <span className={`fp-st-pill ${f.health}`}>{f.health === 'blocked' ? 'Blocked' : 'At risk'}</span>
                            <span className="fp-st-tile-pct">{f.pct}%</span>
                        </div>
                        <div className="fp-st-tile-name">{f.name}</div>
                        <div className="fp-st-tile-sub">{f.initiative} · go-live {fmtShort(f.goLiveMs)}</div>
                    </div>
                ))}
                {d.atRisk.length === 0 && d.upcoming.map((f, i) => (
                    <div className="fp-st-tile" key={f.name} style={{animationDelay: `${70 + i * 60}ms`}}>
                        <div className="fp-st-tile-top">
                            <span className="fp-st-pill on-track">Next up</span>
                            <span className="fp-st-tile-pct">{f.pct}%</span>
                        </div>
                        <div className="fp-st-tile-name">{f.name}</div>
                        <div className="fp-st-tile-sub">{f.initiative} · go-live {fmtShort(f.goLiveMs)}</div>
                    </div>
                ))}
            </div>
            {d.atRisk.length > 8 && <div className="fp-st-more">+ {d.atRisk.length - 8} more</div>}
        </Card>
    );
}

function PhaseCard({model}) {
    const total = model.attrs.length || 1;
    return (
        <Card
            accent="#818CF8"
            kicker="Where the work sits"
            title="Attributes by phase"
            lede={`All ${model.attrs.length} attributes, each counted once at its current stage.`}
            footnote="Weight at the front of the pipeline means the downstream stages have not been exercised yet."
        >
            <div className="fp-st-rows">
                {PHASE_GROUPS.map((p, i) => (
                    <BarRow
                        key={p}
                        i={i}
                        label={p}
                        pct={Math.round(((model.phaseCounts[p] || 0) / total) * 100)}
                        color={PHASE_COLORS[p] || '#818CF8'}
                        value={model.phaseCounts[p] || 0}
                        note={`${Math.round(((model.phaseCounts[p] || 0) / total) * 100)}% of the portfolio`}
                    />
                ))}
            </div>
        </Card>
    );
}

function AsksCard({model, d}) {
    const asks = [
        model.kpis.blocked > 0 && {
            head: `Unblock ${plural(model.kpis.blocked, 'attribute')}`,
            body: 'Each is stopped and will not advance without an owner and a date.',
            color: '#FB7185',
        },
        model.kpis.awaitingReview > 0 && {
            head: `Clear ${plural(model.kpis.awaitingReview, 'review')}`,
            body: 'Sitting with an approver — each approval releases the next stage immediately.',
            color: '#FBBF24',
        },
        d.atRisk.length > 0 && {
            head: `Re-plan or confirm ${plural(d.atRisk.length, 'go-live date')}`,
            body: d.atRisk.slice(0, 4).map(f => f.name).join(' · '),
            color: '#FB923C',
        },
        model.kpis.readyToPush > 0 && {
            head: `Push ${plural(model.kpis.readyToPush, 'attribute')} that are ready`,
            body: 'Acceptance met and a next stage waiting — these move today.',
            color: '#4ADE80',
        },
    ].filter(Boolean);

    return (
        <Card
            accent="#38BDF8"
            kicker="The ask"
            title={asks.length ? <>{plural(asks.length, 'decision')} move the portfolio</> : 'Nothing is waiting on this forum'}
            lede={asks.length ? 'Everything below is actionable this week.' : 'No blockers, no pending reviews, no date at risk.'}
            footnote={`Generated live from ${model.attrs.length} attributes across ${plural(model.features.length, 'feature')}.`}
        >
            <div className="fp-st-asks">
                {asks.map((a, i) => (
                    <div className="fp-st-ask" key={a.head} style={{borderLeftColor: a.color, animationDelay: `${90 + i * 80}ms`}}>
                        <div className="fp-st-ask-n" style={{color: a.color}}>{i + 1}</div>
                        <div>
                            <div className="fp-st-ask-head">{a.head}</div>
                            <div className="fp-st-ask-body">{a.body}</div>
                        </div>
                    </div>
                ))}
                {asks.length === 0 && <div className="fp-st-empty">Board is clean.</div>}
            </div>
        </Card>
    );
}

// ─── Deck ─────────────────────────────────────────────────────────────────────
function buildDeck(model, d) {
    return [
        {topic: 'Overview', node: <CoverCard model={model} d={d} />},
        {topic: 'Onboarding funnel', node: <FunnelCard d={d} />},
        {topic: 'By initiative', node: <InitiativesCard d={d} />},
        d.entityRows.length > 1 && {topic: 'By entity', node: <EntitiesCard d={d} />},
        {topic: 'Where the work sits', node: <PhaseCard model={model} />},
        {topic: 'By pod', node: <PodsCard d={d} />},
        {topic: 'Delivery risk', node: <RiskCard d={d} />},
        {topic: 'The ask', node: <AsksCard model={model} d={d} />},
    ].filter(Boolean);
}

const SLIDE_MS = 11000;

export default function Narrative({model, onClose}) {
    const d = useMemo(() => buildData(model), [model]);
    const slides = useMemo(() => buildDeck(model, d), [model, d]);
    const n = slides.length;

    const [i, setI] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const stageRef = useRef(null);

    const go = delta => { setPlaying(false); setProgress(0); setI(x => Math.max(0, Math.min(n - 1, x + delta))); };
    const jump = idx => { setPlaying(false); setProgress(0); setI(idx); };

    // Auto-advance with a visible progress rail, like a stories reel.
    useEffect(() => {
        if (!playing) return undefined;
        const step = 100 / (SLIDE_MS / 100);
        const t = setInterval(() => {
            setProgress(p => {
                if (p + step < 100) return p + step;
                setI(x => (x + 1) % n);
                return 0;
            });
        }, 100);
        return () => clearInterval(t);
    }, [playing, i, n]);

    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); setProgress(0); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [n, onClose]);

    const slide = slides[Math.min(i, n - 1)];

    return (
        <div className="fp-ss fp-st">
            {/* pip rail — one segment per card, filling while playing */}
            <div className="fp-st-pips">
                {slides.map((s, idx) => (
                    <button
                        type="button"
                        key={s.topic}
                        className="fp-st-pip"
                        onClick={() => jump(idx)}
                        aria-label={s.topic}
                        title={s.topic}
                    >
                        <span style={{width: idx < i ? '100%' : idx === i ? `${playing ? progress : 100}%` : '0%'}} />
                    </button>
                ))}
            </div>

            <div className="fp-ss-top">
                <div className="fp-ss-brand"><Logo /> Narrative</div>
                <div className="fp-ss-topright">
                    <button type="button" className="fp-ss-pdf" onClick={() => window.print()} title="Export to PDF">⤓ PDF</button>
                    <button type="button" className="fp-ss-play" onClick={() => { setPlaying(p => !p); setProgress(0); }} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
                        {playing ? '❚❚' : '▶'}
                    </button>
                    <span className="fp-ss-count">{i + 1} / {n}</span>
                    <button type="button" className="fp-ss-close" onClick={onClose} aria-label="Close">×</button>
                </div>
            </div>

            <div className="fp-ss-stage" ref={stageRef}>
                <button type="button" className="fp-ss-arrow left" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">‹</button>
                {/* key={i} remounts the card, so every entrance animation replays */}
                <div className="fp-st-slide" key={i}>{slide.node}</div>
                <button type="button" className="fp-ss-arrow right" onClick={() => go(1)} disabled={i === n - 1} aria-label="Next">›</button>
            </div>

            <div className="fp-st-caption">{slide.topic}</div>

            {/* Print-only: every card, one page each. */}
            <div className="fp-ss-print" aria-hidden>
                {slides.map(s => (
                    <div className="fp-ss-printpage" key={s.topic}>{s.node}</div>
                ))}
            </div>
        </div>
    );
}
