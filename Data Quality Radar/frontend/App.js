import React, {useState, useMemo} from 'react';
import {colors, spacing, typography} from './theme';
import useDqData from './hooks/useDqData';
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

const DEFAULT_FILTERS = {
    severity: 'All',
    dimension: 'All',
    sourceTable: 'All',
    ownerRrp: 'All',
};

function MissingTables({missingTables}) {
    return (
        <div
            style={{
                background: colors.bgPage,
                minHeight: '100vh',
                fontFamily: typography.family,
            }}
        >
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
                    This dashboard expects the following tables to exist in the current base:
                </p>
                <ul style={{margin: 0, paddingLeft: 20, color: colors.textPrimary, fontSize: 14}}>
                    {missingTables.map(t => (
                        <li key={t}><code style={{fontFamily: 'ui-monospace, monospace'}}>{t}</code></li>
                    ))}
                </ul>
                <p style={{marginTop: 16, color: colors.textTertiary, fontSize: 12}}>
                    Install the EW Data Quality Engine extension first — it creates and
                    populates <code>DQ_Results</code>. The dashboard reads from the
                    same base.
                </p>
            </div>
        </div>
    );
}

export default function App() {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [refreshTick, setRefreshTick] = useState(Date.now());

    const {raw, missingTables} = useDqData();
    const data = useFilteredData(raw, filters);

    const activeRulesCount = useMemo(() => {
        if (!raw) return 0;
        return raw.rules.filter(r => r.Active === 'Yes').length;
    }, [raw]);

    if (missingTables.length > 0) {
        return <MissingTables missingTables={missingTables} />;
    }

    if (!data) {
        return (
            <div
                style={{
                    background: colors.bgPage,
                    minHeight: '100vh',
                    fontFamily: typography.family,
                    color: colors.textTertiary,
                    padding: 32,
                }}
            >
                Loading…
            </div>
        );
    }

    function handleSelectRrp(rrp) {
        setFilters(f => ({...f, ownerRrp: f.ownerRrp === rrp ? 'All' : rrp}));
    }

    function handleClearRrp() {
        setFilters(f => ({...f, ownerRrp: 'All'}));
    }

    function handleReset() {
        setFilters(DEFAULT_FILTERS);
    }

    function handleRefresh() {
        setRefreshTick(Date.now());
    }

    return (
        <div
            style={{
                background: colors.bgPage,
                minHeight: '100vh',
                fontFamily: typography.family,
                color: colors.textPrimary,
            }}
        >
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
                <KpiStrip data={data} />
                <DimensionBars byDimension={data.byDimension} />
                <div style={{display: 'flex', gap: spacing.cardGap}}>
                    <div style={{flex: 1, minWidth: 0, display: 'flex'}}>
                        <div style={{flex: 1}}>
                            <CompletenessCard fieldCompleteness={data.fieldCompleteness} />
                        </div>
                    </div>
                    <div style={{flex: 1, minWidth: 0, display: 'flex'}}>
                        <div style={{flex: 1}}>
                            <ConsistencyCard consistencyPairs={data.consistencyPairs} />
                        </div>
                    </div>
                </div>
                <RrpLeaderboard
                    rrpLeaderboard={data.rrpLeaderboard}
                    activeRrp={filters.ownerRrp === 'All' ? null : filters.ownerRrp}
                    onSelectRrp={handleSelectRrp}
                />
                <ExceptionList
                    recentHighSeverity={data.recentHighSeverity}
                    allHighSeverity={data.allHighSeverity}
                    activeRrp={filters.ownerRrp === 'All' ? null : filters.ownerRrp}
                    onClearRrp={handleClearRrp}
                />
                <RunHistoryFooter
                    lastRunTimestamp={data.lastRunTimestamp}
                    activeRules={activeRulesCount}
                    totalExceptions={raw ? raw.dqResults.length : 0}
                />
            </div>
        </div>
    );
}
