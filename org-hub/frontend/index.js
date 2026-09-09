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

import {PEOPLE, SUP_ORG, ORG_DESIGN} from './config';
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

// ─── Navigation model ────────────────────────────────────────────────────────
//
// Two levels: a tab, and (for tabs that have them) a sub-tab. Kept as data so
// the header renders itself and adding a view is a one-entry change.

const NAV = [
    {key: 'dashboard', label: 'Dashboard'},
    {
        key: 'charts',
        label: 'Org charts',
        subs: [
            {key: 'stacked', label: 'Stacked org'},
            {key: 'comparison', label: 'Current vs future'},
            {key: 'position', label: 'Position view'},
            {key: 'suporg', label: 'Supervisory org tree'},
            {key: 'people-tree', label: 'People tree'},
        ],
    },
    {
        key: 'data',
        label: 'Data',
        subs: [
            {key: 'design-data', label: 'Org design data'},
            {key: 'people-data', label: 'Employees & positions'},
            {key: 'suporg-data', label: 'Supervisory organizations'},
        ],
    },
];

function Header({tab, setTab, sub, setSub, subject}) {
    const active = NAV.find(t => t.key === tab) || NAV[0];
    return (
        <div className="app-header">
            <div className="app-header-top">
                <span className="app-title">Org Hub</span>
                <nav className="tabs">
                    {NAV.map(t => (
                        <button
                            key={t.key}
                            className={`tab ${t.key === tab ? 'active' : ''}`}
                            onClick={() => {
                                setTab(t.key);
                                if (t.subs) setSub(t.subs[0].key);
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </nav>
                {subject && <span className="app-subject">{subject}</span>}
            </div>
            {active.subs && (
                <nav className="subtabs">
                    {active.subs.map(s => (
                        <button
                            key={s.key}
                            className={`subtab ${s.key === sub ? 'active' : ''}`}
                            onClick={() => setSub(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>
            )}
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
function OrgDesignSection({table, notesTable, view}) {
    return notesTable
        ? <OrgDesignWithNotes table={table} notesTable={notesTable} view={view} />
        : <OrgDesignBody table={table} notesMap={NO_NOTES} view={view} />;
}

function OrgDesignWithNotes({table, notesTable, view}) {
    const notesRecords = useRecords(notesTable);
    const notesCfg = useMemo(() => resolveNotesConfig(notesTable, ORG_DESIGN), [notesTable]);
    const notesMap = useMemo(
        () => buildNotesMap(notesRecords || [], notesCfg),
        [notesRecords, notesCfg],
    );
    return <OrgDesignBody table={table} notesMap={notesMap} view={view} />;
}

function OrgDesignBody({table, notesMap, view}) {
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

    if (view === 'data') {
        return (
            <DataTable
                table={table}
                records={records}
                resolved={resolvedForGrid}
                groupField={cfg.slideTitleField}
            />
        );
    }
    return <StackedDeck model={model} variant={view} />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

function OrgHubApp() {
    const base = useBase();
    const [tab, setTab] = useState('dashboard');
    const [sub, setSub] = useState('stacked');

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
            tab={tab} setTab={setTab} sub={sub} setSub={setSub}
        />
    );
}

// Split from OrgHubApp so the hooks below never run before the table check
// above has passed (hooks can't be called conditionally).
function OrgHub({peopleTable, supOrgTable, designTable, notesTable, tab, setTab, sub, setSub}) {
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

    // Sub-views that depend on an optional table. When it is missing the view
    // is unavailable rather than broken, and the shell falls back to a sibling.
    const requires = {
        stacked: designTable,
        comparison: designTable,
        'design-data': designTable,
        suporg: supOrgTable,
        'suporg-data': supOrgTable,
    };
    const fallback = {charts: 'position', data: 'people-data'};
    const available = !(sub in requires) || !!requires[sub];
    const effectiveSub = available ? sub : (fallback[tab] || sub);

    const missingTableFor = key => (key === 'stacked' || key === 'comparison' || key === 'design-data'
        ? ORG_DESIGN.tableName
        : SUP_ORG.tableName);

    const subject = `${Object.keys(org.nodeMap).length} positions`;

    if (noView) {
        return (
            <div className="app-root">
                <Header tab={tab} setTab={setTab} sub={effectiveSub} setSub={setSub} />
                <Notice tone="warn">
                    This view is personalized per leader, and there is no view available
                    for {viewerEmail ? <strong>{viewerEmail}</strong> : 'your account'}. If
                    you should have access, ask an administrator to add your email as a
                    leader, or to the admin list in <code>frontend/config.js</code>.
                </Notice>
            </div>
        );
    }

    let body = null;
    if (tab === 'dashboard') {
        // The supervisory-org tree needs useRecords on a second table, which
        // can't be called conditionally — hence the two variants.
        body = supOrgTable ? (
            <DashboardWithSupOrg
                org={org}
                supOrgTable={supOrgTable}
                peopleTable={peopleTable}
                dimensionFields={dimensionFields}
                supOrgDimensionFields={supOrgDimensionFields}
            />
        ) : (
            <Dashboard
                org={org}
                supOrg={null}
                peopleTable={peopleTable}
                supOrgTable={null}
                dimensionFields={dimensionFields}
                supOrgDimensionFields={[]}
            />
        );
    } else if (effectiveSub === 'stacked' || effectiveSub === 'comparison') {
        body = (
            <OrgDesignSection
                table={designTable}
                notesTable={notesTable}
                view={effectiveSub}
            />
        );
    } else if (effectiveSub === 'design-data') {
        body = <OrgDesignSection table={designTable} notesTable={notesTable} view="data" />;
    } else if (effectiveSub === 'suporg') {
        body = <SupOrgSection table={supOrgTable} view="chart" />;
    } else if (effectiveSub === 'suporg-data') {
        body = <SupOrgSection table={supOrgTable} view="data" />;
    } else if (effectiveSub === 'people-tree') {
        body = <PeopleTree org={org} />;
    } else if (effectiveSub === 'people-data') {
        body = (
            <DataTable
                table={peopleTable}
                records={records}
                resolved={cfg}
                groupField={cfg.orgFilterField}
            />
        );
    } else {
        body = (
            <PositionChart
                org={org}
                cfg={cfg}
                decisionFieldPresent={!!cfg.employeeDecisionField}
            />
        );
    }

    return (
        <div className="app-root">
            <Header tab={tab} setTab={setTab} sub={effectiveSub} setSub={setSub} subject={subject} />
            {!available && (
                <Notice tone="info">
                    That view needs a table named “{missingTableFor(sub)}”, which this base
                    doesn’t have — showing “{effectiveSub}” instead. See
                    <code> sample-data/IMPORT.md </code> to create it.
                </Notice>
            )}
            {body}
        </div>
    );
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
