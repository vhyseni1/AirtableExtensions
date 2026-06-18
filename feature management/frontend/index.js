import {initializeBlock, useBase} from '@airtable/blocks/interface/ui';
import {useState} from 'react';
import {TABLES} from './constants';
import {useModel} from './data';
import {SetupBanner} from './components';
import Executive from './Executive';
import Roadmap from './Roadmap';
import TeamView from './TeamView';
import Workflow from './Workflow';
import './style.css';

const MODES = [
    {key: 'exec', label: 'Executive overview'},
    {key: 'roadmap', label: 'Pipeline Tracker Overview'},
    {key: 'team', label: 'By team'},
    {key: 'workflow', label: 'Workflow'},
];

// The data-loading shell. Only mounted once every table exists, so useModel()'s
// useRecords() calls never receive a null table (interface useRecords reads
// table.id and throws on null).
function Dashboard() {
    const model = useModel();
    const [mode, setMode] = useState('exec');

    return (
        <>
            <header className="fp-header">
                <div className="fp-brand"><span className="fp-logo">UBS</span> Finance Data Programme</div>
                <div className="fp-modeswitch" role="tablist" aria-label="View">
                    {MODES.map(m => (
                        <button
                            key={m.key}
                            type="button"
                            role="tab"
                            aria-selected={mode === m.key}
                            className={mode === m.key ? 'active' : ''}
                            onClick={() => setMode(m.key)}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </header>

            {model.loading ? (
                <div className="fp-loading">Loading live data…</div>
            ) : mode === 'exec' ? (
                <Executive model={model} />
            ) : mode === 'roadmap' ? (
                <Roadmap model={model} />
            ) : mode === 'team' ? (
                <TeamView model={model} />
            ) : (
                <Workflow model={model} />
            )}

            {model.missing.length > 0 && (
                <div className="fp-foot-warn">
                    {model.missing.length} field name(s) don’t match the contract — those are read as empty. Rename in the base or in <code>constants.js</code> to fix.
                </div>
            )}
        </>
    );
}

function App() {
    const base = useBase();
    const get = name =>
        typeof base.getTableByNameIfExists === 'function'
            ? base.getTableByNameIfExists(name)
            : base.tables.find(t => t.name === name) || null;

    // Every table must exist before we mount Dashboard — see note on Dashboard.
    const required = [TABLES.teams, TABLES.features, TABLES.attributes, TABLES.stages, TABLES.handshakes];
    const missingTables = required.filter(n => !get(n)).map(n => ({table: n, field: null}));

    return (
        <div className="fp-app">
            {missingTables.length > 0 ? <SetupBanner missing={missingTables} /> : <Dashboard />}
        </div>
    );
}

initializeBlock({interface: () => <App />});
