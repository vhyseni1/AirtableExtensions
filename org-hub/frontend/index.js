// Org Hub — one Airtable Interface Extension covering the whole org-design
// picture: a dashboard, two org-chart renderers, and the underlying data.
//
//   Dashboard   — headcount, vacancy, span of control, layers, breakdowns
//   Org charts  — Stacked org     the Apps Script deck: DLT bands of
//                                 supervisory-org clusters of position slots,
//                                 current pass then future pass
//                 Current vs future  the same bands rendered side by side
//                 Position view   Workday-style focus + direct reports
//                 Supervisory org tree / People tree — box hierarchies
//   Data        — every source table as a grid
//
// Everything is read-only. Each table is configured by name in `config.js`;
// nothing else hardcodes a field or table name.

import {
    initializeBlock, useBase, useRecords, useSession, colorUtils,
} from '@airtable/blocks/interface/ui';
import {useState, useMemo, useCallback} from 'react';
import './style.css';

import {PEOPLE, SUP_ORG, ORG_DESIGN, PROGRAMME, CONVERSATIONS} from './config';
import {findTable, findFieldByName, normName} from './lib/fields';
import {
    resolvePeopleConfig, configKey, buildOrg, buildStatusColors,
    computeScope, pruneToScope,
} from './lib/people';
import {resolveSupOrgConfig, buildSupOrgTree} from './lib/suporg';
import {
    resolveOrgDesignConfig, resolveNotesConfig, buildNotesMap, buildStackedModel,
} from './lib/stacked';

import Dashboard from './views/Dashboard';
import PositionChart from './views/PositionChart';
import SupOrgChart from './views/SupOrgChart';
import PeopleTree from './views/PeopleTree';
import DataTable from './views/DataTable';
import StackedDeck from './views/StackedDeck';
import PeopleImpact from './views/PeopleImpact';
import Savings from './views/Savings';
import WorksCouncil from './views/WorksCouncil';
import ExecutiveBrief from './views/ExecutiveBrief';
import Programme from './views/Programme';
import Conversations from './views/Conversations';
import {
    resolveProgrammeConfig, buildProgramme,
    resolveConversationsConfig, buildConversations,
} from './lib/delivery';
import {peopleImpact} from './lib/orgMetrics';
import {depthByNode} from './lib/people';

// ─── Navigation model ────────────────────────────────────────────────────────
//
// Sections and items, rendered as a persistent sidebar so every destination is
// visible at once rather than hidden behind a tab. `needs` names the optional
// table an item depends on; an item whose table is missing is shown disabled
// with the reason, not silently dropped — a demo that quietly loses half its
// menu looks broken rather than unconfigured.

const NAV = [
    {
        key: 'overview',
        label: 'Overview',
        items: [
            {key: 'executive', label: 'Executive brief', icon: '◆', needs: 'design'},
            {key: 'dashboard', label: 'Org health', icon: '◈'},
        ],
    },
    {
        key: 'organisation',
        label: 'Organisation',
        items: [
            {key: 'stacked', label: 'Stacked org', icon: '▤', needs: 'design'},
            {key: 'comparison', label: 'Current vs future', icon: '◨', needs: 'design'},
            {key: 'position', label: 'Position view', icon: '⬡'},
            {key: 'suporg', label: 'Supervisory tree', icon: '⑂', needs: 'suporg'},
            {key: 'people-tree', label: 'People tree', icon: '⑃'},
        ],
    },
    {
        key: 'impact',
        label: 'Impact',
        items: [
            {key: 'people-impact', label: 'People impact', icon: '◉', needs: 'design'},
            {key: 'conversations', label: 'Employee conversations', icon: '◍', needs: 'design'},
            {key: 'works-council', label: 'Works council', icon: '⚖', needs: 'design'},
        ],
    },
    {
        key: 'finance',
        label: 'Finance',
        items: [
            {key: 'savings', label: 'Savings & payback', icon: '▲', needs: 'design'},
        ],
    },
    {
        key: 'delivery',
        label: 'Delivery',
        items: [
            {key: 'programme', label: 'Programme plan', icon: '◎', needs: 'programme'},
        ],
    },
    {
        key: 'data',
        label: 'Data',
        items: [
            {key: 'design-data', label: 'Org design data', icon: '▦', needs: 'design'},
            {key: 'people-data', label: 'Employees & positions', icon: '▦'},
            {key: 'suporg-data', label: 'Supervisory orgs', icon: '▦', needs: 'suporg'},
        ],
    },
];

