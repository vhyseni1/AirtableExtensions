import React, {useState, useMemo} from 'react';
import {useBase, useRecords, Box, Heading, Text} from '@airtable/blocks/ui';
import RunPanel from './RunPanel';
import RulesPanel from './RulesPanel';
import LogPanel from './LogPanel';
import {runEngine} from '../engine/runner';

export default function App() {
    const base = useBase();
    const rulesTable = base.getTableByNameIfExists('Rules');
    const resultsTable = base.getTableByNameIfExists('DQ_Results');

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
        if (!rulesTable || !resultsTable) {
            appendLog('Missing Rules or DQ_Results table.');
            return;
        }
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

    if (!rulesTable || !resultsTable) {
        return (
            <Box padding={3}>
                <Heading>EW Data Quality Engine</Heading>
                <Text textColor="red">
                    Missing required table. This extension expects tables named
                    "Rules" and "DQ_Results" in the current base.
                </Text>
            </Box>
        );
    }

    return (
        <Box padding={3}>
            <Heading>EW Data Quality Engine</Heading>
            <Text textColor="light" marginBottom={3}>
                Last run: {lastRun || '—'}
            </Text>
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
        </Box>
    );
}
