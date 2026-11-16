import {expandRecord, useBase} from '@airtable/blocks/interface/ui';
import * as AirtableUI from '@airtable/blocks/interface/ui';
import {useCallback, useMemo, useState} from 'react';

/**
 * `useSession` is exported by the runtime SDK (and resolved by the block
 * bundler like useBase), but this experimental build's type declarations don't
 * surface it cleanly. Bind it through a typed shim.
 */
interface SessionLike {
    currentUser: {id?: string; email?: string; name?: string} | null;
}
const useSession = (AirtableUI as unknown as {useSession: () => SessionLike}).useSession;
import {useAggregations} from '../hooks/useAggregations';
import {DEFAULT_FILTER, type FilterState, useFilteredImpacts} from '../hooks/useFilteredImpacts';
import {useImpacts} from '../hooks/useImpacts';
import {tokens} from '../styles/tokens';
import {missingCoreFields, TABLE_NAME, type Impact} from '../utils/schema';
import {DiagnosticGrid} from './DiagnosticGrid';
import {FilterBar} from './FilterBar';
import {HeadlineBar, type DrillSpec} from './HeadlineBar';
import {HeatMap} from './HeatMap';
import {HelpGuide} from './HelpGuide';
import {ImportPanel} from './ImportPanel';
import {NarrativeMode} from './NarrativeMode';
import {DrillSheet} from './primitives/DrillSheet';
import {EmptyState} from './primitives/EmptyState';
import {SourceTrace} from './SourceTrace';
import {Tabs, type TabKey} from './Tabs';
import {FlowsView} from './views/FlowsView';
import {HeatmapsView} from './views/HeatmapsView';
import {RadarsView} from './views/RadarsView';
import {WaterfallsView} from './views/WaterfallsView';

type Section = 'import' | 'dashboards';

/** Native Airtable Review grid — opened in a new tab from the top nav. */
const REVIEW_GRID_URL = 'https://airtable.com/appNBuEitKHz7OyM7/pagZnlBdjiAQT6W8L';

interface ActiveDrill {
    title: string;
    eyebrow?: string;
    records: Impact[];
    key?: string;
    emptyLine?: string;
}

interface AirtableTableLike {
    id: string;
    name: string;
    fields: ReadonlyArray<{id: string; name: string}>;
}

interface BaseLike {
    tables: ReadonlyArray<AirtableTableLike>;
    getTableByNameIfExists(name: string): AirtableTableLike | null;
}

const SCHEMA_SIGNAL_FIELDS: ReadonlyArray<string> = [
    'Validation_Status',
    'Change_Component',
    'Change_Impact',
    'Tags',
];

function pickImpactsTable(base: BaseLike): {table: AirtableTableLike | null; tried: string[]} {
    const exact = base.getTableByNameIfExists(TABLE_NAME);
    if (exact) return {table: exact, tried: []};
    const tried = base.tables.map(t => t.name);
    for (const t of base.tables) {
        const present = new Set(t.fields.map(f => f.name));
        const matches = SCHEMA_SIGNAL_FIELDS.every(s => present.has(s));
        if (matches) return {table: t, tried};
    }
    return {table: null, tried};
}

export function Dashboard() {
    const base = useBase() as unknown as BaseLike;
    const {table, tried} = pickImpactsTable(base);

    if (!table) {
        const detail = tried.length
            ? `Could not find a table named “${TABLE_NAME}” or one with the v3.1 fields. Visible tables: ${tried.join(', ') || '(none)'}.`
            : `This extension expects a table named “${TABLE_NAME}” in the current base.`;
        return <ErrorScreen title="No Impacts table found" detail={detail} />;
    }

    const present = new Set(table.fields.map(f => f.name));
    const missing = missingCoreFields(present);
    if (missing.length) {
        return (
            <ErrorScreen
                title="Schema mismatch"
                detail={`Reading table “${table.name}”. Missing required fields: ${missing.join(', ')}`}
            />
        );
    }

    return <DashboardBody tableName={table.name} />;
}

