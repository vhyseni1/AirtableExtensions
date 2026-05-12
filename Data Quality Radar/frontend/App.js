import React, {useState, useMemo} from 'react';
import {colors, spacing, typography} from './theme';
import useDqData, {useDqTables} from './hooks/useDqData';
import useFilteredData from './hooks/useFilteredData';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import KpiStrip from './components/KpiStrip';
import DimensionBars from './components/DimensionBars';
import CompletenessCard from './components/CompletenessCard';
import ConsistencyCard from './components/ConsistencyCard';
import RrpLeaderboard from './components/RrpLeaderboard';
import ExceptionList from './components/ExceptionList';
import RunHistoryFooter from './components/RunHistoryFooter';
import DrillDownModal from './components/DrillDownModal';

const DEFAULT_FILTERS = {
    severity: 'All',
    dimension: 'All',
    sourceTable: 'All',
    ownerRrp: 'All',
};

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

function passesFilters(record, filters) {
    if (filters.severity !== 'All' && safeGet(record, 'Severity') !== filters.severity) return false;
    if (filters.dimension !== 'All' && safeGet(record, 'DQ_Dimension') !== filters.dimension) return false;
    if (filters.sourceTable !== 'All' && safeGet(record, 'Source_Table') !== filters.sourceTable) return false;
    if (filters.ownerRrp !== 'All' && safeGet(record, 'Owner_RRP') !== filters.ownerRrp) return false;
    return true;
}

function PageShell({children}) {
    return (
        <div
            style={{
                background: colors.bgPage,
                minHeight: '100vh',
                fontFamily: typography.family,
                color: colors.textPrimary,
            }}
        >
            {children}
        </div>
    );
}

function MissingTables({missingTables}) {
    return (
        <PageShell>
            <Header lastRefresh={null} onRefresh={() => {}} />
            <div
                style={{
                    maxWidth: 720,
                    margin: '64px auto',
                    background: colors.white,
                    border: `1px solid ${colors.border}`,
                    borderRadius: spacing.cardRadius,
                    padding: 32,
                    textAlign: 'left',
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        marginBottom: 12,
                        fontSize: typography.h1.size,
                        fontWeight: typography.h1.weight,
                        color: colors.textPrimary,
                    }}
                >
                    Missing required tables
                </h1>
                <p style={{margin: 0, marginBottom: 12, color: colors.textSecondary, fontSize: 14}}>
                    This dashboard expects the following tables to exist in the current base
                    and be exposed to this interface page:
                </p>
                <ul style={{margin: 0, paddingLeft: 20, color: colors.textPrimary, fontSize: 14}}>
                    {missingTables.map(t => (
                        <li key={t}>
                            <code style={{fontFamily: 'ui-monospace, monospace'}}>{t}</code>
                        </li>
                    ))}
                </ul>
                <p style={{marginTop: 16, color: colors.textTertiary, fontSize: 12}}>
                    If the EW Data Quality Engine extension is installed and these tables
                    exist in the base, open the interface in edit mode and add the missing
                    tables as data sources for this page.
                </p>
            </div>
        </PageShell>
    );
}

function Loading() {
    return (
        <PageShell>
            <div style={{padding: 32, color: colors.textTertiary}}>Loading…</div>
        </PageShell>
    );
}

function Dashboard({tables}) {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [refreshTick, setRefreshTick] = useState(Date.now());
    const [drilldown, setDrilldown] = useState(null);

    const {raw, eppRecords, dqResultsRecords} = useDqData(tables);
    const data = useFilteredData(raw, filters);

    const activeRulesCount = useMemo(() => {
        if (!raw) return 0;
        return raw.rules.filter(r => r && r.Active === 'Yes').length;
    }, [raw]);

    const drilldownRecords = useMemo(() => {
        if (!drilldown || !dqResultsRecords) return [];
        return dqResultsRecords.filter(r => {
            if (!r) return false;
            if (!passesFilters(r, filters)) return false;
            try {
                return drilldown.predicate(r);
            } catch (e) {
                return false;
            }
        });
    }, [drilldown, dqResultsRecords, filters]);

    if (!data) return <Loading />;

    const handleSelectRrp = (rrp) =>
        setFilters(f => ({...f, ownerRrp: f.ownerRrp === rrp ? 'All' : rrp}));
    const handleClearRrp = () => setFilters(f => ({...f, ownerRrp: 'All'}));
    const handleReset = () => setFilters(DEFAULT_FILTERS);
    const handleRefresh = () => setRefreshTick(Date.now());
    const handleDrillDown = (title, predicate) =>
        setDrilldown({title, predicate});
    const handleCloseDrilldown = () => setDrilldown(null);

    return (
        <PageShell>
            <Header
                lastRefresh={new Date(refreshTick).toISOString()}
                onRefresh={handleRefresh}
            />
            <FilterBar
                filters={filters}
                rrpList={data.rrpList}
                sourceTablesList={data.sourceTablesList}
                onChange={setFilters}
                onReset={handleReset}
            />
            <div
                style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    padding: spacing.containerPadding,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.cardGap,
                }}
            >
                <KpiStrip data={data} onDrillDown={handleDrillDown} />
                <DimensionBars
                    byDimension={data.byDimension}
                    onDrillDown={handleDrillDown}
                />
                <div style={{display: 'flex', gap: spacing.cardGap}}>
                    <div style={{flex: 1, minWidth: 0, display: 'flex'}}>
                        <div style={{flex: 1}}>
                            <CompletenessCard
                                fieldCompleteness={data.fieldCompleteness}
                                onDrillDown={handleDrillDown}
                            />
                        </div>
                    </div>
                    <div style={{flex: 1, minWidth: 0, display: 'flex'}}>
                        <div style={{flex: 1}}>
                            <ConsistencyCard
                                consistencyPairs={data.consistencyPairs}
                                onDrillDown={handleDrillDown}
                            />
                        </div>
                    </div>
                </div>
                <RrpLeaderboard
                    rrpLeaderboard={data.rrpLeaderboard}
                    activeRrp={filters.ownerRrp === 'All' ? null : filters.ownerRrp}
                    onSelectRrp={handleSelectRrp}
                    onDrillDown={handleDrillDown}
                />
                <ExceptionList
                    recentHighSeverity={data.recentHighSeverity}
                    allHighSeverity={data.allHighSeverity}
                    activeRrp={filters.ownerRrp === 'All' ? null : filters.ownerRrp}
                    onClearRrp={handleClearRrp}
                    eppRecords={eppRecords}
                />
                <RunHistoryFooter
                    lastRunTimestamp={data.lastRunTimestamp}
                    activeRules={activeRulesCount}
                    totalExceptions={raw ? raw.dqResults.length : 0}
                />
            </div>
            {drilldown && (
                <DrillDownModal
                    title={drilldown.title}
                    records={drilldownRecords}
                    eppRecords={eppRecords}
                    onClose={handleCloseDrilldown}
                />
            )}
        </PageShell>
    );
}

export default function App() {
    const {dqResultsTable, rulesTable, eppTable, missingTables} = useDqTables();

    if (missingTables.length > 0) {
        return <MissingTables missingTables={missingTables} />;
    }

    return <Dashboard tables={{dqResultsTable, rulesTable, eppTable}} />;
}
