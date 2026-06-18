import {PHASE_COLORS, STATUS_COLORS} from './constants';

// Small colored chip for a status value.
export function StatusChip({status}) {
    const bg = STATUS_COLORS[status] || '#cbd5e1';
    return (
        <span className="fp-chip" style={{backgroundColor: bg}}>
            {status || '—'}
        </span>
    );
}

// Phase tag (text colored to the phase).
export function PhaseTag({phase}) {
    const color = PHASE_COLORS[phase] || '#64748b';
    return (
        <span className="fp-phase-tag" style={{color, borderColor: color}}>
            {phase}
        </span>
    );
}

// Generic outline chip (feature, team, environment…).
export function Tag({children, title}) {
    return (
        <span className="fp-tag" title={title}>
            {children}
        </span>
    );
}

export function KpiCard({label, value, accent}) {
    return (
        <div className="fp-kpi">
            <div className="fp-kpi-value" style={accent ? {color: accent} : undefined}>
                {value}
            </div>
            <div className="fp-kpi-label">{label}</div>
        </div>
    );
}

// A horizontal completion bar.
export function ProgressBar({pct, color}) {
    return (
        <div className="fp-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="fp-progress-fill" style={{width: `${pct}%`, backgroundColor: color || '#22c55e'}} />
        </div>
    );
}

// Read-only acceptance checklist.
export function AcceptanceList({items}) {
    if (!items || !items.length) return <div className="fp-muted">No acceptance criteria.</div>;
    return (
        <ul className="fp-accept">
            {items.map((it, i) => (
                <li key={i} className={it.done ? 'done' : ''}>
                    <span className="fp-accept-box" aria-hidden>{it.done ? '✓' : '○'}</span>
                    <span>{it.text}</span>
                </li>
            ))}
        </ul>
    );
}

// Setup banner shown when the field contract doesn't match the base.
export function SetupBanner({missing}) {
    const tablesMissing = missing.filter(m => m.field === null);
    const fieldsMissing = missing.filter(m => m.field !== null);
    return (
        <div className="fp-setup">
            <h2>Base doesn’t match the field contract</h2>
            <p>
                This extension binds to specific table and field names. Fix the mismatches
                below (rename in the base, or update <code>constants.js</code>) and it will
                render. Names are exact-match-sensitive — watch punctuation like
                <code> Acceptance Met?</code> and <code> Comments / Handoff Notes</code>.
            </p>
            {tablesMissing.length > 0 && (
                <div>
                    <h3>Missing tables</h3>
                    <ul>{tablesMissing.map((m, i) => <li key={i}><code>{m.table}</code></li>)}</ul>
                </div>
            )}
            {fieldsMissing.length > 0 && (
                <div>
                    <h3>Missing fields</h3>
                    <ul>
                        {fieldsMissing.map((m, i) => (
                            <li key={i}><code>{m.table}</code> → <code>{m.field}</code></li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
