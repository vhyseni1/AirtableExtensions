import {useMemo} from 'react';

const DIMENSIONS = ['Accuracy', 'Consistency', 'Completeness', 'Referential', 'Validity', 'Uniqueness'];

const COMPLETENESS_FIELDS = [
    {field: 'PO_Number', label: 'PO Number'},
    {field: 'Country_of_Residence', label: 'Country of Residence (onsite only)'},
    {field: 'Capability', label: 'Capability'},
    {field: 'Self_Employed', label: 'Self-Employed flag'},
    {field: 'Cost_Center', label: 'Cost Center'},
];

const CONSISTENCY_PAIRS = [
    {pair: 'EPP ↔ Fieldglass', ruleIds: ['R010', 'R011', 'R012', 'R013', 'R014']},
    {pair: 'EPP ↔ PO', ruleIds: ['R015', 'R016']},
    {pair: 'Spend ↔ PO', ruleIds: ['R018']},
];

function applyFilters(rows, filters) {
    return rows.filter(r => {
        if (filters.severity !== 'All' && r.Severity !== filters.severity) return false;
        if (filters.dimension !== 'All' && r.DQ_Dimension !== filters.dimension) return false;
        if (filters.sourceTable !== 'All' && r.Source_Table !== filters.sourceTable) return false;
        if (filters.ownerRrp !== 'All' && r.Owner_RRP !== filters.ownerRrp) return false;
        return true;
    });
}

function countBy(rows, key) {
    const m = new Map();
    for (const r of rows) {
        const v = r[key];
        if (!v) continue;
        m.set(v, (m.get(v) || 0) + 1);
    }
    return m;
}

function modeBy(rows, key) {
    const m = countBy(rows, key);
    let best = null;
    let bestN = -1;
    for (const [k, n] of m.entries()) {
        if (n > bestN) {
            best = k;
            bestN = n;
        }
    }
    return best;
}

function distinctCount(rows, key) {
    const s = new Set();
    for (const r of rows) {
        const v = r[key];
        if (v) s.add(v);
    }
    return s.size;
}

function compositeScore(totalEpp, high, medium, low) {
    if (!totalEpp) return 0;
    const penalty = (high * 1.0 + medium * 0.4 + low * 0.1) / totalEpp * 10;
    const score = 100 - penalty;
    return Math.max(0, Math.min(100, Math.round(score)));
}

