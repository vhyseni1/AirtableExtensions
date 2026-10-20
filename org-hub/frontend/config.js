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
//                      tier label printed above the level column.
//   levelField       : the row's management tier (e.g. "DLT-2") — one band per
//                      value, displayed through TIER below.
//   orgField         : supervisory organization → one cluster inside the band.
//   positionField    : the position name printed on the slot.
//   currentField / futureField : headcount on each side of the change.
//   fteField         : FTE weight, used when the count toggle is set to FTE.
//   countryField     : ISO codes shown as chips on the slot.
//   stackField       : "Current" / "Future" — which side a row contributes to.
//                      Blank means the row counts on both sides.
//   statusField      : Mapped / Selection / Posted / At risk. Drives the slot
//                      colour and the four KPI columns.
//   tierFields       : the management ladder, top-down. Powers the hierarchical
//                      filter. These are the COLUMN NAMES in the source table;
//                      what the app displays is set by TIER below.
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
    tierFields: ['DLT', 'DLT-1', 'DLT-2', 'DLT-3', 'DLT-4', 'DLT-5', 'DLT-6'],

    // Optional per-slide commentary, keyed by slide title.
    notesTableName: 'Org Design Notes',
    notesKeyField: 'Slide',
    notesSubtitleField: 'Slide Subtitle',
    notesPeopleImpactField: 'Potential People Impact',
    notesAmbitionField: 'Organizational Ambition',
};

