import {expandRecord} from '@airtable/blocks/interface/ui';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useAggregations} from '../hooks/useAggregations';
import {DEFAULT_FILTER, type FilterState, useFilteredImpacts} from '../hooks/useFilteredImpacts';
import {useImpacts} from '../hooks/useImpacts';
import {tokens} from '../styles/tokens';
import {type Impact} from '../utils/schema';
import {DiagnosticGrid} from './DiagnosticGrid';
import {FilterBar} from './FilterBar';
import {HeadlineBar, type DrillSpec} from './HeadlineBar';
import {HeatMap} from './HeatMap';
import {NarrativeMode} from './NarrativeMode';
import {DrillSheet} from './primitives/DrillSheet';
import {EmptyState} from './primitives/EmptyState';
import {SourceTrace} from './SourceTrace';

interface AirtableTableLike {
    id: string;
    name: string;
    getRecordByIdIfExists?(id: string): unknown;
}

interface ActiveDrill {
    title: string;
    eyebrow?: string;
    records: Impact[];
    key?: string;
    emptyLine?: string;
}

export function Dashboard() {
    const {table, impacts, missingFields, isReady} = useImpacts();
    const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
    const [activeDrill, setActiveDrill] = useState<ActiveDrill | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [narrative, setNarrative] = useState(false);

    const filtered = useFilteredImpacts(impacts, filter);
    const aggregations = useAggregations(filtered, impacts);

    useEffect(() => {
        if (filter.sourceRun === 'All' && aggregations.runs[0]) {
            setFilter(f => (f.sourceRun === 'All' ? {...f, sourceRun: aggregations.runs[0] ?? 'All'} : f));
        }
    }, [aggregations.runs, filter.sourceRun]);

    const openRecord = useCallback(
        (id: string) => {
            if (!table) return;
            const tbl = table as unknown as AirtableTableLike;
            const rec = tbl.getRecordByIdIfExists?.(id);
            if (rec) {
                expandRecord(rec as Parameters<typeof expandRecord>[0]);
            }
        },
        [table],
    );

    const handleDrillFromTile = useCallback((spec: DrillSpec) => {
        setActiveDrill({title: spec.title, eyebrow: spec.eyebrow, records: spec.records, key: spec.key, emptyLine: spec.emptyLine});
    }, []);

    const handleDrillFromMatrix = useCallback((records: Impact[], title: string) => {
        setActiveDrill({title, eyebrow: 'Matrix slice', records});
    }, []);

    const handleSelect = useCallback((id: string) => {
        setSelectedId(id);
    }, []);

    const selectedImpact = useMemo<Impact | null>(() => {
        if (selectedId) {
            const found = impacts.find(r => r.id === selectedId);
            if (found) return found;
        }
        return filtered.find(r => r.severity === 'High') ?? filtered[0] ?? null;
    }, [selectedId, impacts, filtered]);

    const freshness = useMemo(() => {
        const latest = aggregations.runs[0];
        if (!latest) return null;
        const m = latest.match(/(\d{4}-\d{2}-\d{2})/);
        return m?.[1] ?? latest;
    }, [aggregations.runs]);

    if (!table) {
        return (
            <ErrorScreen
                title="No Impacts table found"
                detail="This extension expects a table named “Impacts” in the current base."
            />
        );
    }
    if (!isReady) {
        return <SkeletonScreen />;
    }
    if (missingFields.length) {
        return (
            <ErrorScreen
                title="Schema mismatch"
                detail={`Missing required fields: ${missingFields.join(', ')}`}
            />
        );
    }

    return (
        <div
            style={{
                position: 'relative',
                minHeight: '100vh',
                padding: tokens.space.lg,
                background: tokens.colors.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space.lg,
            }}
        >
            <Masthead onNarrative={() => setNarrative(true)} onPrint={() => window.print()} runCount={aggregations.runs.length} />
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: tokens.colors.bg,
                    paddingBottom: tokens.space.sm,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: tokens.space.sm,
                }}
            >
                <HeadlineBar
                    filtered={filtered}
                    aggregations={aggregations}
                    activeDrill={(activeDrill?.key as DrillSpec['key']) ?? null}
                    onDrill={handleDrillFromTile}
                />
                <FilterBar
                    filter={filter}
                    onChange={setFilter}
                    runs={aggregations.runs}
                    freshness={freshness}
                />
            </div>

            {filtered.length === 0 ? (
                <div style={{padding: tokens.space.xxl, background: tokens.colors.bgPanel, border: `1px solid ${tokens.colors.rule}`, borderRadius: tokens.radius.md}}>
                    <EmptyState line="No reviewed impacts match the current filter. Try widening the lens." />
                </div>
            ) : (
                <>
                    <HeatMap aggregations={aggregations} filtered={filtered} onDrill={handleDrillFromMatrix} />
                    <DiagnosticGrid
                        aggregations={aggregations}
                        onDrill={handleDrillFromMatrix}
                        onOpen={openRecord}
                        onSelect={handleSelect}
                        selectedId={selectedId}
                    />
                    <SourceTrace impact={selectedImpact} onOpen={openRecord} />
                </>
            )}

            {activeDrill ? (
                <DrillSheet
                    title={activeDrill.title}
                    eyebrow={activeDrill.eyebrow}
                    records={activeDrill.records}
                    onClose={() => setActiveDrill(null)}
                    onOpenRecord={id => {
                        handleSelect(id);
                        openRecord(id);
                    }}
                    onSelect={handleSelect}
                    emptyLine={activeDrill.emptyLine}
                />
            ) : null}

            {narrative ? (
                <NarrativeMode aggregations={aggregations} onClose={() => setNarrative(false)} />
            ) : null}
        </div>
    );
}