export default function useFilteredData(raw, filters) {
    return useMemo(() => {
        if (!raw) return null;
        const {dqResults, epp} = raw;
        const filtered = applyFilters(dqResults, filters);
        const totalEpp = epp.length;

        // Severity counts (on filtered set)
        let highSeverity = 0;
        let mediumSeverity = 0;
        let lowSeverity = 0;
        for (const r of filtered) {
            if (r.Severity === 'High') highSeverity++;
            else if (r.Severity === 'Medium') mediumSeverity++;
            else if (r.Severity === 'Low') lowSeverity++;
        }

        // Records with EPP exceptions (distinct Record_ID where Source_Table === 'EPP')
        const eppExceptionRecordIds = new Set();
        for (const r of filtered) {
            if (r.Source_Table === 'EPP' && r.Record_ID) {
                eppExceptionRecordIds.add(r.Record_ID);
            }
        }

        // Dimension breakdown
        const dimMap = countBy(filtered, 'DQ_Dimension');
        const byDimension = DIMENSIONS.map(d => ({dimension: d, count: dimMap.get(d) || 0}));

        // Field completeness — count exceptions per Field
        const fieldExceptionMap = new Map();
        for (const r of filtered) {
            if (!r.Field) continue;
            const recId = r.Record_ID;
            if (!recId) continue;
            const key = r.Field;
            if (!fieldExceptionMap.has(key)) fieldExceptionMap.set(key, new Set());
            fieldExceptionMap.get(key).add(recId);
        }
        const fieldCompleteness = COMPLETENESS_FIELDS.map(({field, label}) => {
            const exceptionCount = (fieldExceptionMap.get(field) || new Set()).size;
            const completeness = totalEpp > 0
                ? Math.max(0, 100 * (1 - exceptionCount / totalEpp))
                : 100;
            return {field, label, completeness: Math.round(completeness * 10) / 10, exceptionCount};
        });

        // Cross-system consistency pairs
        const consistencyPairs = CONSISTENCY_PAIRS.map(({pair, ruleIds}) => {
            const mismatches = filtered.filter(r => ruleIds.includes(r.Rule_ID));
            const mismatchCount = mismatches.length;
            const denom = totalEpp > 0 ? totalEpp : 1;
            const matchRate = Math.max(0, 100 - (mismatchCount / denom * 100));
            return {
                pair,
                ruleCount: ruleIds.length,
                mismatchCount,
                matchRate: Math.round(matchRate * 10) / 10,
            };
        });

        // RRP leaderboard — group by Owner_RRP, join EPP for org code + worker count
        const eppByRrp = new Map();
        for (const e of epp) {
            const rrp = e.RRP_ID;
            if (!rrp) continue;
            if (!eppByRrp.has(rrp)) eppByRrp.set(rrp, []);
            eppByRrp.get(rrp).push(e);
        }
        const rrpExceptionMap = new Map();
        for (const r of filtered) {
            const rrp = r.Owner_RRP;
            if (!rrp) continue;
            rrpExceptionMap.set(rrp, (rrpExceptionMap.get(rrp) || 0) + 1);
        }
        const rrpLeaderboard = Array.from(rrpExceptionMap.entries())
            .map(([rrp, exceptionCount]) => {
                const eppRows = eppByRrp.get(rrp) || [];
                const org = modeBy(eppRows, 'Company_Code') || modeBy(eppRows, 'Roche_Country') || '—';
                return {
                    rrp,
                    org,
                    workerCount: distinctCount(eppRows, 'Worker_ID'),
                    exceptionCount,
                };
            })
            .sort((a, b) => b.exceptionCount - a.exceptionCount)
            .slice(0, 6);

        // Recent high-severity exceptions
        const highRows = filtered.filter(r => r.Severity === 'High');
        const sortedHigh = [...highRows].sort((a, b) => {
            const at = a.Run_Timestamp || '';
            const bt = b.Run_Timestamp || '';
            return bt.localeCompare(at);
        });
        const recentHighSeverity = sortedHigh.slice(0, 5);

        // Last run timestamp — max across the FULL (unfiltered) dataset
        let lastRunTimestamp = null;
        for (const r of dqResults) {
            const t = r.Run_Timestamp;
            if (t && (!lastRunTimestamp || t > lastRunTimestamp)) lastRunTimestamp = t;
        }

        // Lists for filter chips (derived from unfiltered data)
        const rrpListSet = new Set();
        for (const r of dqResults) {
            if (r.Owner_RRP) rrpListSet.add(r.Owner_RRP);
        }
        const rrpList = Array.from(rrpListSet).sort();

        const sourceTablesSet = new Set();
        for (const r of dqResults) {
            if (r.Source_Table) sourceTablesSet.add(r.Source_Table);
        }
        const sourceTablesList = Array.from(sourceTablesSet).sort();

        return {
            totalEpp,
            recordsWithExceptions: eppExceptionRecordIds.size,
            totalExceptions: filtered.length,
            highSeverity,
            mediumSeverity,
            lowSeverity,
            compositeScore: compositeScore(totalEpp, highSeverity, mediumSeverity, lowSeverity),
            dimensionCount: byDimension.filter(d => d.count > 0).length,
            byDimension,
            fieldCompleteness,
            consistencyPairs,
            rrpLeaderboard,
            recentHighSeverity,
            allHighSeverity: sortedHigh,
            lastRunTimestamp,
            rrpList,
            sourceTablesList,
        };
    }, [raw, filters.severity, filters.dimension, filters.sourceTable, filters.ownerRrp]);
}
