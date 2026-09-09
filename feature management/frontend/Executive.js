import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    BRAND,
    PHASE_GROUPS,
    PHASE_COLORS,
    STATUS_COLORS,
    STORY,
    RISK,
    RISK_COLORS,
    featureRisk,
} from './constants';

// ─── Executive review ────────────────────────────────────────────────────────
// A stories reel: one full-bleed card per message, auto-advancing with a pip
// rail, tap/keyboard navigation and a pause control. The deck is built from the
// live model — every card states the numbers behind it, no card is decorative.

const fmtPace = p =>
    p === Infinity || p == null ? '—' : `${p.toFixed(p >= 10 ? 0 : 1)}%/day`;
// One phrase covering every risk state, so no card ever prints "needs —".
function paceLabel(risk) {
    if (risk.level === 'Delivered') return 'complete';
    if (risk.level === 'Past date') return `date passed, ${Math.round(risk.gap)}% left`;
    if (risk.level === 'No date') return `no date, ${Math.round(risk.gap)}% left`;
    return `needs ${fmtPace(risk.pace)}`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
// Days-to-date reads as prose: "in 24 days" / "12 days ago", never a bare minus.
const fmtDays = d =>
    d == null || Number.isNaN(d) ? 'no date' : d === 0 ? 'today' : d > 0 ? `in ${plural(d, 'day')}` : `${plural(-d, 'day')} ago`;

// ─── Card chrome ─────────────────────────────────────────────────────────────
function Card({kicker, title, lede, accent, children, footnote}) {
    return (
        <div className="ex-card" style={{'--ex-accent': accent || '#38bdf8'}}>
            <div className="ex-card-head">
                <div className="ex-kicker">{kicker}</div>
                <h2 className="ex-title">{title}</h2>
                {lede && <p className="ex-lede">{lede}</p>}
            </div>
            <div className="ex-card-body">
                <div className="ex-body-inner">{children}</div>
            </div>
            {footnote && <div className="ex-footnote">{footnote}</div>}
        </div>
    );
}

function Ring({pct, accent}) {
    const r = 76;
    const c = 2 * Math.PI * r;
    return (
        <div className="ex-ring">
            <svg viewBox="0 0 180 180" width="180" height="180" aria-hidden>
                <circle cx="90" cy="90" r={r} className="ex-ring-track" />
                <circle
                    cx="90"
                    cy="90"
                    r={r}
                    className="ex-ring-fill"
                    stroke={accent}
                    strokeDasharray={`${(c * pct) / 100} ${c}`}
                />
            </svg>
            <div className="ex-ring-label">
                <div className="ex-huge">{pct}%</div>
                <div className="ex-ring-sub">overall maturity</div>
            </div>
        </div>
    );
}

function StatRow({items}) {
    return (
        <div className="ex-stats">
            {items.map(s => (
                <div className="ex-stat" key={s.label}>
                    <div className="ex-stat-value" style={s.color ? {color: s.color} : undefined}>
                        {s.value}
                    </div>
                    <div className="ex-stat-label">{s.label}</div>
                </div>
            ))}
        </div>
    );
}

// Horizontal bar row — value, label and a proportional fill.
function BarRow({label, value, max, color, note}) {
    return (
        <div className="ex-bar-row">
            <div className="ex-bar-label">{label}</div>
            <div className="ex-bar-track">
                <div
                    className="ex-bar-fill"
                    style={{width: `${max ? (value / max) * 100 : 0}%`, backgroundColor: color}}
                />
            </div>
            <div className="ex-bar-value">{value}</div>
            {note && <div className="ex-bar-note">{note}</div>}
        </div>
    );
}

// Ranking: overdue first (most work left = worst), then live features by the
// pace they need, then undated, then delivered. Sorting on pace alone would put
// a 96%-complete overdue feature above a 0%-complete one.
const RISK_TIER = {'Past date': 0, 'High risk': 1, Watch: 1, 'On track': 1, 'No date': 2, Delivered: 3};
function byRisk(a, b) {
    const ta = RISK_TIER[a.risk.level] ?? 9;
    const tb = RISK_TIER[b.risk.level] ?? 9;
    if (ta !== tb) return ta - tb;
    if (ta === 1) return (b.risk.pace || 0) - (a.risk.pace || 0);
    return (b.risk.gap || 0) - (a.risk.gap || 0);
}

function RiskPill({level}) {
    return (
        <span className="ex-pill" style={{backgroundColor: RISK_COLORS[level] || '#64748b'}}>
            {level}
        </span>
    );
}

// ─── Cards ───────────────────────────────────────────────────────────────────
function CoverCard({model, asOf}) {
    const {kpis, attrs, features, initiatives} = model;
    return (
        <Card
            kicker={BRAND.review}
            title={`${BRAND.appName} — portfolio at ${kpis.overallPct}%`}
            lede={`Every feature, attribute and handshake in the base as of ${asOf}.`}
            accent="#38bdf8"
            footnote="Maturity = how far each attribute has travelled its own stage path, averaged across the portfolio."
        >
            <div className="ex-cover">
                <Ring pct={kpis.overallPct} accent="#38bdf8" />
                <StatRow
                    items={[
                        {label: 'Initiatives', value: Object.keys(initiatives).length},
                        {label: 'Features', value: features.length},
                        {label: 'Attributes', value: attrs.length},
                        {label: 'Delivered', value: attrs.filter(a => a.isDelivered).length, color: '#4ade80'},
                        {label: 'Blocked', value: kpis.blocked, color: '#f87171'},
                        {label: 'Awaiting review', value: kpis.awaitingReview, color: '#fbbf24'},
                    ]}
                />
            </div>
        </Card>
    );
}

function PipelineCard({model}) {
    const max = Math.max(1, ...PHASE_GROUPS.map(p => model.phaseCounts[p] || 0));
    const total = model.attrs.length || 1;
    return (
        <Card
            kicker="Where the work sits"
            title="Attributes by phase"
            lede={`All ${model.attrs.length} attributes, each counted once at its current stage.`}
            accent="#a371f7"
            footnote="Weight at the front of the pipeline means downstream stages have not been exercised yet."
        >
            {PHASE_GROUPS.map(p => (
                <BarRow
                    key={p}
                    label={p}
                    value={model.phaseCounts[p] || 0}
                    max={max}
                    color={PHASE_COLORS[p]}
                    note={`${Math.round(((model.phaseCounts[p] || 0) / total) * 100)}%`}
                />
            ))}
        </Card>
    );
}

function InitiativeCard({model, name, features, now}) {
    const rows = features
        .map(f => {
            const agg = model.byFeature[f.name] || {pct: 0, total: 0, blocked: 0};
            return {f, agg, risk: featureRisk(agg.pct, f.goLive, now)};
        })
        .sort((a, b) => a.agg.pct - b.agg.pct);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.agg.pct, 0) / rows.length) : 0;
    const attrs = rows.reduce((s, r) => s + r.agg.total, 0);
    const blocked = rows.reduce((s, r) => s + (r.agg.blocked || 0), 0);
    const dated = rows.filter(r => r.f.goLive).sort((a, b) => (a.f.goLive < b.f.goLive ? -1 : 1));
    const nearest = dated.length ? dated[0] : null;

    return (
        <Card
            kicker="Initiative"
            title={name}
            lede={`${plural(rows.length, 'feature')} · ${plural(attrs, 'attribute')} · ${avg}% average maturity`}
            accent="#2dd4bf"
            footnote={
                nearest
                    ? `Nearest go-live: ${nearest.f.name} on ${nearest.f.goLive} — ${fmtDays(nearest.risk.days)}.`
                    : 'No target go-live dates set on this initiative.'
            }
        >
            {blocked > 0 && (
                <div className="ex-alert">{plural(blocked, 'attribute')} blocked inside this initiative.</div>
            )}
            <div className="ex-list">
                {rows.map(({f, agg, risk}) => (
                    <div className="ex-row" key={f.id}>
                        <div className="ex-row-main">
                            <div className="ex-row-title">{f.name}</div>
                            <div className="ex-row-sub">
                                {f.priority && <span className="ex-tag">{f.priority}</span>}
                                <span className="ex-tag">{plural(agg.total, 'attribute')}</span>
                                {f.goLive && <span className="ex-tag">🏁 {f.goLive}</span>}
                                <RiskPill level={risk.level} />
                            </div>
                        </div>
                        <div className="ex-row-bar">
                            <div className="ex-bar-track">
                                <div
                                    className="ex-bar-fill"
                                    style={{width: `${agg.pct}%`, backgroundColor: RISK_COLORS[risk.level]}}
                                />
                            </div>
                        </div>
                        <div className="ex-row-pct">{agg.pct}%</div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function RiskCard({model, now}) {
    const rows = model.features
        .map(f => {
            const agg = model.byFeature[f.name] || {pct: 0, total: 0};
            return {f, agg, risk: featureRisk(agg.pct, f.goLive, now)};
        })
        .sort(byRisk);
    const pressing = rows.filter(r => r.risk.level === 'Past date' || r.risk.level === 'High risk');

    return (
        <Card
            kicker="Delivery risk"
            title={
                pressing.length
                    ? `${plural(pressing.length, 'feature')} cannot hit the date at today's maturity`
                    : 'Every feature is pacing to its date'
            }
            lede="Required pace = remaining maturity ÷ days left. Ranked hardest first."
            accent="#f97316"
            footnote={`Thresholds: ≥ ${RISK.high}%/day = high risk, ≥ ${RISK.watch}%/day = watch. Pace assumes maturity accrues evenly — it is a flag, not a forecast.`}
        >
            <div className="ex-list">
                {rows.map(({f, agg, risk}) => (
                    <div className="ex-row" key={f.id}>
                        <div className="ex-row-main">
                            <div className="ex-row-title">{f.name}</div>
                            <div className="ex-row-sub">
                                <span className="ex-tag">{f.initiative}</span>
                                {f.goLive ? (
                                    <span className="ex-tag">
                                        🏁 {f.goLive} · {fmtDays(risk.days)}
                                    </span>
                                ) : (
                                    <span className="ex-tag">no date</span>
                                )}
                                <span className="ex-tag">{paceLabel(risk)}</span>
                                <RiskPill level={risk.level} />
                            </div>
                        </div>
                        <div className="ex-row-bar">
                            <div className="ex-bar-track">
                                <div
                                    className="ex-bar-fill"
                                    style={{width: `${agg.pct}%`, backgroundColor: RISK_COLORS[risk.level]}}
                                />
                            </div>
                        </div>
                        <div className="ex-row-pct">{agg.pct}%</div>
                    </div>
                ))}
                {rows.length === 0 && <div className="ex-empty">No features in the base.</div>}
            </div>
        </Card>
    );
}

function BlockedCard({model}) {
    const blocked = model.attrs.filter(a => a.isBlocked);
    const byTeam = {};
    blocked.forEach(a => (byTeam[a.assignedTeamName || '(unassigned)'] = (byTeam[a.assignedTeamName || '(unassigned)'] || 0) + 1));
    return (
        <Card
            kicker="Blocked"
            title={blocked.length ? `${plural(blocked.length, 'attribute')} stopped` : 'Nothing is blocked'}
            lede={
                blocked.length
                    ? `Sitting with ${plural(Object.keys(byTeam).length, 'team')}. Each needs a named owner and a date.`
                    : 'No attribute currently carries Blocked status.'
            }
            accent="#ef4444"
            footnote={blocked.length ? 'Blocked work does not advance and does not appear in any team’s ready-to-push lane.' : undefined}
        >
            <div className="ex-list">
                {blocked.map(a => (
                    <div className="ex-row block" key={a.id}>
                        <div className="ex-row-main">
                            <div className="ex-row-title">
                                {a.businessName || a.attributeId}
                                <span className="ex-row-id">{a.attributeId}</span>
                            </div>
                            <div className="ex-row-sub">
                                <span className="ex-tag">{a.featureName}</span>
                                <span className="ex-tag">{a.currentStageName}</span>
                                <span className="ex-tag">{a.assignedTeamName || 'unassigned'}</span>
                                {a.dueDate && <span className="ex-tag">due {a.dueDate}</span>}
                            </div>
                            <div className="ex-reason">{a.blockedReason || 'No reason recorded.'}</div>
                        </div>
                    </div>
                ))}
                {blocked.length === 0 && <div className="ex-empty">Clean board.</div>}
            </div>
        </Card>
    );
}

function DecisionCard({model}) {
    const waiting = model.attrs.filter(a => a.isAwaitingReview);
    const byTeam = {};
    waiting.forEach(a => {
        const k = a.approverTeamName || '(no approver set)';
        (byTeam[k] = byTeam[k] || []).push(a);
    });
    const teams = Object.keys(byTeam).sort((a, b) => byTeam[b].length - byTeam[a].length);
    const max = Math.max(1, ...teams.map(t => byTeam[t].length));
    return (
        <Card
            kicker="Decision queue"
            title={waiting.length ? `${plural(waiting.length, 'approval')} waiting` : 'No approvals outstanding'}
            lede={waiting.length ? 'Who owes a decision, and on what.' : 'Nothing is sitting in review.'}
            accent="#fbbf24"
            footnote={waiting.length ? 'Every one of these is a team that can unblock the next stage today.' : undefined}
        >
            {teams.map(t => (
                <div className="ex-group" key={t}>
                    <BarRow label={t} value={byTeam[t].length} max={max} color="#fbbf24" />
                    <div className="ex-group-items">
                        {byTeam[t].map(a => (
                            <span className="ex-tag" key={a.id}>
                                {a.attributeId} · {a.featureName} · {a.currentStageName}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
            {waiting.length === 0 && <div className="ex-empty">Queue empty.</div>}
        </Card>
    );
}

function ReworkCard({model}) {
    const returns = model.handshakes.filter(h => h.action === 'Rejected / Returned');
    const recycled = model.attrs.filter(a => (a.cycleNumber || 1) > 1);
    const totalHandshakes = model.handshakes.length || 1;
    const rate = Math.round((returns.length / totalHandshakes) * 100);
    const byTeam = {};
    returns.forEach(h => (byTeam[h.toTeam || '—'] = (byTeam[h.toTeam || '—'] || 0) + 1));
    const teams = Object.keys(byTeam).sort((a, b) => byTeam[b] - byTeam[a]);
    const max = Math.max(1, ...teams.map(t => byTeam[t]));
    return (
        <Card
            kicker="Rework"
            title={`${rate}% of handshakes came back`}
            lede={`${plural(returns.length, 'return')} out of ${plural(model.handshakes.length, 'handshake')} · ${plural(recycled.length, 'attribute')} now past cycle 1.`}
            accent="#fb7185"
            footnote="Returns are the honest quality signal: they cost a full stage cycle each."
        >
            {teams.length > 0 && <div className="ex-subhead">Returned to</div>}
            {teams.map(t => (
                <BarRow key={t} label={t} value={byTeam[t]} max={max} color="#fb7185" />
            ))}
            {recycled.length > 0 && <div className="ex-subhead">Attributes past cycle 1</div>}
            <div className="ex-group-items">
                {recycled.map(a => (
                    <span className="ex-tag" key={a.id}>
                        {a.attributeId} · {a.featureName} · cycle {a.cycleNumber}
                    </span>
                ))}
            </div>
            {returns.length === 0 && recycled.length === 0 && (
                <div className="ex-empty">No returns recorded — every handshake went through first time.</div>
            )}
        </Card>
    );
}

function MomentumCard({model}) {
    // Bucket the handshake log by calendar month so the card works on any date
    // range in the base (not just "the last 30 days").
    const months = {};
    model.handshakes.forEach(h => {
        const m = (h.timestamp || '').slice(0, 7);
        if (!m) return;
        const b = (months[m] = months[m] || {approved: 0, returned: 0, submitted: 0, total: 0});
        if (h.action === 'Approved') b.approved += 1;
        else if (h.action === 'Rejected / Returned') b.returned += 1;
        else b.submitted += 1;
        b.total += 1;
    });
    const keys = Object.keys(months).sort().slice(-6);
    const max = Math.max(1, ...keys.map(k => months[k].total));
    const totals = keys.reduce(
        (s, k) => ({
            approved: s.approved + months[k].approved,
            returned: s.returned + months[k].returned,
            submitted: s.submitted + months[k].submitted,
        }),
        {approved: 0, returned: 0, submitted: 0},
    );
    return (
        <Card
            kicker="Momentum"
            title={`${plural(model.handshakes.length, 'handshake')} on the record`}
            lede={keys.length ? `Stage hand-offs by month, most recent ${plural(keys.length, 'month')}.` : 'No handshakes logged yet.'}
            accent="#4ade80"
            footnote="A handshake is a stage crossing a team boundary — the only movement the base actually records."
        >
            {keys.map(k => (
                <div className="ex-month" key={k}>
                    <div className="ex-bar-label">{k}</div>
                    <div className="ex-bar-track ex-stack">
                        <div
                            className="ex-bar-fill"
                            style={{width: `${(months[k].approved / max) * 100}%`, backgroundColor: '#22c55e'}}
                            title={`Approved: ${months[k].approved}`}
                        />
                        <div
                            className="ex-bar-fill"
                            style={{width: `${(months[k].submitted / max) * 100}%`, backgroundColor: STATUS_COLORS['Submitted for Review']}}
                            title={`Submitted: ${months[k].submitted}`}
                        />
                        <div
                            className="ex-bar-fill"
                            style={{width: `${(months[k].returned / max) * 100}%`, backgroundColor: '#fb7185'}}
                            title={`Returned: ${months[k].returned}`}
                        />
                    </div>
                    <div className="ex-bar-value">{months[k].total}</div>
                </div>
            ))}
            <StatRow
                items={[
                    {label: 'Approved', value: totals.approved, color: '#4ade80'},
                    {label: 'Submitted', value: totals.submitted, color: '#fbbf24'},
                    {label: 'Returned', value: totals.returned, color: '#fb7185'},
                ]}
            />
        </Card>
    );
}

function AsksCard({model, now}) {
    const blocked = model.attrs.filter(a => a.isBlocked);
    const waiting = model.attrs.filter(a => a.isAwaitingReview);
    const risky = model.features
        .map(f => ({f, risk: featureRisk((model.byFeature[f.name] || {}).pct || 0, f.goLive, now)}))
        .filter(r => r.risk.level === 'High risk' || r.risk.level === 'Past date')
        .sort(byRisk);
    const blockedTeams = Array.from(new Set(blocked.map(a => a.assignedTeamName).filter(Boolean)));
    const waitingTeams = Array.from(new Set(waiting.map(a => a.approverTeamName).filter(Boolean)));

    const asks = [
        blocked.length && {
            n: 1,
            head: `Unblock ${plural(blocked.length, 'attribute')}`,
            body: `Held by ${blockedTeams.join(', ') || 'unassigned owners'}. Each needs an owner and a date, or an explicit decision to descope.`,
            color: '#f87171',
        },
        waiting.length && {
            n: 2,
            head: `Clear ${plural(waiting.length, 'approval')}`,
            body: `${waitingTeams.join(', ') || 'No approver team set'} — each approval releases the next stage immediately.`,
            color: '#fbbf24',
        },
        risky.length && {
            n: 3,
            head: `Re-plan or confirm ${plural(risky.length, 'go-live date')}`,
            body: risky.map(r => `${r.f.name} — ${r.f.goLive}, ${paceLabel(r.risk)}`).join(' · '),
            color: '#f97316',
        },
    ].filter(Boolean);

    return (
        <Card
            kicker="The ask"
            title={
                asks.length
                    ? `${plural(asks.length, 'decision')} move${asks.length === 1 ? 's' : ''} the portfolio`
                    : 'Nothing is waiting on this forum'
            }
            lede={asks.length ? 'Everything below is actionable this week.' : 'No blockers, no pending approvals, no date at risk.'}
            accent="#38bdf8"
            footnote={`Generated from the live base — ${model.attrs.length} attributes, ${model.handshakes.length} handshakes.`}
        >
            <div className="ex-asks">
                {asks.map((a, i) => (
                    <div className="ex-ask" key={a.head} style={{borderLeftColor: a.color}}>
                        <div className="ex-ask-n">{i + 1}</div>
                        <div>
                            <div className="ex-ask-head">{a.head}</div>
                            <div className="ex-ask-body">{a.body}</div>
                        </div>
                    </div>
                ))}
                {asks.length === 0 && <div className="ex-empty">Board is clean.</div>}
            </div>
        </Card>
    );
}

// ─── The reel ────────────────────────────────────────────────────────────────
export default function Executive({model}) {
    const now = useMemo(() => Date.now(), []);
    const asOf = useMemo(() => new Date(now).toISOString().slice(0, 10), [now]);

    const deck = useMemo(() => {
        const initiativeNames = Object.keys(model.initiatives).sort((a, b) =>
            a === 'Ungrouped' ? 1 : b === 'Ungrouped' ? -1 : a.localeCompare(b),
        );
        return [
            {key: 'cover', label: 'Overview', node: <CoverCard model={model} asOf={asOf} />},
            {key: 'pipeline', label: 'Pipeline', node: <PipelineCard model={model} />},
            ...initiativeNames.map(name => ({
                key: `init:${name}`,
                label: name,
                node: <InitiativeCard model={model} name={name} features={model.initiatives[name]} now={now} />,
            })),
            {key: 'risk', label: 'Delivery risk', node: <RiskCard model={model} now={now} />},
            {key: 'blocked', label: 'Blocked', node: <BlockedCard model={model} />},
            {key: 'decisions', label: 'Decisions', node: <DecisionCard model={model} />},
            {key: 'rework', label: 'Rework', node: <ReworkCard model={model} />},
            {key: 'momentum', label: 'Momentum', node: <MomentumCard model={model} />},
            {key: 'asks', label: 'The ask', node: <AsksCard model={model} now={now} />},
        ];
    }, [model, asOf, now]);

    const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const [idx, setIdx] = useState(0);
    const [playing, setPlaying] = useState(!reduceMotion);
    const [progress, setProgress] = useState(0);
    const stageRef = useRef(null);

    const go = useCallback(
        delta => {
            setIdx(i => {
                const next = i + delta;
                if (next < 0) return 0;
                if (next >= deck.length) {
                    setPlaying(false);
                    return deck.length - 1;
                }
                return next;
            });
            setProgress(0);
        },
        [deck.length],
    );

    // Auto-advance. One interval, reset whenever the card or play state changes.
    useEffect(() => {
        if (!playing) return undefined;
        const step = (STORY.tickMs / STORY.slideMs) * 100;
        const t = setInterval(() => {
            setProgress(p => {
                if (p + step < 100) return p + step;
                setIdx(i => {
                    if (i + 1 >= deck.length) {
                        setPlaying(false);
                        return i;
                    }
                    return i + 1;
                });
                return 0;
            });
        }, STORY.tickMs);
        return () => clearInterval(t);
    }, [playing, idx, deck.length]);

    // Deck can shrink when the base changes underneath us.
    useEffect(() => {
        if (idx > deck.length - 1) setIdx(Math.max(0, deck.length - 1));
    }, [deck.length, idx]);

    const onKey = e => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
        } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            setPlaying(p => !p);
        }
    };

    const current = deck[Math.min(idx, deck.length - 1)];

    return (
        <div className="fp-mode ex-mode">
            <div
                className="ex-stage"
                ref={stageRef}
                tabIndex={0}
                role="group"
                aria-roledescription="carousel"
                aria-label={`${BRAND.review}: card ${idx + 1} of ${deck.length}, ${current.label}`}
                onKeyDown={onKey}
            >
                <div className="ex-pips" role="tablist" aria-label="Story cards">
                    {deck.map((c, i) => (
                        <button
                            key={c.key}
                            type="button"
                            role="tab"
                            className="ex-pip"
                            aria-selected={i === idx}
                            aria-label={c.label}
                            title={c.label}
                            onClick={() => {
                                setIdx(i);
                                setProgress(0);
                            }}
                        >
                            <span
                                className="ex-pip-fill"
                                style={{width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%'}}
                            />
                        </button>
                    ))}
                </div>

                <div className="ex-viewport" key={current.key}>
                    {current.node}
                </div>

                <button
                    type="button"
                    className="ex-zone left"
                    aria-label="Previous card"
                    onClick={() => go(-1)}
                    disabled={idx === 0}
                />
                <button
                    type="button"
                    className="ex-zone right"
                    aria-label="Next card"
                    onClick={() => go(1)}
                    disabled={idx === deck.length - 1}
                />

                <div className="ex-controls">
                    <button type="button" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous card">
                        ‹
                    </button>
                    <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                        {playing ? '❚❚' : '▶'}
                    </button>
                    <button type="button" onClick={() => go(1)} disabled={idx === deck.length - 1} aria-label="Next card">
                        ›
                    </button>
                    <span className="ex-counter">
                        {idx + 1} / {deck.length}
                    </span>
                </div>
            </div>

            <div className="ex-strip" aria-hidden>
                {deck.map((c, i) => (
                    <button
                        key={c.key}
                        type="button"
                        className={i === idx ? 'active' : ''}
                        onClick={() => {
                            setIdx(i);
                            setProgress(0);
                        }}
                        tabIndex={-1}
                    >
                        {c.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
