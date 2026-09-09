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

// ─── Org design data (the stacked slide views) ───────────────────────────────
//
// The port of the Apps Script "Slide Deck Studio" model. Its source is a flat,
// pre-aggregated table — one row per (slide, level, supervisory org, position,
// country) — carrying a CURRENT and a FUTURE headcount. That shape is what
// makes a current-vs-future restructuring readable; it is deliberately not the
// same table as the per-person Employees & Positions.
//
//   slideTitleField  : groups rows into slides (one deck page per value).
//   sectionNameField / sectionLevelField : the slide's section header and the
//                      DLT label printed above the level column.
//   levelField       : the row's DLT level (e.g. "DLT-2") — one band per value.
//   orgField         : supervisory organization → one cluster inside the band.
//   positionField    : the position name printed on the slot.
//   currentField / futureField : headcount on each side of the change.
//   fteField         : FTE weight, used when the count toggle is set to FTE.
//   countryField     : ISO codes shown as chips on the slot.
//   stackField       : "Current" / "Future" — which side a row contributes to.
//                      Blank means the row counts on both sides.
//   statusField      : Mapped / Selection / Posted / At risk. Drives the slot
//                      colour and the four KPI columns.
//   dltFields        : the DLT ladder, top-down. Powers the hierarchical filter.
//
export const ORG_DESIGN = {
    tableName: 'Org Design Data',
    slideTitleField: 'Slide Title',
    sectionNameField: 'Section Name',
    sectionLevelField: 'Section Level',
    levelField: 'Level',
    orgField: 'Supervisory Organization',
    positionField: 'Position Name',
    currentField: 'Current HC',
    futureField: 'Future HC',
    fteField: 'FTE',
    countryField: 'Country',
    stackField: 'Stack',
    statusField: 'Status',
    positionIdField: 'Position ID',
    dltFields: ['DLT', 'DLT-1', 'DLT-2', 'DLT-3', 'DLT-4', 'DLT-5', 'DLT-6'],

    // Optional per-slide commentary, keyed by slide title.
    notesTableName: 'Org Design Notes',
    notesKeyField: 'Slide',
    notesSubtitleField: 'Slide Subtitle',
    notesPeopleImpactField: 'Potential People Impact',
    notesAmbitionField: 'Organizational Ambition',
};

// Status → slot appearance. `bucket` is the normalised status; the renderer
// colours a slot by the bucket that dominates it on the side being shown.
export const STATUS_COLORS = {
    risk: {bg: '#b14cff', fg: '#ffffff', label: 'At risk'},
    posted: {bg: '#0b2a63', fg: '#ffffff', label: 'New position'},
    selection: {bg: '#cfeaff', fg: '#0b1220', label: 'In selection'},
    mapped: {bg: '#eeeeee', fg: '#111827', label: 'Mapped / no change'},
};

// The slide canvas. 1280×720 is the 16:9 geometry the Apps Script decks use,
// and what the PDF export writes one slide per page at.
export const SLIDE = {width: 1280, height: 720};

// ─── Visualization palette ───────────────────────────────────────────────────
//
// Validated against a #ffffff surface: lightness band, chroma floor, CVD
// separation and normal-vision separation all pass; the yellow sits below 3:1
// contrast, which is relieved by every bar carrying a visible label and value.
// Re-run any change through a palette validator rather than eyeballing it.
//
// These are the DASHBOARD colours. The deck slides keep their own ported
// palette (STATUS_COLORS above) so exported decks still match the client's
// existing ones — the two are deliberately allowed to differ.
export const VIZ = {
    // Workforce-transition status → colour. Order matters: adjacent pairs were
    // checked for colour-blind separation in this sequence.
    status: {
        risk: {color: '#d03b3b', label: 'At risk'},
        selection: {color: '#eda100', label: 'In selection'},
        mapped: {color: '#2a78d6', label: 'Mapped'},
        posted: {color: '#0ca30c', label: 'New position'},
    },
    // Single hue for magnitude-only charts (one series, no identity to encode).
    magnitude: '#2a78d6',
    positive: '#0ca30c',
    negative: '#d03b3b',
    neutral: '#94a3b8',
};

// ─── Savings model ───────────────────────────────────────────────────────────
//
// Demo assumptions. Fully-loaded annual cost per FTE by country, scaled by a
// seniority multiplier per DLT level, plus the one-off costs of executing the
// change. Every number here is an input to the Savings view and is shown to the
// user as an assumption — nothing is hidden inside the maths.
export const RATE_CARD = {
    currency: 'CHF',
    defaultCostPerFte: 145000,
    byCountry: {
        CHE: 168000, DEU: 132000, ESP: 96000, IRL: 118000,
        POL: 74000, SGP: 121000, GBR: 128000, USA: 156000,
    },
    // Seniority multiplier on the country rate, keyed by the row's DLT level.
    levelUplift: {'DLT': 2.4, 'DLT-1': 1.9, 'DLT-2': 1.5, 'DLT-3': 1.15},
    defaultUplift: 1.0,
    // One-off cost of executing the change.
    severanceMonths: 9,          // months of salary per at-risk FTE
    recruitmentCostPerHire: 18000,
    transitionCostPerFte: 3500,
};

// ─── Works council / employee representation ─────────────────────────────────
//
// Which body must be consulted per country, how much notice it needs, and when
// consultation (rather than information) is triggered.
//
// Collective-redundancy rules are typically the LOWER of an absolute floor and
// a percentage of the local establishment — a handful of people at a small site
// can trigger the same duty as a large number at a big one. Modelling only the
// absolute number makes every small country look exempt, which is exactly the
// mistake that gets missed in planning.
//
// Demo values — confirm against local counsel before real use.
export const WORKS_COUNCIL = {
    byCountry: {
        DEU: {body: 'Betriebsrat', noticeWeeks: 8, threshold: 26, thresholdPct: 0.10},
        ESP: {body: 'Comité de Empresa', noticeWeeks: 4, threshold: 10, thresholdPct: 0.10},
        POL: {body: 'Rada Pracowników', noticeWeeks: 4, threshold: 20, thresholdPct: 0.10},
        CHE: {body: 'Arbeitnehmervertretung', noticeWeeks: 2, threshold: 30, thresholdPct: 0.10},
        IRL: {body: 'Employee Forum', noticeWeeks: 4, threshold: 20, thresholdPct: 0.10},
        SGP: {body: 'Union representative', noticeWeeks: 4, threshold: 5, thresholdPct: 0.25},
        GBR: {body: 'Employee Consultation Forum', noticeWeeks: 6, threshold: 20, thresholdPct: 0.10},
        USA: {body: 'None (at-will)', noticeWeeks: 0, threshold: 50, thresholdPct: 0.33},
    },
    defaultBody: 'Local employee representatives',
    defaultNoticeWeeks: 4,
    defaultThreshold: 20,
    defaultThresholdPct: 0.10,
    // Where the demo says the exported pack lands.
    driveLocation: 'PwC · Org Design Shared Drive / Works Council Packs',
};
