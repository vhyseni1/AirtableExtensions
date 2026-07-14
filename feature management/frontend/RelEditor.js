import {useMemo, useState} from 'react';
import {linkAddressedBy, forkOutCreate} from './actions';

// Reusable modal to build attribute relationships from any view:
//   • Address by — link an existing attribute that resolves this one.
//   • Fork out   — create N new downstream attributes and link them.
// `initialMode` = 'menu' | 'address' | 'fork'.
export default function RelEditor({model, attr, initialMode = 'menu', onClose}) {
    const [mode, setMode] = useState(initialMode);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    // Address-by state
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(() => new Set());
    const already = useMemo(() => new Set(attr.addressedBy.map(x => x.id)), [attr.addressedBy]);
    const candidates = useMemo(
        () => model.attrs.filter(a => a.id !== attr.id && !already.has(a.id)),
        [model.attrs, attr.id, already],
    );
    const filtered = candidates.filter(a =>
        `${a.businessName} ${a.attributeId} ${a.featureName}`.toLowerCase().includes(q.trim().toLowerCase()),
    );

    // Fork-out state
    const [count, setCount] = useState(2);
    const [names, setNames] = useState(['', '']);
    const setCountSafe = n => {
        const v = Math.max(1, Math.min(8, Number.isFinite(n) ? n : 1));
        setCount(v);
        setNames(prev => {
            const a = prev.slice(0, v);
            while (a.length < v) a.push('');
            return a;
        });
    };

    async function run(fn) {
        setBusy(true);
        setErr(null);
        try {
            await fn();
            onClose();
        } catch (e) {
            setErr(e.message || 'Action failed.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fp-modal-backdrop" onClick={onClose}>
            <div className="fp-modal fp-rel-modal" onClick={e => e.stopPropagation()}>
                <div className="fp-rel-modal-head">
                    <div>
                        <div className="fp-rel-modal-kicker">Relate attribute</div>
                        <h3>{attr.businessName || attr.attributeId}</h3>
                    </div>
                    <button type="button" className="fp-drawer-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                {err && <div className="fp-toast err" role="status">{err}</div>}

                {mode === 'menu' && (
                    <div className="fp-rel-menu">
                        <button type="button" className="fp-rel-opt" onClick={() => setMode('address')}>
                            <span className="fp-rel-opt-ic in">↳</span>
                            <span><b>Address by</b><em>Link an existing attribute that resolves / satisfies this one</em></span>
                        </button>
                        <button type="button" className="fp-rel-opt" onClick={() => setMode('fork')}>
                            <span className="fp-rel-opt-ic out">⑂</span>
                            <span><b>Fork out</b><em>Create new downstream attributes that branch from this one</em></span>
                        </button>
                    </div>
                )}

                {mode === 'address' && (
                    <div className="fp-rel-body">
                        <input className="fp-rel-search" placeholder="Search attributes to link…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
                        <ul className="fp-rel-list">
                            {filtered.slice(0, 60).map(a => (
                                <li
                                    key={a.id}
                                    className={`fp-rel-pick${sel.has(a.id) ? ' on' : ''}`}
                                    onClick={() => setSel(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                                >
                                    <span className="fp-rel-check">{sel.has(a.id) ? '✓' : ''}</span>
                                    <span className="fp-rel-pick-main">
                                        <b>{a.businessName || a.attributeId}</b>
                                        <em>{a.featureName} · {a.currentStageName}</em>
                                    </span>
                                </li>
                            ))}
                            {filtered.length === 0 && <li className="fp-muted" style={{padding: '12px'}}>No matching attributes.</li>}
                        </ul>
                        <div className="fp-actions">
                            <button type="button" className="accept" disabled={busy || sel.size === 0} onClick={() => run(() => linkAddressedBy(model, attr, [...sel]))}>
                                {busy ? 'Linking…' : `Link ${sel.size || ''}`.trim()}
                            </button>
                            {initialMode === 'menu' && <button type="button" className="ghost" onClick={() => setMode('menu')}>Back</button>}
                            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                )}

                {mode === 'fork' && (
                    <div className="fp-rel-body">
                        <label className="fp-rel-count">
                            How many attributes does this fork into?
                            <input type="number" min={1} max={8} value={count} onChange={e => setCountSafe(parseInt(e.target.value, 10))} />
                        </label>
                        <div className="fp-rel-names">
                            {names.map((nm, i) => (
                                <input
                                    key={i}
                                    className="fp-rel-name"
                                    placeholder={`New attribute #${i + 1} — name (optional)`}
                                    value={nm}
                                    onChange={e => setNames(prev => { const a = [...prev]; a[i] = e.target.value; return a; })}
                                />
                            ))}
                        </div>
                        <p className="fp-muted fp-small">New attributes are created on <b>{attr.featureName || 'the same feature'}</b> at stage 1 (Business Requirements) and linked back to this one. Rename or refine them in the grid afterwards.</p>
                        <div className="fp-actions">
                            <button type="button" className="accept" disabled={busy} onClick={() => run(() => forkOutCreate(model, attr, names))}>
                                {busy ? 'Creating…' : `Create ${count} & link`}
                            </button>
                            {initialMode === 'menu' && <button type="button" className="ghost" onClick={() => setMode('menu')}>Back</button>}
                            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