function DashboardBody({tableName}: {tableName: string}) {
    const {recordsById, fieldsByName, impacts, isReady, accessControlled} = useImpacts(tableName);
    const session = useSession();
    const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
    const [activeDrill, setActiveDrill] = useState<ActiveDrill | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [narrative, setNarrative] = useState(false);
    const [help, setHelp] = useState(false);
    const [section, setSection] = useState<Section>('dashboards');
    const [tab, setTab] = useState<TabKey>('overview');

    // Per-user access: only enforced when the table carries Created / Accessible-by
    // fields AND we can identify the viewer. Otherwise the whole data set is shown.
    const myKeys = useMemo(() => {
        const me = session.currentUser;
        const keys = new Set<string>();
        if (me?.id) keys.add(String(me.id).toLowerCase());
        if (me?.email) keys.add(me.email.toLowerCase());
        return keys;
    }, [session]);

    const visibleImpacts = useMemo(() => {
        if (!accessControlled || myKeys.size === 0) return impacts;
        // A record with no resolvable owner/grant keys is treated as ungated
        // (shown) so a misconfigured field can't hide the whole data set.
        return impacts.filter(r => r.accessKeys.length === 0 || r.accessKeys.some(k => myKeys.has(k)));
    }, [impacts, accessControlled, myKeys]);

    const filtered = useFilteredImpacts(visibleImpacts, filter);
    const aggregations = useAggregations(filtered, visibleImpacts);

    const reviewedCount = useMemo(
        () => visibleImpacts.filter(r => r.validationStatus === 'Reviewed').length,
        [visibleImpacts],
    );
    const hasReviewedData = reviewedCount > 0;

    const openRecord = useCallback(
        (id: string) => {
            const rec = recordsById.get(id);
            if (rec) {
                expandRecord(rec as unknown as Parameters<typeof expandRecord>[0]);
            }
        },
        [recordsById],
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
            const found = visibleImpacts.find(r => r.id === selectedId);
            if (found) return found;
        }
        return filtered.find(r => r.changeImpact === 'High') ?? filtered[0] ?? null;
    }, [selectedId, visibleImpacts, filtered]);

    const freshness = useMemo(() => {
        const latest = aggregations.runs[0];
        if (!latest) return null;
        const m = latest.match(/(\d{4}-\d{2}-\d{2})/);
        return m?.[1] ?? latest;
    }, [aggregations.runs]);

    if (!isReady) {
        return <SkeletonScreen />;
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
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: tokens.colors.bg,
                    paddingTop: tokens.space.lg,
                    paddingBottom: tokens.space.sm,
                    marginTop: `-${tokens.space.lg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: tokens.space.sm,
                    boxShadow: '0 6px 12px -8px rgba(2,35,102,0.14)',
                }}
            >
                <TopNav
                    section={section}
                    onSection={setSection}
                    reviewUrl={REVIEW_GRID_URL}
                    onHelp={() => setHelp(true)}
                />
                <Ribbon
                    showTabs={section === 'dashboards' && hasReviewedData}
                    showNarrative={section === 'dashboards'}
                    tab={tab}
                    onTabChange={setTab}
                    onNarrative={() => setNarrative(true)}
                    runCount={aggregations.runs.length}
                />
                {section === 'dashboards' && hasReviewedData ? (
                    <>
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
                            roles={aggregations.roles}
                            affiliates={aggregations.affiliates}
                            archetypes={aggregations.archetypes}
                            freshness={freshness}
                        />
                    </>
                ) : null}
            </div>

            {section === 'import' ? (
                <ImportPanel tableName={tableName} reviewUrl={REVIEW_GRID_URL} />
            ) : visibleImpacts.length === 0 ? (
                <HelpGuide mode="no-data" accessControlled={accessControlled} onImport={() => setSection('import')} />
            ) : !hasReviewedData ? (
                <HelpGuide mode="awaiting-review" accessControlled={accessControlled} totalCount={visibleImpacts.length} reviewedCount={reviewedCount} onImport={() => setSection('import')} />
            ) : filtered.length === 0 ? (
                <div style={{padding: tokens.space.xxl, background: tokens.colors.bgPanel, border: `1px solid ${tokens.colors.rule}`, borderRadius: tokens.radius.md}}>
                    <EmptyState line="No reviewed impacts match the current filter. Try widening the lens." />
                </div>
            ) : tab === 'overview' ? (
                <>
                    <HeatMap aggregations={aggregations} filtered={filtered} onDrill={handleDrillFromMatrix} />
                    <DiagnosticGrid
                        aggregations={aggregations}
                        recordsById={recordsById}
                        fieldsByName={fieldsByName}
                        onDrill={handleDrillFromMatrix}
                        onOpen={openRecord}
                        onSelect={handleSelect}
                        selectedId={selectedId}
                    />
                    <SourceTrace
                        impact={selectedImpact}
                        record={selectedImpact ? recordsById.get(selectedImpact.id) ?? null : null}
                        fieldsByName={fieldsByName}
                        onOpen={openRecord}
                    />
                </>
            ) : tab === 'heatmaps' ? (
                <HeatmapsView filtered={filtered} onDrill={handleDrillFromMatrix} />
            ) : tab === 'waterfalls' ? (
                <WaterfallsView
                    filtered={filtered}
                    allImpacts={visibleImpacts}
                    runs={aggregations.runs}
                    onDrill={handleDrillFromMatrix}
                />
            ) : tab === 'flows' ? (
                <FlowsView filtered={filtered} onDrill={handleDrillFromMatrix} />
            ) : (
                <RadarsView
                    filtered={filtered}
                    roles={aggregations.roles}
                    onDrill={handleDrillFromMatrix}
                />
            )}

            {activeDrill ? (
                <DrillSheet
                    title={activeDrill.title}
                    eyebrow={activeDrill.eyebrow}
                    records={activeDrill.records}
                    recordsById={recordsById}
                    fieldsByName={fieldsByName}
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

            {help ? <HelpGuide mode="modal" accessControlled={accessControlled} onClose={() => setHelp(false)} /> : null}
        </div>
    );
}

function navItem(on: boolean): React.CSSProperties {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: '0.01em',
        border: `1px solid ${on ? 'rgba(255,255,255,0.55)' : '#0A0D14'}`,
        borderRadius: 10,
        background: '#0A0D14',
        color: '#FFFFFF',
        cursor: 'pointer',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: 'border-color 140ms ease',
    };
}

/** Top navigation — section pills + Guide — on the white page, above the blue ribbon. */
function TopNav({
    section,
    onSection,
    reviewUrl,
    onHelp,
}: {
    section: Section;
    onSection: (s: Section) => void;
    reviewUrl: string;
    onHelp: () => void;
}) {
    return (
        <nav style={{display: 'flex', justifyContent: 'flex-end', gap: tokens.space.sm, flexWrap: 'wrap'}}>
            <button type="button" onClick={() => onSection('import')} style={navItem(section === 'import')}>
                Import Data <span aria-hidden style={{opacity: 0.6}}>›</span>
            </button>
            <a href={reviewUrl} target="_top" rel="noopener" style={navItem(false)}>
                Review Data <span aria-hidden style={{opacity: 0.6}}>›</span>
            </a>
            <button type="button" onClick={() => onSection('dashboards')} style={navItem(section === 'dashboards')}>
                Dashboards <span aria-hidden style={{opacity: 0.6}}>›</span>
            </button>
            <button type="button" onClick={onHelp} title="How the Control Tower works" style={navItem(false)}>
                Guide
            </button>
        </nav>
    );
}

/** Blue ribbon — brand + dashboard sub-tabs + Narrative. */
function Ribbon({
    showTabs,
    showNarrative,
    tab,
    onTabChange,
    onNarrative,
    runCount,
}: {
    showTabs: boolean;
    showNarrative: boolean;
    tab: TabKey;
    onTabChange: (t: TabKey) => void;
    onNarrative: () => void;
    runCount: number;
}) {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: tokens.space.md,
                padding: `${tokens.space.md} ${tokens.space.lg}`,
                borderRadius: tokens.radius.lg,
                background: `linear-gradient(100deg, ${tokens.colors.accentDeep} 0%, ${tokens.colors.accent} 100%)`,
                boxShadow: '0 4px 16px -4px rgba(2,35,102,0.4)',
                flexWrap: 'wrap',
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.md, minWidth: 0}}>
                <span
                    aria-hidden
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: 7,
                        background: 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontSize: 15,
                        flexShrink: 0,
                    }}
                >
                    ◆
                </span>
                <div style={{display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0}}>
                    <h1
                        style={{
                            margin: 0,
                            fontFamily: tokens.fonts.serif,
                            fontSize: 'clamp(16px, 1.8vw, 22px)',
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            color: '#FFFFFF',
                            lineHeight: 1.1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Change Impact · Control Tower
                    </h1>
                    <span className="cia-eyebrow" style={{letterSpacing: '0.18em', color: tokens.colors.accentTint, fontSize: 9}}>
                        ELEVATE-CIA
                    </span>
                </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.md, flexShrink: 0, flexWrap: 'wrap'}}>
                {showTabs ? <Tabs active={tab} onChange={onTabChange} dark /> : null}
                {showNarrative ? (
                    <button
                        type="button"
                        onClick={onNarrative}
                        disabled={runCount === 0}
                        style={{...ctrlBtn, opacity: runCount === 0 ? 0.4 : 1, cursor: runCount === 0 ? 'default' : 'pointer'}}
                    >
                        Narrative ▶
                    </button>
                ) : null}
            </div>
        </header>
    );
}

const ctrlBtn: React.CSSProperties = {
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: tokens.radius.sm,
    background: 'rgba(255,255,255,0.16)',
    color: '#FFFFFF',
    cursor: 'pointer',
};

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
