import {initializeBlock} from '@airtable/blocks/interface/ui';
import {useState} from 'react';
import {useModel} from './data';
import {SetupBanner} from './components';
import {BRAND} from './constants';
import Roadmap from './Roadmap';
import TeamView from './TeamView';
import Workflow from './Workflow';
import Executive from './Executive';
import './style.css';

const MODES = [
    {key: 'roadmap', label: 'Roadmap'},
    {key: 'team', label: 'By team'},
    {key: 'workflow', label: 'Workflow'},
    {key: 'executive', label: BRAND.review},
];

function App() {
    const model = useModel();
    const [mode, setMode] = useState('roadmap');

    if (model.coreMissingTables.length > 0 || !model.ready) {
        return (
            <div className="fp-app">
                <SetupBanner missing={model.missing} />
            </div>
        );
    }

    return (
        <div className="fp-app">
            <header className="fp-header">
                <div className="fp-brand">{BRAND.appName} — {BRAND.subtitle}</div>
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
            ) : mode === 'roadmap' ? (
                <Roadmap model={model} />
            ) : mode === 'team' ? (
                <TeamView model={model} />
            ) : mode === 'workflow' ? (
                <Workflow model={model} />
            ) : (
                <Executive model={model} />
            )}

            {model.missing.length > 0 && (
                <div className="fp-foot-warn">
                    {model.missing.length} field/table name(s) don’t match the contract — those are read as empty. Rename in the base or in <code>constants.js</code> to fix.
                </div>
            )}
        </div>
    );
}

initializeBlock({interface: () => <App />});
