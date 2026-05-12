import React, {useState, useMemo} from 'react';
import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import RunPanel from './RunPanel';
import RulesPanel from './RulesPanel';
import LogPanel from './LogPanel';
import {runEngine} from '../engine/runner';

const styles = {
    root: {
        padding: 16,
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#1f2937',
        fontSize: 14,
        lineHeight: 1.4,
    },
    h1: {fontSize: 20, fontWeight: 600, margin: '0 0 4px 0'},
    sub: {color: '#6b7280', marginBottom: 16},
    error: {color: '#b91c1c', whiteSpace: 'pre-wrap'},
    list: {margin: '8px 0 0 0', paddingLeft: 20},
};

const REQUIRED = ['EPP', 'Fieldglass', 'PurchaseOrders', 'Spend', 'Valid_Cost_Centers', 'Rules', 'DQ_Results'];

export default function App() {
    const base = useBase();

    const missing = REQUIRED.filter(name => !base.getTableByNameIfExists(name));
    if (missing.length > 0) {
        return (
            <div style={styles.root}>
                <h1 style={styles.h1}>EW Data Quality Engine</h1>
                <p style={styles.error}>
                    The following table(s) are not reachable from this interface extension:
                </p>
                <ul style={styles.list}>
                    {missing.map(n => <li key={n}>{n}</li>)}
                </ul>
                <p style={styles.error}>
                    Interface extensions typically need each source table bound via the
                    interface page's extension configuration. If the tables exist in the
                    base, open the interface page in Designer, edit this extension, and
                    grant it access to the required tables.
                </p>
            </div>
        );
    }

    const rulesTable = base.getTableByNameIfExists('Rules');
    const resultsTable = base.getTableByNameIfExists('DQ_Results');

    return (
        <AppInner
            base={base}
            rulesTable={rulesTable}
            resultsTable={resultsTable}
        />
    );
}

function AppInner({base, rulesTable, resultsTable}) {
    const ruleRecords = useRecords(rulesTable);
    const resultRecords = useRecords(resultsTable);

    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [summary, setSummary] = useState(null);
    const [log, setLog] = useState([]);

    const lastRun = useMemo(() => {
        if (!resultRecords || resultRecords.length === 0) return null;
        let latest = null;
        for (const r of resultRecords) {
            const t = r.getCellValueAsString('Run_Timestamp');
            if (t && (!latest || t > latest)) latest = t;
        }
        return latest;
    }, [resultRecords]);

    const appendLog = (line) => {
        setLog(prev => {
            const next = [...prev, `[${new Date().toLocaleTimeString()}] ${line}`];
            return next.slice(-50);
        });
    };

    async function handleRun() {
        setRunning(true);
        setSummary(null);
        setProgress(null);
        setLog([]);
        try {
            const result = await runEngine({
                base,
                rulesTable,
                resultsTable,
                onProgress: setProgress,
                onLog: appendLog,
            });
            const severity = {High: 0, Medium: 0, Low: 0};
            const dimension = {};
            for (const ex of result.exceptions) {
                const sev = ex.Severity && ex.Severity.name;
                const dim = ex.DQ_Dimension && ex.DQ_Dimension.name;
                if (sev) severity[sev] = (severity[sev] || 0) + 1;
                if (dim) dimension[dim] = (dimension[dim] || 0) + 1;
            }
            setSummary({
                total: result.exceptions.length,
                severity,
                dimension,
                duration: result.duration,
            });
        } catch (err) {
            appendLog(`ERROR: ${err.message}`);
        } finally {
            setRunning(false);
            setProgress(null);
        }
    }

    return (
        <div style={styles.root}>
            <h1 style={styles.h1}>EW Data Quality Engine</h1>
            <div style={styles.sub}>Last run: {lastRun || '—'}</div>
            <RunPanel
                running={running}
                progress={progress}
                summary={summary}
                onRun={handleRun}
            />
            <RulesPanel
                table={rulesTable}
                records={ruleRecords}
                disabled={running}
            />
            <LogPanel lines={log} />
        </div>
    );
}
