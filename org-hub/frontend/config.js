// ─── Data source configuration ───────────────────────────────────────────────
//
// Every field-name dependency in Org Hub lives here. Nothing else in the code
// hardcodes a field name, so re-pointing the extension at a differently-named
// base is a one-file change. Use the "Fields" panel in the Data tab to see how
// each entry resolved against the live table.
//
// Field resolution tolerates whitespace and decorative symbols (e.g. the "🔗"
// link emoji), so a field whose name ends in an emoji still resolves.

// ─── People table (positions + incumbents) ───────────────────────────────────
//
//   tableName         : table to read from (null ⇒ first table in the base).
//   primaryNameSource : 'name' ⇒ the record's primary field as the card title,
//                       or a field name to use a specific field. A row with an
//                       empty value here is treated as a VACANT position.
//   jobTitleField     : job title shown on the card (null to hide).
//   departmentField   : supervisory organization shown on the card.
//   statusField       : optional coloured accent + legend (null = off).
//   parentLinkField   : field pointing to a person's manager. May be a
//                       linked-record field OR a lookup.
//   employeeIdField   : each person's unique id. Combined with managerIdField
//                       the hierarchy is built by id — robust when two people
//                       share a name.
//   managerIdField    : the manager's unique id for this person.
//   orgFilterField    : powers the "Organization" filter; falls back to
//                       departmentField when it doesn't resolve.
//
export const PEOPLE = {
    tableName: 'Employees & Positions',
    primaryNameSource: '[E] First Name, Last Name',
    jobTitleField: 'REF Title [F]',
    departmentField: '[F] Supervisory Organization 🔗',
    statusField: null,
    parentLinkField: 'Future Manager',
    employeeIdField: '[E] Employee ID',
    managerIdField: '[F] Manager ID',
    orgFilterField: 'Future Organization',
    shortCodeField: 'Short Code',
    employeeDecisionField: '[D] Employee Decision',

    // ─── Per-leader scoping (display-only) ───────────────────────────────────
    // When configured, each signed-in leader sees only their own branch. This is
    // DISPLAY scoping — the extension still loads the full table. For enforced
    // row-level security, pair it with a native Airtable interface element
    // filtered by "Visible to leaders = current user" (see Posorgchart/RLS.md).
    leaderEmailField: null,
    visibleLeadersField: null,
    adminEmails: [],

    // Extra columns surfaced in the Data tab and the Dashboard breakdowns.
    // Each entry is a field NAME; unresolved names are skipped silently.
    dashboardDimensions: [
        '[F] Supervisory Organization 🔗',
        'Future Organization',
        '[E] Location',
        '[E] Job Family',
        '[E] Grade',
        '[E] Employment Type',
        '[D] Employee Decision',
    ],
    fteField: '[E] FTE',
    positionStatusField: '[E] Position Status',
};

// ─── Supervisory organization table (the stacked org chart) ──────────────────
//
//   nameField      : null ⇒ the record's primary field. Names of the shape
//                    "Team (Manager) (OrgID)" are split into their three parts
//                    on the card; anything else renders as-is.
//   parentLinkField: link to the parent supervisory org. When it doesn't
//                    resolve, the first linked-record field is auto-detected.
//   statusField    : drives the card BORDER colour + legend.
//   scopingField   : drives the card FILL colour + legend.
//   headcountField : numeric rollup used by the per-level histogram.
//
export const SUP_ORG = {
    tableName: 'Supervisory Organizations',
    nameField: null,
    parentLinkField: 'Parent Supervisory Organization',
    statusField: 'SO Status',
    scopingField: 'Scoping',
    shortCodeField: 'Short Code',
    headcountField: '[C] SupOrgAssignement % Rollup (from Employees & Positions / FUTURE)',
    orgIdField: 'SO ID',
    dashboardDimensions: ['SO Status', 'Scoping', 'Org Level'],
};

// SO Status → card border colour.
export const SO_STATUS_COLORS = {
    'No Changes SO': '#8b8b8b',
    'New SO - Draft': '#f59e0b',
    'New SO': '#22c55e',
    'Updated SO': '#3b82f6',
    'Decommissioned SO': '#ef4444',
};

// Scoping → card fill colour (background, dot).
export const SCOPING_COLORS = {
    'In Scope': {bg: '#eff6ff', dot: '#3b82f6'},
    'Out of Scope': {bg: '#fef2f2', dot: '#ef4444'},
};
