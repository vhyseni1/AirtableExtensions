import {useMemo} from 'react';

const EMPTY = {entity: '', initiative: '', feature: '', milestone: ''};
const uniq = arr => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));

function Sel({label, value, opts, onChange}) {
    return (
        <label className="fp-filter-sel">
            <span>{label}</span>
            <select value={value} onChange={e => onChange(e.target.value)}>
                <option value="">All</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </label>
    );
}

// Top-bar filter shared across Overview / By team / Workflow / Traceability.
// Options cascade: each select is narrowed by the selections above it, and
// changing a higher level clears the lower ones (which no longer apply).
export default function FilterBar({model, sel, onChange, matchCount}) {
    const feats = model.features;
    const entities = useMemo(() => uniq(feats.map(f => f.entity)), [feats]);
    const initiatives = useMemo(
        () => uniq(feats.filter(f => !sel.entity || f.entity === sel.entity).map(f => f.initiative)),
        [feats, sel.entity],
    );
    const features = useMemo(
        () => uniq(feats
            .filter(f => (!sel.entity || f.entity === sel.entity) && (!sel.initiative || f.initiative === sel.initiative))
            .map(f => f.name)),
        [feats, sel.entity, sel.initiative],
    );
    const milestones = useMemo(
        () => uniq(feats
            .filter(f => (!sel.entity || f.entity === sel.entity)
                && (!sel.initiative || f.initiative === sel.initiative)
                && (!sel.feature || f.name === sel.feature))
            .map(f => f.milestone || 'No milestone')),
        [feats, sel.entity, sel.initiative, sel.feature],
    );

    const set = (key, val) => {
        const next = {...sel, [key]: val};
        if (key === 'entity') { next.initiative = ''; next.feature = ''; next.milestone = ''; }
        if (key === 'initiative') { next.feature = ''; next.milestone = ''; }
        if (key === 'feature') { next.milestone = ''; }
        onChange(next);
    };
    const active = sel.entity || sel.initiative || sel.feature || sel.milestone;

    return (
        <div className="fp-filterbar">
            <span className="fp-filterbar-icon" aria-hidden>⛃</span>
            <Sel label="Entity" value={sel.entity} opts={entities} onChange={v => set('entity', v)} />
            <Sel label="Initiative" value={sel.initiative} opts={initiatives} onChange={v => set('initiative', v)} />
            <Sel label="Feature" value={sel.feature} opts={features} onChange={v => set('feature', v)} />
            <Sel label="Milestone" value={sel.milestone} opts={milestones} onChange={v => set('milestone', v)} />
            {active && (
                <>
                    <span className="fp-filterbar-count">{matchCount} feature{matchCount === 1 ? '' : 's'}</span>
                    <button type="button" className="fp-filterbar-clear" onClick={() => onChange({...EMPTY})}>Clear</button>
                </>
            )}
        </div>
    );
}

export {EMPTY as EMPTY_FILTER};
