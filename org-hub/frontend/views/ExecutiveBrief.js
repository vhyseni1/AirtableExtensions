// Executive brief — the CEO's one screen.
//
// The question this view answers is not "what is the data" but "what do I need
// to know, and what needs me". So it leads with the shape of the change, then
// the three or four things that are actually off track, and it says plainly
// when nothing is.

import {useMemo} from 'react';
import {StatTile, BarList, Bridge} from '../components/Charts';
import {peopleImpact, savings, worksCouncil, fmtMoney, fmtNum} from '../lib/orgMetrics';
import {VIZ, RAG_COLORS} from '../config';

const S = VIZ.status;

// A flag is something a chief executive would want raised in a meeting.
// Severity orders them; the copy names the number and the owner-facing action.
function buildFlags({impact, money, wc, programme, conversations}) {
    const flags = [];

    if (programme && programme.available && programme.overdue.length) {
        flags.push({
            severity: 3,
            label: `${programme.overdue.length} milestone${programme.overdue.length !== 1 ? 's' : ''} past due`,
            detail: programme.overdue.slice(0, 3).map(m => m.milestone).join(' · '),
            area: 'Programme',
        });
    }

    if (wc && wc.consultingCountries > 0) {
        flags.push({
            severity: 2,
            label: `${wc.consultingCountries} countries require formal consultation`,
            detail: `${wc.longestNoticeWeeks} week notice sets the critical path`,
            area: 'Works council',
        });
    }

    if (conversations && conversations.available) {
        const outstanding = conversations.owed - conversations.counts.Held;
        if (outstanding > 0) {
            flags.push({
                severity: conversations.heldPct < 50 ? 3 : 1,
                label: `${outstanding} employee conversations outstanding`,
                detail: `${Math.round(conversations.heldPct)}% held so far`,
                area: 'People',
            });
        }
        if (conversations.untracked > 0) {
            flags.push({
                severity: 3,
                label: `${conversations.untracked} affected employees have no conversation record`,
                detail: 'In scope but not tracked anywhere',
                area: 'People',
            });
        }
    }

    if (money.netYearOne < 0) {
        flags.push({
            severity: 1,
            label: 'Year one is an investment year',
            detail: `${fmtMoney(money.oneOff)} one-off against ${fmtMoney(money.grossAnnual)} annual benefit · payback ${money.paybackMonths == null ? 'n/a' : `${money.paybackMonths.toFixed(0)} months`}`,
            area: 'Finance',
        });
    }

    if (Math.abs(impact.bridge.residual) > 0.5) {
        flags.push({
            severity: 2,
            label: 'Headcount bridge does not reconcile',
            detail: `${fmtNum(Math.abs(impact.bridge.residual))} unexplained — check the Status column on the design data`,
            area: 'Data quality',
        });
    }

    return flags.sort((a, b) => b.severity - a.severity);
}

const SEVERITY = {
    3: {label: 'Escalate', color: VIZ.negative},
    2: {label: 'Watch', color: VIZ.status.selection.color},
    1: {label: 'Note', color: VIZ.magnitude},
};

