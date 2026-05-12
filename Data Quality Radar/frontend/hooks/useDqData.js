import {useMemo} from 'react';
import {useBase, useRecords} from '@airtable/blocks/interface/ui';

const DQ_RESULTS_FIELDS = [
    'Result_ID', 'Run_Timestamp', 'Rule_ID', 'Rule_Name', 'DQ_Dimension',
    'Severity', 'Source_Table', 'Record_ID', 'Field', 'Expected', 'Actual',
    'Status', 'Owner_RRP', 'Supplier_ID', 'Roche_Country',
];

const RULES_FIELDS = ['Rule_ID', 'Rule_Name', 'DQ_Dimension', 'Severity', 'Scope', 'Active'];

const EPP_FIELDS = ['Worker_ID', 'RRP_ID', 'Company_Code', 'Roche_Country'];

function extract(record, fieldNames) {
    const out = {_recordId: record.id};
    for (const f of fieldNames) {
        const v = record.getCellValue(f);
        if (v && typeof v === 'object' && 'name' in v) {
            out[f] = v.name;
        } else {
            out[f] = v;
        }
    }
    return out;
}

function normalizeRecords(records, fieldNames) {
    if (!records) return null;
    return records.map(r => extract(r, fieldNames));
}

export default function useDqData() {
    const base = useBase();
    const dqResultsTable = base.getTableByNameIfExists('DQ_Results');
    const rulesTable = base.getTableByNameIfExists('Rules');
    const eppTable = base.getTableByNameIfExists('EPP');

    const dqResultsRecords = useRecords(dqResultsTable, {fields: DQ_RESULTS_FIELDS});
    const rulesRecords = useRecords(rulesTable, {fields: RULES_FIELDS});
    const eppRecords = useRecords(eppTable, {fields: EPP_FIELDS});

    const missingTables = [];
    if (!dqResultsTable) missingTables.push('DQ_Results');
    if (!rulesTable) missingTables.push('Rules');
    if (!eppTable) missingTables.push('EPP');

    const raw = useMemo(() => {
        if (missingTables.length) return null;
        return {
            dqResults: normalizeRecords(dqResultsRecords, DQ_RESULTS_FIELDS) || [],
            rules: normalizeRecords(rulesRecords, RULES_FIELDS) || [],
            epp: normalizeRecords(eppRecords, EPP_FIELDS) || [],
        };
    }, [dqResultsRecords, rulesRecords, eppRecords, missingTables.length]);

    return {raw, missingTables};
}
