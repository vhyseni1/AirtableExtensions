import {loadSources} from './sources';
import {RULES} from './rules';
import {truncateResults, writeResults} from './writer';

export async function runEngine({base, rulesTable, resultsTable, onProgress, onLog}) {
    const start = Date.now();

    onLog('Loading source data…');
    const sources = await loadSources(base);
    onLog(
        `Loaded EPP=${sources.epp.length}, FG=${sources.fg.length}, ` +
        `PO=${sources.po.length}, Spend=${sources.spend.length}, ` +
        `ValidCC=${sources.validCC.size}.`,
    );

    onLog('Reading Rules table…');
    const rulesQuery = await rulesTable.selectRecordsAsync();
    const ruleRows = rulesQuery.records.map(r => ({
        Rule_ID: r.getCellValueAsString('Rule_ID'),
        Rule_Name: r.getCellValueAsString('Rule_Name'),
        DQ_Dimension: r.getCellValueAsString('DQ_Dimension'),
        Severity: r.getCellValueAsString('Severity'),
        Scope: r.getCellValueAsString('Scope'),
        Active: r.getCellValueAsString('Active'),
    }));
    rulesQuery.unloadData();

    const codeRuleIds = new Set(Object.keys(RULES));
    const tableRuleIds = new Set(ruleRows.map(r => r.Rule_ID));
    for (const id of codeRuleIds) {
        if (!tableRuleIds.has(id)) onLog(`WARNING: ${id} implemented in code but missing from Rules table.`);
    }
    for (const id of tableRuleIds) {
        if (!codeRuleIds.has(id)) onLog(`WARNING: ${id} listed in Rules table but no implementation.`);
    }

    const activeRules = ruleRows.filter(r => r.Active === 'Yes' && RULES[r.Rule_ID]);
    onLog(`${activeRules.length} active rule(s) to execute.`);

    onLog('Truncating DQ_Results…');
    const removed = await truncateResults(resultsTable);
    onLog(`Removed ${removed} prior result row(s).`);

    const runTimestamp = new Date().toISOString();
    const allExceptions = [];

    for (let i = 0; i < activeRules.length; i++) {
        const rule = activeRules[i];
        onProgress({
            current: i + 1,
            total: activeRules.length,
            ruleId: rule.Rule_ID,
            ruleName: rule.Rule_Name,
        });
        onLog(`→ ${rule.Rule_ID} ${rule.Rule_Name}`);

        let exceptions = [];
        try {
            exceptions = await RULES[rule.Rule_ID](sources);
        } catch (err) {
            onLog(`  ERROR in ${rule.Rule_ID}: ${err.message}`);
            continue;
        }
        onLog(`  ${rule.Rule_ID}: ${exceptions.length} exception(s)`);

        for (let j = 0; j < exceptions.length; j++) {
            const ex = exceptions[j];
            allExceptions.push({
                Result_ID: `${rule.Rule_ID}-${ex.Record_ID || 'unknown'}-${Date.now()}-${j}`,
                Run_Timestamp: runTimestamp,
                Rule_ID: rule.Rule_ID,
                Rule_Name: rule.Rule_Name,
                DQ_Dimension: rule.DQ_Dimension ? {name: rule.DQ_Dimension} : null,
                Severity: rule.Severity ? {name: rule.Severity} : null,
                Source_Table: rule.Scope || '',
                Record_ID: String(ex.Record_ID || ''),
                Field: ex.Field || '',
                Expected: ex.Expected || '',
                Actual: ex.Actual || '',
                Status: {name: 'Open'},
                Owner_RRP: ex.Owner_RRP || '',
                Supplier_ID: ex.Supplier_ID || '',
                Roche_Country: ex.Roche_Country || '',
            });
        }
    }

    onLog(`Writing ${allExceptions.length} exception(s) to DQ_Results…`);
    await writeResults(resultsTable, allExceptions);

    const duration = (Date.now() - start) / 1000;
    onLog(`Run complete in ${duration.toFixed(1)}s.`);

    return {exceptions: allExceptions, duration, runTimestamp};
}
