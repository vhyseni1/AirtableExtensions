// Why is half the menu disabled?
//
// This view exists because the failure it diagnoses is invisible from the
// outside: a table the extension cannot see and a table whose name does not
// match look identical from the menu — both just leave an item greyed out.
//
// It is always reachable, even when every optional table is missing, because
// that is exactly when it is needed.

import {TABLES} from '../config';
import {findTable} from '../lib/fields';

function Row({label, want, table, isPeople}) {
    const found = !!table;
    // findTable falls back to the first table in the base when the name does
    // not match, so "resolved to the people table" means "not found" for
    // everything except the people table itself.
    const fellBack = found && !isPeople && table.name !== want;
    const state = !found ? 'missing' : (fellBack ? 'mismatch' : 'ok');
    const copy = {
        ok: 'Resolved',
        missing: 'Not visible to this extension',
        mismatch: `Matched "${table.name}" by fallback, not by name`,
    }[state];

    return (
        <tr className={state === 'ok' ? '' : 'is-consult'}>
            <td><span className="diag-label">{label}</span></td>
            <td><code className="diag-code">{want}</code></td>
            <td>
                <span className={`pill ${state === 'ok' ? 'pill-muted' : 'pill-critical'}`}>
                    {state === 'ok' ? '● ' : '○ '}{copy}
                </span>
            </td>
        </tr>
    );
}

export default function Diagnostics({base, peopleTable}) {
    const visible = (base && base.tables) || [];

    // The single most useful fact on this screen: an interface extension sees
    // only the tables it has been given, not every table in the base.
    const onlyOne = visible.length <= 1;

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-eyebrow">Setup</span>
                    <h2 className="toolbar-heading">Diagnostics</h2>
                </div>
                <div className="toolbar-right">
                    <span className="toolbar-label">
                        {visible.length} table{visible.length !== 1 ? 's' : ''} visible
                    </span>
                </div>
            </div>

            <div className="dashboard-scroll">
                {onlyOne && (
                    <div className="panel diag-callout">
                        <div className="panel-title">This extension can only see one table</div>
                        <p className="diag-para">
                            Adding a table to the <strong>base</strong> is not the same as giving it
                            to the <strong>extension</strong>. An interface extension reads only the
                            tables configured as its data sources, so every view that needs another
                            table stays disabled until that table is added as a source in the
                            interface designer.
                        </p>
                    </div>
                )}

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Tables this extension can see</div>
                            <div className="panel-sub">
                                Exactly what <code>useBase().tables</code> returns right now. If a
                                table you imported is not on this list, the extension has not been
                                given it.
                            </div>
                        </div>
                    </div>
                    {visible.length === 0
                        ? <div className="panel-empty">None.</div>
                        : (
                            <ul className="diag-list">
                                {visible.map(t => (
                                    <li key={t.id}>
                                        <code className="diag-code">{t.name}</code>
                                        <span className="diag-id">{t.id}</span>
                                        <span className="diag-count">
                                            {t.fields ? `${t.fields.length} fields` : ''}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                </div>

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">What each configured name resolved to</div>
                            <div className="panel-sub">
                                Names come from <code>frontend/config.js</code>. Matching ignores
                                case, spacing and punctuation — but not different words.
                            </div>
                        </div>
                    </div>
                    <div className="wc-table-wrap">
                        <table className="wc-table">
                            <thead>
                                <tr><th>View group</th><th>Configured name</th><th>Result</th></tr>
                            </thead>
                            <tbody>
                                {TABLES.map(t => {
                                    const resolved = findTable(base, t.name);
                                    const isPeople = t.key === 'people';
                                    // Mirror the shell's rule: anything that
                                    // resolves to the people table by fallback
                                    // counts as absent.
                                    const effective = isPeople
                                        ? resolved
                                        : (resolved && peopleTable && resolved.id === peopleTable.id
                                            ? null : resolved);
                                    return (
                                        <Row key={t.key} label={t.label} want={t.name}
                                            table={effective} isPeople={isPeople} />
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-head">
                        <div><div className="panel-title">If a table is listed above but not resolving</div></div>
                    </div>
                    <ol className="diag-steps">
                        <li>
                            Compare the name in the first panel with the configured name in the
                            second. They must be the same words — <code>Org Design Data</code> does
                            not match a table called <code>Org Design</code>.
                        </li>
                        <li>
                            Either rename the table in Airtable to match, or change the name in
                            <code> frontend/config.js</code> to match the table, and release again.
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