function Masthead({
    onNarrative,
    onPrint,
    runCount,
}: {
    onNarrative: () => void;
    onPrint: () => void;
    runCount: number;
}) {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: tokens.space.lg,
                paddingBottom: tokens.space.sm,
                borderBottom: `1px solid ${tokens.colors.rule}`,
            }}
        >
            <div>
                <span
                    className="cia-eyebrow"
                    style={{letterSpacing: '0.18em', color: tokens.colors.accent}}
                >
                    ELEVATE-CIA · Intelligence Dashboard
                </span>
                <h1
                    style={{
                        margin: '4px 0 0 0',
                        fontFamily: tokens.fonts.serif,
                        fontSize: 28,
                        fontWeight: 600,
                        letterSpacing: '-0.015em',
                        color: tokens.colors.text,
                    }}
                >
                    Change Impact · Control Tower
                </h1>
                <span
                    style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: tokens.colors.textMuted,
                        display: 'block',
                    }}
                >
                    Where the heat is. What's breaking. Who's under pressure. Where alignment fails.
                </span>
            </div>
            <div style={{display: 'flex', gap: tokens.space.sm}}>
                <ActionButton onClick={onNarrative} disabled={runCount === 0}>
                    Narrative ▶
                </ActionButton>
                <ActionButton onClick={onPrint}>Export PDF</ActionButton>
            </div>
        </header>
    );
}

function ActionButton({
    onClick,
    children,
    disabled,
}: {
    onClick: () => void;
    children: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.sm,
                background: tokens.colors.bgPanel,
                color: tokens.colors.text,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'default' : 'pointer',
            }}
        >
            {children}
        </button>
    );
}

function SkeletonScreen() {
    return (
        <div style={{padding: tokens.space.lg, display: 'flex', flexDirection: 'column', gap: tokens.space.lg}}>
            <div className="cia-skeleton" style={{height: 56, width: 360}} />
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: tokens.space.md}}>
                {Array.from({length: 6}).map((_, i) => (
                    <div key={i} className="cia-skeleton" style={{height: 96}} />
                ))}
            </div>
            <div className="cia-skeleton" style={{height: 360}} />
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: tokens.space.md}}>
                {Array.from({length: 4}).map((_, i) => (
                    <div key={i} className="cia-skeleton" style={{height: 220}} />
                ))}
            </div>
        </div>
    );
}

function ErrorScreen({title, detail}: {title: string; detail: string}) {
    return (
        <div
            style={{
                padding: tokens.space.xxl,
                margin: tokens.space.xl,
                background: tokens.colors.bgPanel,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.md,
                maxWidth: 640,
            }}
        >
            <span className="cia-eyebrow" style={{color: tokens.colors.sevHigh}}>
                Cannot render
            </span>
            <h2 style={{margin: '6px 0 4px 0', fontFamily: tokens.fonts.serif, fontWeight: 600, fontSize: 22}}>
                {title}
            </h2>
            <p style={{margin: 0, color: tokens.colors.textMuted, fontSize: 13, lineHeight: 1.55}}>{detail}</p>
        </div>
    );
}
