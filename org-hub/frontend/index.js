// Org Hub — one Airtable Interface Extension covering the whole org-design
// picture: a dashboard, two org-chart renderers, and the underlying data.
//
//   Dashboard   — headcount, vacancy, span of control, layers, breakdowns
//   Org charts  — Position view (Workday-style focus + reports)
//                 Supervisory org (stacked top-down tree, the Apps Script port)
//                 People tree     (the same stacked renderer over reporting lines)
//   Data        — Employees & Positions / Supervisory Organizations grids
//
// Everything is read-only. The extension reads two tables, both configured by
// name in `config.js`; nothing else hardcodes a field or table name.

import {
    initializeBlock, useBase, useRecords, useSession, colorUtils,
} from '@airtable/blocks/interface/ui';
import {useState, useMemo} from 'react';
import './style.css';

import {PEOPLE, SUP_ORG} from './config';
import {findTable, findFieldByName, normName} from './lib/fields';
import {
    resolvePeopleConfig, configKey, buildOrg, buildStatusColors,
    computeScope, pruneToScope,
} from './lib/people';
import {resolveSupOrgConfig, buildSupOrgTree} from './lib/suporg';

import Dashboard from './views/Dashboard';
import PositionChart from './views/PositionChart';
import SupOrgChart from './views/SupOrgChart';
import PeopleTree from './views/PeopleTree';
import DataTable from './views/DataTable';

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
            {key: 'position', label: 'Position view'},
            {key: 'suporg', label: 'Supervisory org'},
            {key: 'people-tree', label: 'People tree'},
        ],
    },
    {
        key: 'data',
        label: 'Data',
        subs: [
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

// ─── App ─────────────────────────────────────────────────────────────────────

function OrgHubApp() {
    const base = useBase();
    const [tab, setTab] = useState('dashboard');
    const [sub, setSub] = useState('position');

    const peopleTable = findTable(base, PEOPLE.tableName);
    const supOrgTable = useMemo(() => {
        if (!SUP_ORG.tableName) return null;
        const t = findTable(base, SUP_ORG.tableName);
        // findTable falls back to the first table; don't mistake the people
        // table for a supervisory-org table when the latter doesn't exist.
        return t && peopleTable && t.id === peopleTable.id ? null : t;
    }, [base, peopleTable]);

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

    return <OrgHub base={base} peopleTable={peopleTable} supOrgTable={supOrgTable}
        tab={tab} setTab={setTab} sub={sub} setSub={setSub} />;
}

// Split from OrgHubApp so the hooks below never run before the table check
// above has passed (hooks can't be called conditionally).
function OrgHub({peopleTable, supOrgTable, tab, setTab, sub, setSub}) {
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

    const supOrgAvailable = !!supOrgTable;
    const effectiveSub = (!supOrgAvailable && (sub === 'suporg' || sub === 'suporg-data'))
        ? (tab === 'charts' ? 'position' : 'people-data')
        : sub;

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
    } else if (tab === 'charts') {
        if (effectiveSub === 'suporg') {
            body = supOrgAvailable
                ? <SupOrgSection table={supOrgTable} view="chart" />
                : <Notice tone="warn">No supervisory-organization table found.</Notice>;
        } else if (effectiveSub === 'people-tree') {
            body = <PeopleTree org={org} />;
        } else {
            body = (
                <PositionChart
                    org={org}
                    cfg={cfg}
                    decisionFieldPresent={!!cfg.employeeDecisionField}
                />
            );
        }
    } else {
        if (effectiveSub === 'suporg-data') {
            body = supOrgAvailable
                ? <SupOrgSection table={supOrgTable} view="data" />
                : <Notice tone="warn">No supervisory-organization table found.</Notice>;
        } else {
            body = (
                <DataTable
                    table={peopleTable}
                    records={records}
                    resolved={cfg}
                    groupField={cfg.orgFilterField}
                />
            );
        }
    }

    return (
        <div className="app-root">
            <Header tab={tab} setTab={setTab} sub={effectiveSub} setSub={setSub} subject={subject} />
            {!supOrgAvailable && tab === 'charts' && (
                <Notice tone="info">
                    Supervisory-organization views are hidden: no table named
                    “{SUP_ORG.tableName}” in this base.
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
