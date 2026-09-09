// The hierarchical DLT filter — DLT → DLT-1 → … → slide.
//
// Selection is tracked as a set of slide titles (the leaves). Checking a
// branch selects every slide under it; a branch shows indeterminate when only
// some of its slides are selected, so partial state is visible rather than
// silently rounded to on or off.

import {useState, useMemo, useCallback, useRef, useEffect} from 'react';

function Node({node, selected, onToggle, depth}) {
    const [open, setOpen] = useState(depth < 1);
    const boxRef = useRef(null);

    const total = node.slideTitles.length;
    const chosen = node.slideTitles.filter(t => selected.has(t)).length;
    const all = total > 0 && chosen === total;
    const some = chosen > 0 && chosen < total;

    // `indeterminate` is a DOM property, not an attribute — React can't set it.
    useEffect(() => {
        if (boxRef.current) boxRef.current.indeterminate = some;
    }, [some]);

    const hasChildren = node.children.length > 0;

    return (
        <div className="ft-node" style={{paddingLeft: depth ? 12 : 0}}>
            <div className="ft-row">
                {hasChildren ? (
                    <button
                        className="ft-caret"
                        onClick={() => setOpen(o => !o)}
                        title={open ? 'Collapse' : 'Expand'}
                    >
                        {open ? '▾' : '▸'}
                    </button>
                ) : <span className="ft-caret ft-caret-empty" />}
                <label className="ft-label">
                    <input
                        ref={boxRef}
                        type="checkbox"
                        checked={all}
                        onChange={() => onToggle(node.slideTitles, !all)}
                    />
                    <span className="ft-text">{node.label}</span>
                    {node.level && <span className="ft-level">{node.level}</span>}
                    <span className="ft-count">{total}</span>
                </label>
            </div>
            {hasChildren && open && (
                <div className="ft-children">
                    {node.children.map(child => (
                        <Node key={child.label} node={child} selected={selected}
                            onToggle={onToggle} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function FilterTree({tree, allSlideTitles, selected, onChange}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const toggle = useCallback((titles, on) => {
        const next = new Set(selected);
        titles.forEach(t => { if (on) next.add(t); else next.delete(t); });
        onChange(next);
    }, [selected, onChange]);

    // Search prunes the tree to branches that still contain a match, so the
    // path to a deeply-nested org stays visible while you type.
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return tree;
        const prune = node => {
            const kids = node.children.map(prune).filter(Boolean);
            const hit = node.label.toLowerCase().includes(needle);
            if (!hit && kids.length === 0) return null;
            return {...node, children: hit ? node.children : kids};
        };
        return tree.map(prune).filter(Boolean);
    }, [tree, q]);

    const count = selected.size;
    const isAll = count === 0 || count === allSlideTitles.length;

    return (
        <div className="filter-wrap" ref={ref}>
            <button
                className={`tb-btn ${isAll ? '' : 'tb-btn-active'}`}
                onClick={() => setOpen(o => !o)}
                title="Filter by organization"
            >
                Organization{isAll ? '' : ` (${count})`} ▾
            </button>
            {open && (
                <div className="menu filter-menu filter-menu-wide" onClick={e => e.stopPropagation()}>
                    <input
                        className="filter-search"
                        value={q}
                        placeholder="Search organizations…"
                        onChange={e => setQ(e.target.value)}
                        autoFocus
                    />
                    <div className="filter-actions">
                        <button onClick={() => onChange(new Set(allSlideTitles))}>Select all</button>
                        <button onClick={() => onChange(new Set())}>Clear</button>
                    </div>
                    <div className="filter-list ft-list">
                        {shown.length === 0 && <div className="filter-empty">No matches</div>}
                        {shown.map(node => (
                            <Node key={node.label} node={node} selected={selected}
                                onToggle={toggle} depth={0} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
