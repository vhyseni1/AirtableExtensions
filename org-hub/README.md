# Org Hub (Airtable Interface Extension)

One extension covering the whole org-design picture: a **dashboard**, three
**org-chart renderers**, and the **underlying data**. It replaces having to
deploy `Posorgchart` and `org_chart` as two separate blocks — both renderers
live here, side by side, over the same loaded data.

**Everything is read-only.** Cards and rows open the underlying Airtable
record; nothing writes back. (The standalone `org_chart` block supports
drag-to-reparent; that was deliberately not carried over — this extension is
for visibility.)

## Views

```
Dashboard
Org charts ─┬─ Position view        Workday-style: one person in focus, direct reports below
            ├─ Supervisory org      stacked top-down tree of supervisory organisations
            └─ People tree          the same stacked renderer, over reporting lines
Data ───────┬─ Employees & positions
            └─ Supervisory organizations
```

### Dashboard

Headcount and FTE, filled vs. vacant, managers vs. individual contributors,
average and largest span of control, management layers, managers with ≤2
reports, and supervisory orgs with no positions. Below the tiles: headcount by
layer, span-of-control buckets, the ten largest teams, and one breakdown per
dimension configured in `dashboardDimensions`. Exports a summary CSV or a PNG.

### Position view

The focused person sits at the top; their direct reports appear as a grid of
cards below. Click a report to make it the new focus; climb back with the
breadcrumb or the **↑ manager** button. Search jumps to anyone by name, title,
or department. Filter by **Manager** or **Organization** (mutually exclusive —
each gives an unambiguous board). Toggle avatars and the employee-decision
chip. Export a crisp **vector PDF** (drawn with jsPDF primitives, not a
screenshot, so it stays sharp at any zoom and paginates per manager) or a PNG.

### Supervisory org

The stacked chart: a pannable, zoomable canvas with curved SVG connectors,
per-level expand/collapse, and a depth selector (1 / 2 / 3 / All). Card
**border** is `SO Status`, card **fill** is `Scoping`, and the background
histogram sums the headcount rollup at each level. Self-references and circular
parent links are detected and listed in a conflict banner — click a conflict to
open the offending record.

### People tree

The same stacked renderer driven by the reporting hierarchy instead of
supervisory orgs — the whole management chain on one canvas. Any manager can be
picked as the root, so a large org can be sliced to one branch.

### Data

The records as a sortable, searchable, filterable grid (100 rows per page).
Columns are ordered configured-fields-first. Exports the filtered set or the
whole table as CSV. The **Fields** button opens a diagnostics panel showing how
each name in `config.js` resolved against the live table, plus every real field
name and type — the first place to look when something isn't showing.

## Configuration

Every field- and table-name dependency lives in `frontend/config.js`; nothing
else in the code hardcodes one. Field resolution tolerates whitespace and
decorative symbols, so a field whose name ends in an emoji (e.g. `🔗`) still
resolves. An unresolved field is not an error — the detail that uses it is
simply hidden.

### People table (`PEOPLE`)

| Key | Purpose | Configured value |
| --- | --- | --- |
| `tableName` | table to read (`null` ⇒ first table) | `Employees & Positions` |
| `primaryNameSource` | card title; **blank ⇒ the position is vacant** | `[E] First Name, Last Name` |
| `jobTitleField` | job title on the card | `REF Title [F]` |
| `departmentField` | supervisory org on the card | `[F] Supervisory Organization 🔗` |
| `parentLinkField` | link **or lookup** pointing at the manager | `Future Manager` |
| `employeeIdField` / `managerIdField` | id pair used to build the hierarchy | `[E] Employee ID` / `[F] Manager ID` |
| `orgFilterField` | powers the Organization filter | `Future Organization` |
| `employeeDecisionField` | chip on the card, coloured from the select's own swatches | `[D] Employee Decision` |
| `fteField` | FTE for the dashboard and the histogram | `[E] FTE` |
| `dashboardDimensions` | fields to break down on the dashboard | 7 fields |

The hierarchy is resolved in this order: **manager id → employee id** (most
reliable), then the linked-record id, then a name match. That ordering is what
keeps the chart correct when two people share a name.

### Supervisory org table (`SUP_ORG`)

| Key | Purpose | Configured value |
| --- | --- | --- |
| `tableName` | optional — the two supervisory views hide themselves if absent | `Supervisory Organizations` |
| `nameField` | `null` ⇒ the primary field | `null` |
| `parentLinkField` | parent org link (falls back to the first link field) | `Parent Supervisory Organization` |
| `statusField` / `scopingField` | card border / card fill | `SO Status` / `Scoping` |
| `headcountField` | numeric rollup behind the histogram | `[C] SupOrgAssignement % Rollup …` |

Names of the form `Team name (Manager) (OrgID)` are split into their three
parts on the card; anything else renders as a plain team name.

### Per-leader scoping

Set `leaderEmailField` **or** `visibleLeadersField` and each signed-in leader
sees only their own branch, rooted at themselves — every view, including the
data grid. Admin emails in `adminEmails` bypass it. This is **display** scoping:
the extension still loads the full table. For enforced row-level security, pair
it with a native Airtable interface element filtered by
`Visible to leaders = current user` (see `../Posorgchart/RLS.md`). Scoping is
off by default, so the extension shows the full org until you configure it.

## Sample data

`sample-data/` holds two importable CSVs describing one consistent fictional
organisation — 150 positions across 24 supervisory orgs, with vacancies,
hierarchical short codes, part-time FTE and every status value represented.
See [`sample-data/IMPORT.md`](sample-data/IMPORT.md) for the import order and
the field types to set afterwards.

```bash
npm run sample-data    # regenerate the CSVs (deterministic)
npm run check:data     # run both org models over them, outside Airtable
```

## Setup & deploy

```bash
npm install
npm run lint
block run              # live preview
block release          # publish
```

`.block/remote.json` is intentionally absent — run `block init` (or copy one
from a sibling extension) to point this at a block id before releasing.

## Layout

```
frontend/
  index.js              app shell: tabs, sub-tabs, data loading
  config.js             every field/table name lives here
  lib/
    fields.js           defensive cell reading + field resolution
    people.js           the people org model (tree, totals, scoping)
    suporg.js           the supervisory-org model (tree, conflict detection)
    exports.js          PNG / vector PDF / CSV
  components/
    Controls.js         filter, search, export menu, toggle
    PersonCard.js       the Workday card + its two section layouts
    StackedTree.js      the stacked renderer: pan/zoom, connectors, histogram
  views/
    Dashboard.js  PositionChart.js  SupOrgChart.js  PeopleTree.js  DataTable.js
```
