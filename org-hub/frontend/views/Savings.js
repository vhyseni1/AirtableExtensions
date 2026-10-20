// Savings — what the design costs today, what it costs after, and what getting
// there costs once.
//
// Every input is visible: the rate card is printed at the bottom of the view.
// A savings number whose assumptions are hidden is not worth showing to a
// steering committee.

import {useMemo} from 'react';
import {StatTile, BarList, Bridge, CashCurve} from '../components/Charts';
import {ExportMenu} from '../components/Controls';
import {savings, fmtMoney, fmtNum} from '../lib/orgMetrics';
import {cashflow, variants, sensitivity, fmtMonths} from '../lib/finance';
import {toCSV, downloadText} from '../lib/exports';
import {VIZ, RATE_CARD, FINANCE, tierLabel} from '../config';

export default function Savings({model}) {
    const m = useMemo(() => savings(model), [model]);
    const money = v => fmtMoney(v);

    // The run-rate number above is what the target state costs once we are in
    // it. These three are what it is actually worth: when the benefit lands,
    // what it is worth discounted, and how far the answer moves if the inputs
    // are wrong.
    const flow = useMemo(() => cashflow(m), [m]);
    const scenarios = useMemo(() => variants(m), [m]);
    const swings = useMemo(() => sensitivity(m), [m]);

    const exportItems = useMemo(() => [{
        label: 'CSV · savings by organisation',
        run: () => downloadText(
            toCSV(
                ['Organisation', 'Current cost', 'Future cost', 'Annual saving', 'Current HC'],
                m.byOrg.map(r => [r.key, Math.round(r.current), Math.round(r.future), Math.round(r.saving), r.headcount]),
            ),
            'savings-by-organisation.csv',
        ),
    }, {
        label: 'CSV · assumptions',
        run: () => {
            const rows = [
                ['Default cost per FTE', RATE_CARD.defaultCostPerFte],
                ...Object.entries(RATE_CARD.byCountry).map(([k, v]) => [`Cost per FTE · ${k}`, v]),
                ...Object.entries(RATE_CARD.levelUplift)
                    .map(([k, v]) => [`Seniority uplift · ${tierLabel(k)}`, v]),
                ['Severance (months)', RATE_CARD.severanceMonths],
                ['Recruitment cost per hire', RATE_CARD.recruitmentCostPerHire],
                ['Transition cost per FTE', RATE_CARD.transitionCostPerFte],
            ];
            downloadText(toCSV(['Assumption', 'Value'], rows), 'savings-assumptions.csv');
        },
    }], [m]);

    const savingRate = m.currentCost ? (m.grossAnnual / m.currentCost) * 100 : 0;

    // Bar length is the magnitude of the change; the sign lives in the value and
    // the colour. Clamping a cost increase to zero would hide it entirely.
    const signed = v => `${v < 0 ? '−' : ''}${fmtMoney(Math.abs(v))}`;
    const toSignedRows = rows => rows
        .filter(r => Math.round(r.saving) !== 0)
        .map(r => ({
            label: r.key,
            value: Math.abs(r.saving),
            signedValue: r.saving,
            color: r.saving >= 0 ? VIZ.positive : VIZ.negative,
        }))
        .sort((a, b) => b.value - a.value);

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Organisational design</span>
                    <h2 className="toolbar-heading">Savings</h2>
                </div>
                <div className="toolbar-right">
                    <span className="toolbar-label">Modelled · {RATE_CARD.currency}</span>
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="dashboard-scroll">
                <div className="tile-row">
                    <StatTile
                        label="Gross annual saving"
                        value={money(m.grossAnnual)}
                        sub={`${savingRate.toFixed(1)}% of current cost`}
                        tone={m.grossAnnual > 0 ? 'good' : 'critical'}
                        accent={m.grossAnnual > 0 ? VIZ.positive : VIZ.negative}
                        spark={m.byOrg.slice(0, 12).map(r => Math.max(0, r.saving))}
                    />
                    <StatTile
                        label="One-off cost"
                        value={money(m.oneOff)}
                        sub="severance, hiring, transition"
                        tone="warn"
                        accent={VIZ.status.selection.color}
                    />
                    <StatTile
                        label="Net year one"
                        value={money(flow.netYearOne)}
                        sub={flow.netYearOne >= 0 ? 'positive in year one' : 'investment year'}
                        tone={flow.netYearOne >= 0 ? 'good' : 'warn'}
                        accent={flow.netYearOne >= 0 ? VIZ.positive : VIZ.status.selection.color}
                    />
                    <StatTile
                        label="Payback"
                        value={fmtMonths(flow.paybackMonths)}
                        sub={flow.paybackMonths == null
                            ? 'design does not reduce cost'
                            : `vs ${fmtMonths(flow.naivePaybackMonths)} at full run-rate`}
                        accent={VIZ.magnitude}
                    />
                    <StatTile
                        label={`NPV · ${FINANCE.horizonMonths / 12} years`}
                        value={money(flow.npv)}
                        sub={`discounted at ${(FINANCE.discountRateAnnual * 100).toFixed(0)}% a year`}
                        tone={flow.npv >= 0 ? 'good' : 'critical'}
                        accent={flow.npv >= 0 ? VIZ.positive : VIZ.negative}
                        spark={flow.months.filter((_, i) => i % 3 === 0)
                            .map(r => Math.max(0, r.cumulative))}
                    />
                    <StatTile
                        label="Run-rate cost"
                        value={money(m.futureCost)}
                        sub={`from ${money(m.currentCost)}`}
                        accent={VIZ.neutral}
                    />
                </div>

                <div className="panel-grid">
                    <div className="panel-span-2">
                        <Bridge
                            title="Cost bridge"
                            subtitle="Current run-rate to target run-rate, then the one-off to get there"
                            format={money}
                            steps={[
                                {label: 'Current run-rate', value: m.currentCost, kind: 'base'},
                                {
                                    label: m.grossAnnual >= 0 ? 'Roles removed' : 'Roles added',
                                    value: Math.abs(m.grossAnnual),
                                    kind: m.grossAnnual >= 0 ? 'down' : 'up',
                                },
                                {label: 'Target run-rate', value: m.futureCost, kind: 'total'},
                            ]}
                        />
                    </div>

                    <BarList
                        title="One-off cost breakdown"
                        subtitle="What executing the change costs once"
                        format={money}
                        rows={[
                            {label: 'Severance', value: m.severance, color: VIZ.status.risk.color},
                            {label: 'Recruitment', value: m.recruitment, color: VIZ.status.posted.color},
                            {label: 'Transition', value: m.transition, color: VIZ.status.selection.color},
                        ]}
                        limit={3}
                    />

                    <BarList
                        title="Annual saving by organisation"
                        subtitle="Green reduces run-rate; red increases it"
                        format={signed}
                        rows={toSignedRows(m.byOrg)}
                        limit={10}
                        legend={[
                            {label: 'Reduction', color: VIZ.positive},
                            {label: 'Increase', color: VIZ.negative},
                        ]}
                    />

                    <BarList
                        title="Annual saving by country"
                        subtitle="Cost base differs by market"
                        format={signed}
                        rows={toSignedRows(m.byCountry)}
                        limit={10}
                    />
                </div>

                <CashCurve
                    title="Cumulative cash position"
                    subtitle={`One-off cost lands first; the benefit ramps in from month ${FINANCE.benefitRampStartMonth} and is fully realised by month ${FINANCE.benefitRampEndMonth}`}
                    months={flow.months}
                    paybackMonths={flow.paybackMonths}
                    horizonMonths={flow.horizonMonths}
                    format={money}
                />

                <div className="panel-grid">
                    <div className="panel-span-2">
                        <div className="panel">
                            <div className="panel-head">
                                <div>
                                    <div className="panel-title">Scenario comparison</div>
                                    <div className="panel-sub">
                                        Variations on the <em>same</em> design, not separately designed
                                        options — each scales the modelled change to show which lever
                                        moves the answer.
                                    </div>
                                </div>
                            </div>
                            <div className="wc-table-wrap">
                                <table className="wc-table scenario-table">
                                    <thead>
                                        <tr>
                                            <th>Scenario</th>
                                            <th className="num">Annual benefit</th>
                                            <th className="num">One-off</th>
                                            <th className="num">Net year 1</th>
                                            <th className="num">Payback</th>
                                            <th className="num">NPV {FINANCE.horizonMonths / 12}y</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scenarios.map(v => (
                                            <tr key={v.key} className={v.key === 'designed' ? 'is-consult' : ''}>
                                                <td>
                                                    <span className="scenario-name">{v.label}</span>
                                                    <span className="scenario-note">{v.note}</span>
                                                </td>
                                                <td className="num">{money(v.grossAnnual)}</td>
                                                <td className="num">{money(v.oneOff)}</td>
                                                <td className={`num ${v.netYearOne >= 0 ? 'pos' : 'neg'}`}>
                                                    {signed(v.netYearOne)}
                                                </td>
                                                <td className="num">{fmtMonths(v.paybackMonths)}</td>
                                                <td className={`num strong ${v.npv >= 0 ? 'pos' : 'neg'}`}>
                                                    {signed(v.npv)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <BarList
                        title="What the answer is most exposed to"
                        subtitle="Swing in net year one when one assumption moves, biggest first"
                        format={money}
                        rows={swings.map(sw => ({
                            label: `${sw.label} ±${Math.round(sw.delta * 100)}%`,
                            value: sw.swing,
                            color: VIZ.status.selection.color,
                        }))}
                        limit={6}
                    />
                </div>

                <div className="assumptions">
                    <div className="assumptions-head">
                        <span className="panel-title">Assumptions</span>
                        <span className="panel-sub">
                            Modelled, not actuals. Change these in <code>frontend/config.js</code>.
                        </span>
                    </div>
                    <div className="assumptions-grid">
                        <div className="assumption">
                            <span className="assumption-label">Cost per FTE</span>
                            <span className="assumption-value">
                                {Object.entries(RATE_CARD.byCountry)
                                    .map(([k, v]) => `${k} ${fmtMoney(v)}`).join(' · ')}
                            </span>
                        </div>
                        <div className="assumption">
                            <span className="assumption-label">Seniority uplift</span>
                            <span className="assumption-value">
                                {Object.entries(RATE_CARD.levelUplift)
                                    .map(([k, v]) => `${tierLabel(k)} ×${v}`).join(' · ')}
                            </span>
                        </div>
                        <div className="assumption">
                            <span className="assumption-label">Severance</span>
                            <span className="assumption-value">
                                {RATE_CARD.severanceMonths} months per at-risk FTE
                                · {fmtNum(m.riskFte)} FTE affected
                            </span>
                        </div>
                        <div className="assumption">
                            <span className="assumption-label">Hiring &amp; transition</span>
                            <span className="assumption-value">
                                {fmtMoney(RATE_CARD.recruitmentCostPerHire)} per hire
                                ({fmtNum(m.postedFte)} roles)
                                · {fmtMoney(RATE_CARD.transitionCostPerFte)} per FTE in transition
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