export default function ExecutiveBrief({model, programme, conversations, orgHealth, onNavigate}) {
    const impact = useMemo(() => peopleImpact(model), [model]);
    const money = useMemo(() => savings(model), [model]);
    const wc = useMemo(() => worksCouncil(model), [model]);

    const flags = useMemo(
        () => buildFlags({impact, money, wc, programme, conversations}),
        [impact, money, wc, programme, conversations],
    );

    const changePct = impact.totals.current
        ? Math.abs(impact.netChange / impact.totals.current) * 100 : 0;

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Executive brief</span>
                    <h2 className="toolbar-heading">Where the organisation stands</h2>
                </div>
                <div className="toolbar-right">
                    {programme && programme.available && programme.currentPhase && (
                        <span className="phase-chip">
                            Phase · <strong>{programme.currentPhase.phase}</strong>
                        </span>
                    )}
                </div>
            </div>

            <div className="dashboard-scroll">
                {/* The headline: one sentence a CEO can repeat in a board meeting. */}
                <div className="brief-hero">
                    <div className="brief-hero-main">
                        <div className="brief-hero-eyebrow">The change in one line</div>
                        <p className="brief-hero-line">
                            The organisation moves from <strong>{fmtNum(impact.totals.current)}</strong> to{' '}
                            <strong>{fmtNum(impact.totals.future)}</strong> positions
                            {' '}(<strong>{impact.netChange >= 0 ? '+' : '−'}{fmtNum(Math.abs(impact.netChange))}</strong>,
                            {' '}{changePct.toFixed(0)}%), affecting{' '}
                            <strong>{fmtNum(impact.impacted)}</strong> people across{' '}
                            <strong>{wc.rows.length}</strong> countries, for a run-rate benefit of{' '}
                            <strong>{fmtMoney(money.grossAnnual)}</strong> a year.
                        </p>
                    </div>
                    <div className="brief-hero-side">
                        <div className="brief-ring" style={{
                            background: `conic-gradient(${VIZ.magnitude} ${(programme && programme.available ? programme.completion : 0) * 3.6}deg, #e8eef7 0deg)`,
                        }}>
                            <div className="brief-ring-hole">
                                <span className="brief-ring-value">
                                    {programme && programme.available ? `${Math.round(programme.completion)}%` : '—'}
                                </span>
                                <span className="brief-ring-label">delivered</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="tile-row">
                    <StatTile
                        label="Positions"
                        value={fmtNum(impact.totals.future)}
                        sub={`from ${fmtNum(impact.totals.current)}`}
                        trend={impact.netChange}
                        tone={impact.netChange < 0 ? 'warn' : 'good'}
                        accent={VIZ.magnitude}
                    />
                    <StatTile
                        label="People affected"
                        value={fmtNum(impact.impacted)}
                        sub="at risk or in selection"
                        tone="critical"
                        accent={S.risk.color}
                    />
                    <StatTile
                        label="Annual benefit"
                        value={fmtMoney(money.grossAnnual)}
                        sub={`payback ${money.paybackMonths == null ? 'n/a' : `${money.paybackMonths.toFixed(0)} mo`}`}
                        tone="good"
                        accent={VIZ.positive}
                    />
                    <StatTile
                        label="Countries consulting"
                        value={fmtNum(wc.consultingCountries)}
                        sub={`${wc.longestNoticeWeeks} wk critical path`}
                        tone={wc.consultingCountries ? 'warn' : undefined}
                        accent={S.selection.color}
                    />
                    {orgHealth && (
                        <StatTile
                            label="Span of control"
                            value={orgHealth.avgSpan.toFixed(1)}
                            sub={`${orgHealth.layers} layers`}
                            accent={VIZ.neutral}
                        />
                    )}
                    {programme && programme.available && (
                        <StatTile
                            label="Milestones at risk"
                            value={fmtNum(programme.ragCounts.Red)}
                            sub={`${programme.overdue.length} past due`}
                            tone={programme.ragCounts.Red ? 'critical' : 'good'}
                            accent={programme.ragCounts.Red ? VIZ.negative : VIZ.positive}
                        />
                    )}
                </div>

                <div className="panel-grid">
                    <div className="panel-span-2">
                        <div className="panel">
                            <div className="panel-head">
                                <div>
                                    <div className="panel-title">What needs you</div>
                                    <div className="panel-sub">
                                        Ordered by severity. Nothing here is cosmetic.
                                    </div>
                                </div>
                            </div>
                            {flags.length === 0 ? (
                                <div className="brief-clear">
                                    <span className="brief-clear-icon">✓</span>
                                    <div>
                                        <strong>Nothing is off track.</strong>
                                        <div className="panel-sub">
                                            Every milestone is on or ahead of date, conversations are
                                            on plan, and the bridge reconciles.
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flags">
                                    {flags.map((f, i) => (
                                        <div key={i} className="flag">
                                            <span
                                                className="flag-sev"
                                                style={{background: SEVERITY[f.severity].color}}
                                            >
                                                {SEVERITY[f.severity].label}
                                            </span>
                                            <div className="flag-body">
                                                <div className="flag-label">{f.label}</div>
                                                <div className="flag-detail">{f.detail}</div>
                                            </div>
                                            <span className="flag-area">{f.area}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <Bridge
                        title="Headcount bridge"
                        subtitle={`${fmtNum(impact.bridge.redeployed)} of the ${fmtNum(impact.bridge.risk)} at risk are redeployed`}
                        steps={[
                            {label: 'Current', value: impact.bridge.current, kind: 'base'},
                            {label: 'Roles removed', value: impact.bridge.removed, kind: 'down'},
                            {label: 'New roles', value: impact.bridge.posted, kind: 'up'},
                            {label: 'Target', value: impact.bridge.future, kind: 'total'},
                        ]}
                    />

                    {programme && programme.available && (
                        <div className="panel">
                            <div className="panel-head">
                                <div>
                                    <div className="panel-title">Programme phases</div>
                                    <div className="panel-sub">
                                        {programme.nextMilestone
                                            ? `Next: ${programme.nextMilestone.milestone}`
                                            : 'No open milestones'}
                                    </div>
                                </div>
                            </div>
                            <ol className="phase-rail">
                                {programme.byPhase.map(p => {
                                    const state = p.done === p.total ? 'done'
                                        : programme.currentPhase && p.phase === programme.currentPhase.phase ? 'active'
                                            : 'ahead';
                                    return (
                                        <li key={p.phase} className={`phase-step ${state}`}>
                                            <span className="phase-dot" />
                                            <span className="phase-name">{p.phase}</span>
                                            <span className="phase-count">{p.done}/{p.total}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    )}

                    <BarList
                        title="Where the change lands"
                        subtitle="Affected people by organisation"
                        rows={impact.byOrg
                            .filter(r => r.risk + r.selection > 0)
                            .map(r => ({label: r.key, value: r.risk + r.selection, color: S.risk.color}))}
                        limit={8}
                    />

                    {programme && programme.available && (
                        <BarList
                            title="Workstream health"
                            subtitle="Delivery against plan"
                            format={v => `${Math.round(v)}%`}
                            legend={Object.values(RAG_COLORS).map(r => ({label: r.label, color: r.color}))}
                            rows={programme.byWorkstream.map(w => ({
                                label: w.workstream,
                                value: w.progress,
                                color: RAG_COLORS[w.rag].color,
                            }))}
                            limit={8}
                        />
                    )}
                </div>

                {onNavigate && (
                    <div className="brief-jump">
                        <span className="brief-jump-label">Go deeper</span>
                        {[
                            ['people-impact', 'People impact'],
                            ['savings', 'Financials'],
                            ['works-council', 'Works council'],
                            ['programme', 'Programme'],
                            ['conversations', 'Conversations'],
                        ].map(([key, label]) => (
                            <button key={key} className="btn btn-ghost" onClick={() => onNavigate(key)}>
                                {label} →
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
