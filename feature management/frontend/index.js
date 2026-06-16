import {initializeBlock} from '@airtable/blocks/interface/ui';
import {useState} from 'react';
import {useModel} from './data';
import {SetupBanner} from './components';
import ModeA from './ModeA';
import ModeB from './ModeB';
import './style.css';

function App() {
    const model = useModel();
    const [mode, setMode] = useState('A');

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
                <div className="fp-brand">Feature Management — Pipeline Tracker</div>
                <div className="fp-modeswitch" role="tablist" aria-label="Dashboard mode">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'A'}
                        className={mode === 'A' ? 'active' : ''}
                        onClick={() => setMode('A')}
                    >
                        High-level
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'B'}
                        className={mode === 'B' ? 'active' : ''}
                        onClick={() => setMode('B')}
                    >
                        My team
                    </button>
                </div>
            </header>

            {model.loading ? (
                <div className="fp-loading">Loading live data…</div>
            ) : mode === 'A' ? (
                <ModeA model={model} />
            ) : (
                <ModeB model={model} />
            )}

            {model.missing.length > 0 && (
                <div className="fp-foot-warn">
                    {model.missing.length} field name(s) don’t match the contract — those columns are read as empty. Rename in the base or in <code>constants.js</code> to fix.
                </div>
            )}
        </div>
    );
}

initializeBlock({interface: () => <App />});
