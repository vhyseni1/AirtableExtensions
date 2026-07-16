import {initializeBlock, useBase} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {TABLES} from './constants';
import {useModel, filterModel} from './data';
import {SetupBanner} from './components';
import FilterBar, {EMPTY_FILTER} from './FilterBar';
import Executive from './Executive';
import Roadmap from './Roadmap';
import TeamView from './TeamView';
import Workflow from './Workflow';
import Traceability from './Traceability';
import Narrative from './Narrative';
import Logo from './Logo';
import './style.css';

// Modes that honour the top-bar Entity / Initiative / Feature / Milestone filter.
const FILTERED_MODES = new Set(['roadmap', 'team', 'workflow', 'trace']);

const MODES = [
    {key: 'exec', label: 'Executive overview'},
    {key: 'roadmap', label: 'Pipeline Tracker Overview'},
    {key: 'team', label: 'By team'},
    {key: 'workflow', label: 'Workflow'},
    {key: 'trace', label: 'Traceability'},
];

// The data-loading shell. Only mounted once every table exists, so useModel()'s
// useRecords() calls never receive a null table (interface useRecords reads
// table.id and throws on null).
function Dashboard() {
    const model = useModel();
    const [mode, setMode] = useState('exec');
    const [narrativeOpen, setNarrativeOpen] = useState(false);
    const [filter, setFilter] = useState(EMPTY_FILTER);

    const showFilter = FILTERED_MODES.has(mode);
    const filtered = useMemo(() => (showFilter ? filterModel(model, filter) : model), [model, filter, showFilter]);
    const viewModel = showFilter ? filtered : model;

    return (
        <>
            <header className="fp-nav">
                <div className="fp-nav-left">
                    <Logo />
                    <span className="fp-nav-title">ampliFI</span>
                </div>
                <nav className="fp-nav-tabs" role="tablist" aria-label="View">
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
                </nav>
                <div className="fp-nav-actions">
                    <button type="button" className="fp-nav-narrative" onClick={() => setNarrativeOpen(true)}>
                        <span aria-hidden>✦</span> Narrative
                    </button>
                </div>
            </header>

            {!model.loading && showFilter && (
                <FilterBar model={model} sel={filter} onChange={setFilter} matchCount={filtered.features.length} />
            )}

            {model.loading ? (
                <div className="fp-loading">Loading live data…</div>
            ) : mode === 'exec' ? (
                <Executive model={model} />
            ) : mode === 'roadmap' ? (
                <Roadmap model={viewModel} />
            ) : mode === 'team' ? (
                <TeamView model={viewModel} />
            ) : mode === 'workflow' ? (
                <Workflow model={viewModel} />
            ) : (
                <Traceability model={viewModel} />
            )}

            {model.missing.length > 0 && (
                <div className="fp-foot-warn">
                    {model.missing.length} field name(s) don’t match the contract — those are read as empty. Rename in the base or in <code>constants.js</code> to fix.
                </div>
            )}

            {narrativeOpen && <Narrative model={model} onClose={() => setNarrativeOpen(false)} />}
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
