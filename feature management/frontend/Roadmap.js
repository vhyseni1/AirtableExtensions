import {expandRecord} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {PHASE_GROUPS, PHASE_COLORS} from './constants';
import {Tag, ProgressBar, KpiCard, StatusChip} from './components';
import {useDrill, DrillDrawer} from './drill';

function PipelineRail({phaseCounts, onPick}) {
    return (
        <div className="fp-rail" role="list" aria-label="Pipeline phases">
            {PHASE_GROUPS.map((p, i) => (
                <div className="fp-rail-seg" role="listitem" key={p}>
                    <div className="fp-rail-card clickable" onClick={() => onPick(p)} title={`See ${p} attributes`}>
                        <div className="fp-rail-count" style={{color: PHASE_COLORS[p]}}>{phaseCounts[p] || 0}</div>
                        <div className="fp-rail-name">{p}</div>
                    </div>
                    {i < PHASE_GROUPS.length - 1 && <div className="fp-rail-arrow" aria-hidden>→</div>}
                </div>
            ))}
        </div>
    );
}

function heatBg(phase, count, max) {
    if (!count) return 'transparent';
    const hex = PHASE_COLORS[phase] || '#64748b';
    const alpha = 0.18 + 0.6 * (max ? count / max : 0);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function FeatureRow({feature, agg, maxCell, onFeature, onCell}) {
    const furthestIdx = agg.furthest >= 0 ? agg.furthest : 0;
    return (
        <div className="fp-rm-row">
            <div className="fp-rm-name clickable" onClick={() => onFeature(feature)} title="See attributes">
                <div className="fp-rm-feature">{feature.name}</div>
                <div className="fp-rm-sub">
                    {feature.priority && <Tag>{feature.priority}</Tag>}
                    {feature.status && <Tag>{feature.status}</Tag>}
                </div>
            </div>

            <div className="fp-rm-track" role="img" aria-label={`${feature.name}: ${agg.pct}% mature, furthest phase ${agg.furthestPhase || 'none'}`}>
                {PHASE_GROUPS.map((p, i) => {
                    const c = agg.phase[p] || 0;
                    const reached = i <= furthestIdx && agg.total > 0;
                    return (
                        <div
                            key={p}
                            className={`fp-rm-cell${reached ? ' reached' : ''}${c ? ' clickable' : ''}`}
                            style={{backgroundColor: heatBg(p, c, maxCell), borderBottomColor: PHASE_COLORS[p]}}
                            title={`${p}: ${c}`}
                            onClick={c ? () => onCell(feature, p) : undefined}
                        >
                            {c || ''}
                        </div>
                    );
                })}
            </div>

            <div className="fp-rm-meta">
                <ProgressBar pct={agg.pct} color={agg.furthestPhase ? PHASE_COLORS[agg.furthestPhase] : '#22c55e'} />
                <div className="fp-rm-figures">
                    <span className="fp-rm-pct">{agg.pct}%</span>
                    {feature.goLive && <span className="fp-rm-date">🏁 {feature.goLive}</span>}
                </div>
            </div>
        </div>
    );
}

export default function Roadmap({model}) {
    const {initiatives, byFeature, phaseCounts, kpis, handshakes, attrs, features} = model;
    const drill = useDrill();
    const attrsOf = useMemo(() => name => attrs.filter(a => a.featureName === name), [attrs]);

    let maxCell = 0;
    Object.values(byFeature).forEach(v => PHASE_GROUPS.forEach(p => (maxCell = Math.max(maxCell, v.phase[p] || 0))));

    const initiativeNames = Object.keys(initiatives).sort((a, b) =>
        a === 'Ungrouped' ? 1 : b === 'Ungrouped' ? -1 : a.localeCompare(b),
    );

    const onFeature = f => drill.openAttrs(`${f.name} · attributes`, attrsOf(f.name));
    const onCell = (f, p) => drill.openAttrs(`${f.name} · ${p}`, attrsOf(f.name).filter(a => a.phase === p));
    const onPhase = p => drill.openAttrs(`${p} phase`, attrs.filter(a => a.phase === p));

    return (
        <div className="fp-mode">
            <PipelineRail phaseCounts={phaseCounts} onPick={onPhase} />

            <div className="fp-kpis">
                <KpiCard label="Active" value={kpis.active} onClick={() => drill.openAttrs('Active', attrs.filter(a => a.isActive))} />
                <KpiCard label="Awaiting review" value={kpis.awaitingReview} accent="#f59e0b" onClick={() => drill.openAttrs('Awaiting review', attrs.filter(a => a.isAwaitingReview))} />
                <KpiCard label="Blocked" value={kpis.blocked} accent="#ef4444" onClick={() => drill.openAttrs('Blocked', attrs.filter(a => a.isBlocked))} />
                <KpiCard label="Ready to push" value={kpis.readyToPush} accent="#22c55e" onClick={() => drill.openAttrs('Ready to push', attrs.filter(a => a.isReadyToPush))} />
                <KpiCard label="Delivered features" value={kpis.deliveredFeatures} onClick={() => drill.openFeatures('Delivered features', features.filter(f => f.health === 'delivered'))} />
                <KpiCard label="Overall maturity" value={`${kpis.overallPct}%`} onClick={() => drill.openFeatures('All features', features)} />
            </div>

            <div className="fp-section-title">Pipeline Tracker — features by initiative</div>
            <div className="fp-rm-head">
                <div className="fp-rm-name" />
                <div className="fp-rm-track">
                    {PHASE_GROUPS.map(p => (
                        <div key={p} className="fp-rm-colhead" style={{color: PHASE_COLORS[p]}}>{p}</div>
                    ))}
                </div>
                <div className="fp-rm-meta fp-muted fp-small">Maturity · go-live</div>
            </div>

            {initiativeNames.map(init => (
                <div className="fp-initiative" key={init}>
                    <div className="fp-initiative-head clickable" onClick={() => drill.openFeatures(init, initiatives[init])}>{init}</div>
                    {initiatives[init].map(f => (
                        <FeatureRow
                            key={f.id}
                            feature={f}
                            agg={byFeature[f.name] || {phase: {}, pct: 0, furthest: -1, total: 0}}
                            maxCell={maxCell}
                            onFeature={onFeature}
                            onCell={onCell}
                        />
                    ))}
                </div>
            ))}

            {initiativeNames.length === 0 && <div className="fp-muted">No features found.</div>}

            <div className="fp-section-title">Recent handshakes</div>
            <ul className="fp-feed fp-feed-row">
                {handshakes.slice(0, 10).map(h => (
                    <li key={h.id} className="clickable" onClick={() => expandRecord(h.record)} title="Open handshake record">
                        <div className="fp-feed-top">
                            <StatusChip status={h.action} />
                            <span className="fp-feed-ts">{h.timestamp}</span>
                        </div>
                        <div className="fp-feed-route">{h.fromTeam} <span aria-hidden>→</span> {h.toTeam}</div>
                        <div className="fp-feed-sub">{h.feature} · {h.stage} · {h.decisionMaker}</div>
                    </li>
                ))}
                {handshakes.length === 0 && <li className="fp-muted">No handshakes yet.</li>}
            </ul>

            <DrillDrawer drill={drill} attrsOf={attrsOf} />
        </div>
    );
}