const ALL_ITEMS = NAV.flatMap(section => section.items);

function Sidebar({view, setView, collapsed, setCollapsed, availability, badges}) {
    return (
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <div className="sidebar-brand">
                <span className="sidebar-mark" />
                {!collapsed && <span className="sidebar-name">Org Hub</span>}
                <button
                    className="sidebar-toggle"
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand menu' : 'Collapse menu'}
                    aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
                >
                    {collapsed ? '›' : '‹'}
                </button>
            </div>

            <nav className="sidebar-nav">
                {NAV.map(section => (
                    <div key={section.key} className="sidebar-section">
                        {!collapsed && <div className="sidebar-section-label">{section.label}</div>}
                        {section.items.map(item => {
                            const ok = !item.needs || availability[item.needs];
                            const badge = badges[item.key];
                            return (
                                <button
                                    key={item.key}
                                    className={`sidebar-item${view === item.key ? ' active' : ''}${ok ? '' : ' disabled'}`}
                                    onClick={() => ok && setView(item.key)}
                                    disabled={!ok}
                                    title={ok ? item.label : `${item.label} — needs the ${item.needs} table`}
                                >
                                    <span className="sidebar-icon">{item.icon}</span>
                                    {!collapsed && <span className="sidebar-label">{item.label}</span>}
                                    {!collapsed && badge != null && badge > 0 && (
                                        <span className={`sidebar-badge${badge > 0 ? ' hot' : ''}`}>{badge}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
}

function TopBar({view, subject, onExport}) {
    const item = ALL_ITEMS.find(i => i.key === view);
    const section = NAV.find(s => s.items.some(i => i.key === view));
    return (
        <div className="topbar">
            <div className="topbar-crumbs">
                <span className="topbar-section">{section ? section.label : ''}</span>
                <span className="topbar-sep">/</span>
                <span className="topbar-view">{item ? item.label : ''}</span>
            </div>
            <div className="topbar-right">
                {subject && <span className="app-subject">{subject}</span>}
                {onExport}
            </div>
        </div>
    );
}

function Notice({children, tone = 'info'}) {
    return <div className={`notice notice-${tone}`}>{children}</div>;
}

// ─── People data (loaded once, shared by every view) ─────────────────────────

function usePeopleOrg(table) {
    const records = useRecords(table);
    const session = useSession();

    const cfg = useMemo(() => resolvePeopleConfig(table, PEOPLE), [table]);
    const key = configKey(cfg);

    const {nodeMap: fullNodeMap} = useMemo(
        () => buildOrg(records, cfg, colorUtils),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, key],
    );

    const viewerEmail = normName(session && session.currentUser ? session.currentUser.email : '');
    const {scope, scopingConfigured, isAdmin} = useMemo(
        () => computeScope({fullNodeMap, cfg, viewerEmail, adminEmails: PEOPLE.adminEmails}),
        [fullNodeMap, cfg, viewerEmail],
    );

    const org = useMemo(() => {
        const pruned = pruneToScope(fullNodeMap, scope);
        return {...pruned, statusColors: buildStatusColors(pruned.nodeMap)};
    }, [fullNodeMap, scope]);

    // Records the viewer may see, in the same order as the table. The data grid
    // and the dashboard both read this so scoping applies consistently.
    const visibleRecords = useMemo(
        () => (scope ? records.filter(r => scope.has(r.id)) : records),
        [records, scope],
    );

    const noView = scopingConfigured && !isAdmin && (!scope || scope.size === 0);

    return {org, cfg, records: visibleRecords, noView, viewerEmail};
}

// ─── Supervisory org data ────────────────────────────────────────────────────

function useSupOrgTree(table) {
    const records = useRecords(table);
    const cfg = useMemo(() => (table ? resolveSupOrgConfig(table, SUP_ORG) : null), [table]);
    const key = cfg ? configKey(cfg) : '';
    const tree = useMemo(
        () => (cfg ? buildSupOrgTree(records, cfg) : {roots: [], conflicts: [], nodeMap: {}}),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, key, !!cfg],
    );
    return {tree, cfg, records};
}

// The supervisory-org table is optional: without it the two supervisory views
// are hidden rather than erroring, so a base with only a people table works.
function SupOrgSection({table, view}) {
    const {tree, cfg, records} = useSupOrgTree(table);
    if (view === 'chart') return <SupOrgChart tree={tree} />;
    return (
        <DataTable
            table={table}
            records={records}
            resolved={cfg}
            groupField={cfg.statusField}
        />
    );
}

// ─── Org design data (the stacked deck) ──────────────────────────────────────

const NO_NOTES = {};

// The notes table is optional, and hooks can't be called conditionally — so
// notes are loaded by a component that only mounts when the table exists.
// Both variants funnel into OrgDesignBody, which hands the built model to a
// render prop; the caller decides which view to draw with it.
function OrgDesignSection({table, notesTable, render}) {
    return notesTable
        ? <OrgDesignWithNotes table={table} notesTable={notesTable} render={render} />
        : <OrgDesignBody table={table} notesMap={NO_NOTES} render={render} />;
}

function OrgDesignWithNotes({table, notesTable, render}) {
    const notesRecords = useRecords(notesTable);
    const notesCfg = useMemo(() => resolveNotesConfig(notesTable, ORG_DESIGN), [notesTable]);
    const notesMap = useMemo(
        () => buildNotesMap(notesRecords || [], notesCfg),
        [notesRecords, notesCfg],
    );
    return <OrgDesignBody table={table} notesMap={notesMap} render={render} />;
}

function OrgDesignBody({table, notesMap, render}) {
    const records = useRecords(table);
    const cfg = useMemo(() => resolveOrgDesignConfig(table, ORG_DESIGN), [table]);
    const key = configKey(cfg);
    const model = useMemo(
        () => buildStackedModel(records, cfg, notesMap),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, key, notesMap],
    );

    // The grid wants plain fields; dltFields is an array of {name, field}.
    const resolvedForGrid = useMemo(() => {
        const out = {...cfg};
        delete out.dltFields;
        cfg.dltFields.forEach(d => { out[d.name] = d.field; });
        return out;
    }, [cfg]);

    return render(model, {records, cfg, resolvedForGrid, table});
}

// ─── App ─────────────────────────────────────────────────────────────────────

function OrgHubApp() {
    const base = useBase();
    const [view, setView] = useState('executive');
    const [collapsed, setCollapsed] = useState(false);

    const peopleTable = findTable(base, PEOPLE.tableName);
    // findTable falls back to the first table in the base, so an optional table
    // that doesn't exist would otherwise masquerade as the people table.
    const optionalTable = useCallback(name => {
        if (!name) return null;
        const t = findTable(base, name);
        return t && peopleTable && t.id === peopleTable.id ? null : t;
    }, [base, peopleTable]);

    const supOrgTable = useMemo(() => optionalTable(SUP_ORG.tableName), [optionalTable]);
    const designTable = useMemo(() => optionalTable(ORG_DESIGN.tableName), [optionalTable]);
    const notesTable = useMemo(() => optionalTable(ORG_DESIGN.notesTableName), [optionalTable]);
    const programmeTable = useMemo(() => optionalTable(PROGRAMME.tableName), [optionalTable]);
    const conversationsTable = useMemo(() => optionalTable(CONVERSATIONS.tableName), [optionalTable]);

    if (!peopleTable) {
        return (
            <div className="app-root">
                <Notice tone="error">
                    {PEOPLE.tableName
                        ? `Table "${PEOPLE.tableName}" not found. Check tableName in frontend/config.js, or configure a table in the Data panel.`
                        : 'No table found. Configure a table in the Data panel.'}
                </Notice>
            </div>
        );
    }

    return (
        <OrgHub
            peopleTable={peopleTable}
            supOrgTable={supOrgTable}
            designTable={designTable}
            notesTable={notesTable}
            programmeTable={programmeTable}
            conversationsTable={conversationsTable}
            view={view}
            setView={setView}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
        />
    );
}

// Programme and conversations are small tables read by several views, so they
// are loaded once here and passed down rather than re-read per view. Each has
// its own component because `useRecords` cannot be called conditionally.
function DeliveryData({programmeTable, conversationsTable, owed, children}) {
    const programmeRecords = useRecords(programmeTable);
    const conversationRecords = useRecords(conversationsTable);

    const programme = useMemo(() => buildProgramme(
        programmeRecords || [],
        programmeTable ? resolveProgrammeConfig(programmeTable) : null,
    ), [programmeRecords, programmeTable]);

    const conversations = useMemo(() => buildConversations(
        conversationRecords || [],
        conversationsTable ? resolveConversationsConfig(conversationsTable) : null,
        {owed},
    ), [conversationRecords, conversationsTable, owed]);

    return children({programme, conversations});
}

function OrgHub({
    peopleTable, supOrgTable, designTable, notesTable,
    programmeTable, conversationsTable, view, setView, collapsed, setCollapsed,
}) {
    const {org, cfg, records, noView, viewerEmail} = usePeopleOrg(peopleTable);

    const dimensionFields = useMemo(
        () => (PEOPLE.dashboardDimensions || [])
            .map(name => findFieldByName(peopleTable, name))
            .filter(Boolean),
        [peopleTable],
    );
    const supOrgDimensionFields = useMemo(
        () => (supOrgTable
            ? (SUP_ORG.dashboardDimensions || []).map(name => findFieldByName(supOrgTable, name)).filter(Boolean)
            : []),
        [supOrgTable],
    );

    const availability = {
        design: !!designTable,
        suporg: !!supOrgTable,
        programme: !!programmeTable,
        conversations: !!conversationsTable,
    };

    // Fall back to a view that actually works if the selected one lost its table.
    const item = ALL_ITEMS.find(i => i.key === view);
    const effective = (item && (!item.needs || availability[item.needs])) ? view : 'dashboard';

    // Span and layer figures for the executive brief, computed from the people
    // tree rather than the design table so they describe the live organisation.
    const orgHealth = useMemo(() => {
        const people = Object.values(org.nodeMap);
        const spans = people.filter(n => n.childIds.length > 0).map(n => n.childIds.length);
        const depths = Object.values(depthByNode(org.nodeMap));
        return {
            avgSpan: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0,
            layers: depths.length ? Math.max(...depths) + 1 : 0,
        };
    }, [org]);

    const subject = `${Object.keys(org.nodeMap).length} positions`;

    if (noView) {
        return (
            <div className="app-shell">
                <Sidebar
                    view={effective} setView={setView}
                    collapsed={collapsed} setCollapsed={setCollapsed}
                    availability={availability} badges={{}}
                />
                <div className="app-main">
                    <Notice tone="warn">
                        This view is personalized per leader, and there is no view available
                        for {viewerEmail ? <strong>{viewerEmail}</strong> : 'your account'}. If
                        you should have access, ask an administrator to add your email as a
                        leader, or to the admin list in <code>frontend/config.js</code>.
                    </Notice>
                </div>
            </div>
        );
    }

    const shell = body => (
        <div className="app-shell">
            <Sidebar
                view={effective} setView={setView}
                collapsed={collapsed} setCollapsed={setCollapsed}
                availability={availability} badges={body.badges || {}}
            />
            <div className="app-main">
                <TopBar view={effective} subject={subject} />
                {body.node}
            </div>
        </div>
    );

    // Views that don't touch the org-design table can render without it.
    const plain = key => {
        if (key === 'dashboard') {
            return supOrgTable ? (
                <DashboardWithSupOrg
                    org={org} supOrgTable={supOrgTable} peopleTable={peopleTable}
                    dimensionFields={dimensionFields} supOrgDimensionFields={supOrgDimensionFields}
                />
            ) : (
                <Dashboard
                    org={org} supOrg={null} peopleTable={peopleTable} supOrgTable={null}
                    dimensionFields={dimensionFields} supOrgDimensionFields={[]}
                />
            );
        }
        if (key === 'people-tree') return <PeopleTree org={org} />;
        if (key === 'suporg') return <SupOrgSection table={supOrgTable} view="chart" />;
        if (key === 'suporg-data') return <SupOrgSection table={supOrgTable} view="data" />;
        if (key === 'people-data') {
            return (
                <DataTable table={peopleTable} records={records}
                    resolved={cfg} groupField={cfg.orgFilterField} />
            );
        }
        return (
            <PositionChart org={org} cfg={cfg}
                decisionFieldPresent={!!cfg.employeeDecisionField} />
        );
    };

    const DESIGN_VIEWS = new Set([
        'executive', 'stacked', 'comparison', 'design-data',
        'people-impact', 'savings', 'works-council', 'conversations', 'programme',
    ]);

    if (!DESIGN_VIEWS.has(effective)) {
        return shell({node: plain(effective)});
    }

    return (
        <OrgDesignSection
            table={designTable}
            notesTable={notesTable}
            render={(model, design) => (
                <DeliveryData
                    programmeTable={programmeTable}
                    conversationsTable={conversationsTable}
                    owed={peopleImpact(model).impacted}
                >
                    {({programme, conversations}) => shell({
                        badges: {
                            programme: programme.available ? programme.overdue.length : 0,
                            conversations: conversations.available
                                ? (conversations.counts['To schedule'] || 0) + conversations.untracked
                                : 0,
                            'works-council': 0,
                        },
                        node: renderDesignView({
                            view: effective, model, programme, conversations,
                            orgHealth, setView, design,
                        }),
                    })}
                </DeliveryData>
            )}
        />
    );
}

function renderDesignView({view, model, programme, conversations, orgHealth, setView, design}) {
    switch (view) {
        case 'design-data':
            return (
                <DataTable
                    table={design.table}
                    records={design.records}
                    resolved={design.resolvedForGrid}
                    groupField={design.cfg.slideTitleField}
                />
            );
        case 'executive':
            return (
                <ExecutiveBrief
                    model={model} programme={programme} conversations={conversations}
                    orgHealth={orgHealth} onNavigate={setView}
                />
            );
        case 'people-impact': return <PeopleImpact model={model} />;
        case 'savings': return <Savings model={model} />;
        case 'works-council': return <WorksCouncil model={model} />;
        case 'programme': return <Programme programme={programme} />;
        case 'conversations': return <Conversations conversations={conversations} />;
        default: return <StackedDeck model={model} variant={view} />;
    }
}

// Loads the supervisory-org tree and hands it to the dashboard.
function DashboardWithSupOrg({org, supOrgTable, peopleTable, dimensionFields, supOrgDimensionFields}) {
    const {tree} = useSupOrgTree(supOrgTable);
    return (
        <Dashboard
            org={org}
            supOrg={tree}
            peopleTable={peopleTable}
            supOrgTable={supOrgTable}
            dimensionFields={dimensionFields}
            supOrgDimensionFields={supOrgDimensionFields}
        />
    );
}

initializeBlock({interface: () => <OrgHubApp />});