// Status → slot appearance. `bucket` is the normalised status; the renderer
// colours a slot by the bucket that dominates it on the side being shown.
//
// Red / amber / slate / indigo. Indigo rather than the navy of the decks this
// renderer was ported from, and no violet at all, so the deck reads as this app
// rather than as that one — a saturated indigo and a desaturated navy are not
// the same impression even though both are blue.
//
// Both checks matter and both were run over ALL SIX pairs, not just neighbours,
// because any two buckets can end up side by side: every `fg` clears WCAG 4.5:1
// on its own `bg` (5.46–12.40), and the worst pair holds ΔE 21.9 under
// deuteranopia, 21.0 under tritanopia, 22.9 in normal vision. For scale, the
// pale-blue and pale-grey these replace sat at 4.8 — indistinguishable. Re-run
// scripts/validate_palette.js from the dataviz skill if you change one.
export const STATUS_COLORS = {
    risk: {bg: '#c92a2a', fg: '#ffffff', label: 'At risk'},
    posted: {bg: '#3b5bdb', fg: '#ffffff', label: 'New position'},
    selection: {bg: '#f0a92b', fg: '#3d2a05', label: 'In selection'},
    mapped: {bg: '#e8ecf4', fg: '#1f2937', label: 'Mapped / no change'},
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
// seniority multiplier per management tier, plus the one-off costs of executing
// change. Every number here is an input to the Savings view and is shown to the
// user as an assumption — nothing is hidden inside the maths.
export const RATE_CARD = {
    currency: 'CHF',
    defaultCostPerFte: 145000,
    byCountry: {
        CHE: 168000, DEU: 132000, ESP: 96000, IRL: 118000,
        POL: 74000, SGP: 121000, GBR: 128000, USA: 156000,
    },
    // Seniority multiplier on the country rate, keyed by the row's RAW tier
    // value as it appears in the data — not its display label.
    levelUplift: {'DLT': 2.4, 'DLT-1': 1.9, 'DLT-2': 1.5, 'DLT-3': 1.15},
    defaultUplift: 1.0,
    // One-off cost of executing the change.
    severanceMonths: 9,          // months of salary per at-risk FTE
    recruitmentCostPerHire: 18000,
    transitionCostPerFte: 3500,
};

// ─── Financial model (cash flow, NPV, scenarios) ─────────────────────────────
//
// The savings model above answers "what does the target state cost?". This one
// answers "when do we actually see it, and what is it worth today?" — which is
// the question a CFO asks second.
//
// Everything here is a demo assumption and is shown to the user as one. Nothing
// is buried inside the arithmetic.
export const FINANCE = {
    horizonMonths: 36,
    // Annual discount rate for NPV. Monthly rate is derived from it, compounded,
    // not divided by twelve.
    discountRateAnnual: 0.08,

    // Benefits do not land the day the design is signed. Headcount leaves over a
    // period, so the run-rate saving ramps in linearly between these two months
    // and is only fully realised after the second.
    benefitRampStartMonth: 3,
    benefitRampEndMonth: 12,
    // One-off costs are committed earlier than the benefits arrive — that gap is
    // the whole reason payback is not instant.
    oneOffSpreadMonths: 9,

    // Illustrative variations on the SAME design, not separately designed
    // options: each scales the modelled change so a reader can see which lever
    // moves payback. `scope` scales the headcount reduction (and with it the
    // run-rate saving and severance); `ramp` shifts how fast it lands;
    // `severanceFactor` models a cheaper or costlier exit route.
    variants: [
        {key: 'designed', label: 'As designed', scope: 1.0, rampShiftMonths: 0, severanceFactor: 1.0,
            note: 'The design as it stands in the deck'},
        {key: 'phased', label: 'Phased over 2 years', scope: 1.0, rampShiftMonths: 9, severanceFactor: 1.0,
            note: 'Same end state, landing nine months later'},
        {key: 'attrition', label: 'Attrition-led', scope: 0.75, rampShiftMonths: 12, severanceFactor: 0.35,
            note: 'Three quarters of the reduction, mostly unreplaced leavers'},
        {key: 'deeper', label: 'Deeper reduction', scope: 1.25, rampShiftMonths: 0, severanceFactor: 1.0,
            note: 'A quarter more again, same timetable'},
    ],

    // One-at-a-time swings on the inputs the result is most exposed to. Each is
    // applied to the designed case and reported as its effect on net year one.
    sensitivities: [
        // Labels are short on purpose: they render in a narrow fixed column
        // alongside the ± figure, and a longer one is simply truncated.
        {key: 'costPerFte', label: 'Cost/FTE', delta: 0.10},
        {key: 'severanceMonths', label: 'Severance', delta: 0.33},
        {key: 'scope', label: 'Scope', delta: 0.20},
        {key: 'ramp', label: 'Timing', delta: 0.50},
    ],
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

// ─── Programme milestones (the PMO view) ─────────────────────────────────────
//
// Optional table. Without it the Programme view explains what it needs rather
// than rendering an empty plan.
export const PROGRAMME = {
    tableName: 'Programme Milestones',
    workstreamField: 'Workstream',
    milestoneField: 'Milestone',
    ownerField: 'Owner',
    dueDateField: 'Due Date',
    statusField: 'Status',
    progressField: 'Progress',
    ragField: 'RAG',
    dependsOnField: 'Depends On',
    countryField: 'Country',
    // A milestone this many days past due with work still open is escalated on
    // the view regardless of its typed RAG — a plan that says Green while the
    // date has passed is the failure mode a PMO view exists to catch.
    overdueEscalationDays: 0,
};

// Status → how a milestone reads. `done` closes it out; anything else is open.
export const MILESTONE_STATUS = {
    'Complete': {done: true, tone: 'good'},
    'In progress': {done: false, tone: 'info'},
    'Not started': {done: false, tone: 'muted'},
    'Blocked': {done: false, tone: 'critical'},
};

export const RAG_COLORS = {
    Green: {color: '#0ca30c', label: 'Green'},
    Amber: {color: '#eda100', label: 'Amber'},
    Red: {color: '#d03b3b', label: 'Red'},
};

// ─── Employee conversations (the HR view) ────────────────────────────────────
//
// Who has to be spoken to, by whom, and whether it has happened. The POPULATION
// is derived from the org-design data — every at-risk or in-selection role owes
// a conversation — so the view is honest about scope even when no tracking
// table exists. The optional table adds the tracking on top.
export const CONVERSATIONS = {
    tableName: 'Employee Conversations',
    employeeField: 'Employee',
    managerField: 'Manager',
    orgField: 'Supervisory Organization',
    countryField: 'Country',
    typeField: 'Conversation Type',
    statusField: 'Status',
    scheduledField: 'Scheduled Date',
    heldField: 'Held Date',
    outcomeField: 'Outcome',
    sentimentField: 'Sentiment',
};

export const CONVERSATION_STATUS = {
    'Held': {tone: 'good', done: true},
    'Scheduled': {tone: 'info', done: false},
    'To schedule': {tone: 'warn', done: false},
    'Declined': {tone: 'critical', done: false},
};

// ─── Programme phases (the executive timeline) ───────────────────────────────
//
// A fixed spine the milestones hang off, so the executive brief can show where
// the programme is without inventing dates.
export const PHASES = ['Design', 'Consultation', 'Selection', 'Transition', 'Close'];

// ─── Table inventory ─────────────────────────────────────────────────────────
//
// Every table the extension looks for, in one list, so the Diagnostics view
// reports exactly what the shell looks up rather than a second copy that can
// drift out of step.
export const TABLES = [
    {key: 'people', label: 'Position view, people tree, org health', name: PEOPLE.tableName},
    {key: 'design', label: 'Deck, impact, savings, works council', name: ORG_DESIGN.tableName},
    {key: 'notes', label: 'Slide notes (optional)', name: ORG_DESIGN.notesTableName},
    {key: 'suporg', label: 'Supervisory tree', name: SUP_ORG.tableName},
    {key: 'programme', label: 'Programme plan', name: PROGRAMME.tableName},
    {key: 'conversations', label: 'Employee conversations', name: CONVERSATIONS.tableName},
];

// ─── Tier labels ─────────────────────────────────────────────────────────────
//
// DISPLAY ONLY. The source data keeps whatever its columns and values are
// called; this is what the app prints. "DLT" is one client's term for a
// leadership tier — most organisations say "Level", counting the top of the
// house as Level 1 — so DLT becomes Level 1, DLT-1 becomes Level 2, and so on.
//
// Renaming here needs no change to the data and no re-import. To stop
// relabelling entirely, set `rules: []` and raw values pass through.
export const TIER = {
    noun: 'Level',
    rules: [
        // Order matters: the numbered form is tried before the bare one, or
        // "DLT-2" would match the /^DLT/ rule and lose its number.
        {match: /^DLT-(\d+)$/i, label: n => `Level ${Number(n) + 1}`},
        {match: /^DLT$/i, label: () => 'Level 1'},
    ],
};

// Map a raw tier value to its display label. Anything the rules don't match is
// passed through unchanged — a base that already says "Level 3" keeps saying it.
export function tierLabel(raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    for (const rule of TIER.rules) {
        const m = value.match(rule.match);
        if (m) return rule.label(m[1]);
    }
    return value;
}
