// Small, reusable toolbar controls shared by the chart and data views.

import {useState, useRef, useEffect, useMemo, useCallback} from 'react';

// Close a popover when the user clicks outside it.
function useClickOutside(ref, active, close) {
    useEffect(() => {
        if (!active) return;
        const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) close(); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [ref, active, close]);
}

// ─── Searchable multi-select filter ──────────────────────────────────────────
// options: array of {value, label, sub?, vacant?}

export function CheckboxFilter({label, options, selected, onChange}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useClickOutside(ref, open, () => setOpen(false));

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return options;
        return options.filter(o =>
            o.label.toLowerCase().includes(needle) ||
            (o.sub && o.sub.toLowerCase().includes(needle)));
    }, [q, options]);

    const toggle = useCallback(value => {
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange(next);
    }, [selected, onChange]);

    const count = selected.size;

    return (
        <div className="filter-wrap" ref={ref}>
            <button
                className={`tb-btn ${count > 0 ? 'tb-btn-active' : ''}`}
                onClick={() => setOpen(o => !o)}
                title={`Filter by ${label}`}
            >
                {label}{count > 0 ? ` (${count})` : ''} ▾
            </button>
            {open && (
                <div className="menu filter-menu" onClick={e => e.stopPropagation()}>
                    <input
                        className="filter-search"
                        value={q}
                        placeholder={`Search ${label.toLowerCase()}…`}
                        onChange={e => setQ(e.target.value)}
                        autoFocus
                    />
                    <div className="filter-actions">
                        <button onClick={() => onChange(new Set(filtered.map(o => o.value)))}>
                            Select shown
                        </button>
                        <button onClick={() => onChange(new Set())}>Clear</button>
                    </div>
                    <div className="filter-list">
                        {filtered.length === 0 && <div className="filter-empty">No matches</div>}
                        {filtered.map(o => (
                            <label key={o.value} className="filter-option">
                                <input
                                    type="checkbox"
                                    checked={selected.has(o.value)}
                                    onChange={() => toggle(o.value)}
                                />
                                <span className="filter-option-text">
                                    <span className={`filter-option-label${o.vacant ? ' vacant' : ''}`}>{o.label}</span>
                                    {o.sub && <span className="filter-option-sub">{o.sub}</span>}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Type-ahead search over people nodes ─────────────────────────────────────

export function SearchBox({nodeMap, onJump, placeholder = 'Search people…'}) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useClickOutside(ref, true, () => setOpen(false));

    const matches = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return [];
        const out = [];
        for (const n of Object.values(nodeMap)) {
            if (
                n.displayName.toLowerCase().includes(needle) ||
                (n.jobTitle && n.jobTitle.toLowerCase().includes(needle)) ||
                (n.department && n.department.toLowerCase().includes(needle))
            ) {
                out.push(n);
                if (out.length >= 30) break;
            }
        }
        return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [q, nodeMap]);

    return (
        <div className="search-wrap" ref={ref}>
            <input
                className="search-input"
                value={q}
                placeholder={placeholder}
                onChange={e => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
            />
            {open && q.trim() && (
                <div className="menu search-menu">
                    {matches.length === 0 && <div className="search-empty">No matches</div>}
                    {matches.map(n => (
                        <button key={n.id} onClick={() => { onJump(n.id); setOpen(false); setQ(''); }}>
                            <span className="search-name">{n.displayName}</span>
                            {n.jobTitle && <span className="search-meta">{n.jobTitle}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Export dropdown ─────────────────────────────────────────────────────────
// items: array of {label, run} — `run` may be async.

export function ExportMenu({items, label = 'Export' }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const ref = useRef(null);
    useClickOutside(ref, open, () => setOpen(false));

    const run = useCallback(async fn => {
        setBusy(true);
        setOpen(false);
        try {
            await fn();
        } catch (err) {
            window.alert('Export failed: ' + (err && err.message ? err.message : err));
        } finally {
            setBusy(false);
        }
    }, []);

    return (
        <div className="export-wrap" ref={ref}>
            <button className="tb-btn" onClick={() => setOpen(o => !o)} disabled={busy} title={label}>
                {busy ? 'Exporting…' : `${label} ▾`}
            </button>
            {open && (
                <div className="menu">
                    {items.map(item => (
                        <button key={item.label} onClick={() => run(item.run)}>{item.label}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Toggle switch ───────────────────────────────────────────────────────────

export function ToggleSwitch({checked, onChange, label, title}) {
    return (
        <label className="switch-wrap" title={title}>
            {label && <span className="switch-label">{label}</span>}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                className={`toggle-switch ${checked ? 'on' : 'off'}`}
                onClick={() => onChange(!checked)}
            >
                <span className="toggle-switch-knob" />
            </button>
        </label>
    );
}
