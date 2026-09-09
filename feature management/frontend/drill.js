import {expandRecord} from '@airtable/blocks/interface/ui';
import {useState} from 'react';
import {StatusChip, HealthDot, attrHealth} from './components';

const fmtDate = ms => (ms == null ? '—' : new Date(ms).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}));

// Shared drill-down state. Every tab uses this so any number/card can open a
// filtered list, and any list row opens the underlying Airtable record.
export function useDrill() {
    const [stack, setStack] = useState([]);
    return {
        stack,
        openInitiatives: (title, items) => setStack([{title, type: 'initiatives', items}]),
        openFeatures: (title, items) => setStack([{title, type: 'features', items}]),
        openAttrs: (title, items) => setStack([{title, type: 'attrs', items}]),
        pushFeatures: (title, items) => setStack(s => [...s, {title, type: 'features', items}]),
        pushAttrs: (title, items) => setStack(s => [...s, {title, type: 'attrs', items}]),
        back: () => setStack(s => s.slice(0, -1)),
        close: () => setStack([]),
    };
}

// `attrsOf(featureName)` lets feature rows drill into their attributes.
// `colorOf(initiative)` is optional (used for the progress bar tint).
export function DrillDrawer({drill, attrsOf, colorOf}) {
    const {stack, back, close, pushAttrs, pushFeatures} = drill;
    if (!stack.length) return null;
    const frame = stack[stack.length - 1];
    const tint = colorOf || (() => '#E60000');
    const onFeature = f => pushAttrs(`${f.name} · attributes`, attrsOf ? attrsOf(f.name) : []);
    const onInitiative = it => pushFeatures(`${it.name} · features`, it.features || []);

    return (
        <div className="fp-drawer-backdrop" onClick={close}>
            <aside className="fp-drawer" onClick={e => e.stopPropagation()}>
                <div className="fp-drawer-head">
                    <div className="fp-crumbs">
                        {stack.length > 1 && <button type="button" className="fp-crumb-back" onClick={back}>← Back</button>}
                        <span className="fp-drawer-title">{frame.title}</span>
                        <span className="fp-col-count">{frame.items.length}</span>
                    </div>
                    <button type="button" className="fp-drawer-close" onClick={close} aria-label="Close">×</button>
                </div>
                <div className="fp-drawer-hint">{frame.type === 'initiatives' ? 'Click an initiative to see its features' : frame.type === 'features' ? 'Click a feature to see its attributes · ↗ opens the feature record' : 'Click an attribute to open its record'}</div>
                <ul className="fp-drawer-list">
                    {frame.type === 'initiatives'
                        ? frame.items.map(it => (
                            <li key={it.name} className="fp-drawer-row clickable" onClick={() => onInitiative(it)}>
                                <span className="fp-dr-badge">Initiative</span>
                                <div className="fp-dr-main">
                                    <div className="fp-dr-title">{it.name}</div>
                                    <div className="fp-dr-sub">{it.featureCount} feature{it.featureCount === 1 ? '' : 's'} · {it.attrCount} attrs</div>
                                </div>
                                <span className="fp-feat-bar"><i style={{width: `${it.pct}%`, background: tint(it.name)}} /></span>
                                <span className="fp-feat-pct">{it.pct}%</span>
                            </li>
                        ))
                        : frame.type === 'features'
                            ? frame.items.map(f => (
                            <li key={f.id} className="fp-drawer-row clickable" onClick={() => onFeature(f)}>
                                <HealthDot health={f.health} />
                                <div className="fp-dr-main">
                                    <div className="fp-dr-title">{f.name}</div>
                                    <div className="fp-dr-sub">{f.initiative} · {f.total} attrs · go-live {fmtDate(f.goLiveMs)}</div>
                                </div>
                                <span className="fp-feat-bar"><i style={{width: `${f.pct}%`, background: tint(f.initiative)}} /></span>
                                <span className="fp-feat-pct">{f.pct}%</span>
                                <button type="button" className="fp-dr-open" title="Open feature record" onClick={e => { e.stopPropagation(); expandRecord(f.record); }}>↗</button>
                            </li>
                        ))
                        : frame.items.map(a => (
                            <li key={a.id} className="fp-drawer-row clickable" onClick={() => expandRecord(a.record)} title="Open record">
                                <HealthDot health={attrHealth(a)} />
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
