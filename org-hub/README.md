# Org Hub (Airtable Interface Extension)

One extension covering the whole org-design picture: a **dashboard**, five
**chart renderers**, and the **underlying data**. It brings together three
things that used to be separate deployments:

| Source | What came across |
| --- | --- |
| [`vhyseni1/orgdesiger`](https://github.com/vhyseni1/orgdesiger) (Apps Script) | the **stacked org deck** — `StackedOrg.html`'s one-side-per-slide renderer and `Index.html`'s side-by-side current/future layout, with their model (`buildStackedOrgModel_`), status buckets, KPI table and slide pagination |
| `../Posorgchart` | the **position view** — Workday-style focus + direct reports |
| `../org_chart` | the **supervisory org tree** — the collapsible box hierarchy |

**Almost everything is read-only.** Cards and rows open the underlying Airtable
record. The one exception is **drag-to-re-report** on the position view and the
people tree: dragging a card onto another person changes who that position
reports to, and writes it back. Every other view, including the supervisory-org
tree, only reads.

## Views

Navigation is a persistent left sidebar, grouped by who is asking:

```
Overview     ─┬─ Executive brief      the CEO screen: one-line summary + what needs you
              └─ Org health           spans, layers, vacancy, breakdowns
Organisation ─┬─ Stacked org           the deck: tier bands → org clusters → position slots,
            │                        current pass then future pass
            ├─ Current vs future     the same bands, both states side by side
            ├─ Position view         Workday-style: one person in focus, reports below
            ├─ Supervisory org tree  collapsible box hierarchy of supervisory orgs
              └─ People tree         the same box renderer, over reporting lines
Impact       ─┬─ People impact        headcount bridge, status split, breakdowns
              ├─ Employee conversations   who owes a conversation, and who has had one
              └─ Works council        consultation obligations + the export ceremony
Finance      ─── Savings & payback    cost bridge, cash flow, scenarios, sensitivity
Delivery     ─── Programme plan       milestones, workstream RAG, what is late
Data         ─┬─ Org design data
              ├─ Employees & positions
              └─ Supervisory organizations
```

A menu item whose optional table is missing is shown **disabled with the reason**
rather than hidden — a demo that quietly loses half its menu looks broken rather
than unconfigured.

The five chart views read **two different shapes of data**, and that is the
thing to understand before configuring anything:

- The two **stacked views** read a flat, pre-aggregated table — one row per
  (slide, level, supervisory org, position, side) with a `Current HC` and a
  `Future HC`. That shape is what makes a restructuring legible: you can show
  the same position shrinking on one side and being posted on the other.
- The three **hierarchy views** read the per-person table and follow the
  manager link.

Neither can be derived from the other automatically, so both tables exist.

### Dashboard

Headcount and FTE, filled vs. vacant, managers vs. individual contributors,
average and largest span of control, management layers, managers with ≤2
reports, and supervisory orgs with no positions. Below the tiles: headcount by
layer, span-of-control buckets, the ten largest teams, and one breakdown per
dimension configured in `dashboardDimensions`. Exports a summary CSV or a PNG.

### Stacked org

The deck renderer. Each slide is a fixed 1280×720 canvas: a management-tier band per
row, supervisory-org clusters inside it, and position slots stacked three to a
column. Slot colour is the status bucket (at risk, in selection, mapped, newly
posted); the badge is the headcount, with a red `−N` on the current side and a
green `+N` on the future side. The head bar carries the four-column KPI table —
As Is / At Risk / New Pos / Proposed — for both the page and the whole slide.

Every current slide is emitted before every future slide, so the deck reads as
"here is today" then "here is the target". Slides paginate row by row against
the real canvas height, so a level band that doesn't fit continues on the next
page under a repeated label rather than pushing a near-empty page.

Filter by the **management ladder** — a hierarchical tree from the top of the house
down to each slide, with partial selection shown as an indeterminate checkbox.
Toggle **Headcount / FTE**, show or hide the notes band, cycle the zoom, and
export the whole deck as a **16:9 PDF, one slide per page**, a PNG, or the KPIs
as CSV.

### Current vs future

The same level bands rendered twice on one slide — current on the left, future
on the right — for when a reader needs to compare the two states directly
rather than page between them. Clusters wrap sooner (half the width) and
pagination accounts for whichever side is taller.

### Position view

The focused person sits at the top; their direct reports appear as a grid of
cards below. Click a report to make it the new focus; climb back with the
breadcrumb or the **↑ manager** button. **Drag any card onto another person** to
make them its new manager — see [Changing reporting lines](#changing-reporting-lines). Search jumps to anyone by name, title,
or department. Filter by **Manager** or **Organization** (mutually exclusive —
each gives an unambiguous board). Toggle avatars and the employee-decision
chip. Export a crisp **vector PDF** (drawn with jsPDF primitives, not a
screenshot, so it stays sharp at any zoom and paginates per manager) or a PNG.

### Supervisory org tree

A pannable, zoomable canvas with curved SVG connectors,
per-level expand/collapse, and a depth selector (1 / 2 / 3 / All). Card
**border** is `SO Status`, card **fill** is `Scoping`, and the background
histogram sums the headcount rollup at each level. Self-references and circular
parent links are detected and listed in a conflict banner — click a conflict to
open the offending record.

### People tree

The same stacked renderer driven by the reporting hierarchy instead of
supervisory orgs — the whole management chain on one canvas. Any manager can be
picked as the root, so a large org can be sliced to one branch. Cards drag to
re-report here too, on the same rules as the position view.

### Data

Each source table as a sortable, searchable, filterable grid (100 rows per page).
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

### Org design table (`ORG_DESIGN`)

The flat table behind the two stacked views. Optional — without it those views
hide themselves and the shell falls back to the position view.

| Key | Purpose | Configured value |
| --- | --- | --- |
| `tableName` | the deck's source table | `Org Design Data` |
| `slideTitleField` | groups rows into slides — one deck page per value | `Slide Title` |
| `sectionNameField` / `sectionLevelField` | the head-bar label and the tier label above the level column | `Section Name` / `Section Level` |
| `levelField` | the row's management tier — one band per value | `Level` |
| `orgField` | supervisory organization — one cluster per value | `Supervisory Organization` |
| `positionField` | the position name on the slot | `Position Name` |
| `currentField` / `futureField` | headcount on each side of the change | `Current HC` / `Future HC` |
| `stackField` | `Current` / `Future` / blank — which side a row counts on | `Stack` |
| `statusField` | Mapped / Selection / Posted / At risk → slot colour + KPI columns | `Status` |
| `tierFields` | the management ladder, top-down — powers the hierarchical filter | `DLT`, `DLT-1` … `DLT-6` |
| `notesTableName` | optional per-slide subtitle and commentary | `Org Design Notes` |

**A blank `Stack` means the row counts on both sides.** That is how the source
decks encode "unchanged", and dropping those rows would empty the deck.

Status values are bucketed leniently — the same normalisation the Apps Script
uses, so `Potentially at risk`, `To be posted` and `In selection process` all
land correctly without having to clean the source data first.

### Tier labels

The app shows **Level 1, Level 2, …** wherever the data says `DLT`, `DLT-1`, …
That is a display mapping in `TIER` (`frontend/config.js`) — the columns and
values in the source table are untouched, so renaming needs no data change and
no re-import. A value the rules don't match passes through unchanged, so a base
that already says `Level 3` keeps saying it. Set `rules: []` to turn the
mapping off entirely.

Two differences from the Apps Script, both deliberate:

- **Country flags render as ISO-code chips, not flag images.** The source fetches
  PNGs from a CDN; an extension iframe can't rely on that, and the code is the
  unambiguous label anyway.
- **No client logo on the slide.** Add one in `components/Slide.js` if you want
  it; it is not baked in.

### Financials

Two views carry money: the executive brief leads with **baseline vs scenario**
and when the benefit arrives; **Savings & payback** carries the full model.

`savings()` answers *what does the target state cost once we are in it* — a
run-rate. That is the right number for the bridge and the wrong one for a CFO,
because it assumes the change is already finished. `lib/finance.js` answers the
next two questions off a **monthly cash flow** instead:

- **Benefits ramp.** Nothing lands on day one. The saving ramps in linearly
  between `benefitRampStartMonth` and `benefitRampEndMonth`; the one-off cost
  is committed over `oneOffSpreadMonths`, starting immediately. That gap is the
  entire reason payback is not instant.
- **Payback is read off the cumulative series**, not computed as
  `oneOff / (grossAnnual / 12)`. The shortcut assumes full run-rate from month
  one and flatters the answer — on the sample data it says 18.8 months where
  the phased figure is 25.8. The view shows both, so the difference is visible
  rather than quietly corrected.
- **NPV** discounts each month at a rate *compounded* from the annual one, not
  the annual rate divided by twelve.
- **Net year one** is the first twelve months of the actual flow. It is shown
  in two places and comes from one source; a test pins them together.

**Scenario comparison** varies the *same* design — it is not four separately
designed target states, and the view says so. `scope` scales the reduction (and
the severance with it, since fewer exits cost less to execute, while
recruitment and transition are untouched because they attach to the new roles);
`rampShiftMonths` moves how fast it lands; `severanceFactor` models a cheaper
exit route. On the sample data "phased over two years" has a *negative* NPV —
the same end state, nine months later, is worth less than doing nothing.

**Sensitivity** swings one assumption at a time and ranks by the swing in net
year one, biggest first — that is the assumption worth arguing about.

Every input lives in `FINANCE` and `RATE_CARD` in `config.js` and is printed in
the view. These are demo assumptions, not actuals.

### Changing reporting lines

Dragging a card onto another person on the position view or the people tree
rewrites that position's manager. Two details matter:

**It writes two fields, not one.** The hierarchy resolves a manager from
`managerIdField` *first* and only falls back to `parentLinkField` (see "The
hierarchy is resolved in this order" above). Writing just the link would leave
the old manager id in place, the tree would rebuild exactly as it was, and the
card would appear to snap back. So one drop sets both: the link to the new
manager's record, and the manager-id text to the new manager's **employee id**.
When the new manager has no employee id the manager-id field is blanked rather
than left stale, so resolution falls through to the link.

**A lookup cannot be written.** `parentLinkField` may be a lookup, which is
computed. Then the manager-id field carries the change alone — which is what
resolution reads first anyway. If the link is a lookup *and* the manager-id
field is also non-writable, the drop is refused with that reason rather than
appearing to work.

Drops that would break the tree are refused before any write: onto yourself,
onto your own descendant (which would make a loop), or onto the manager you
already report to. Airtable's own permissions are checked too, and a refusal
shows the reason Airtable gives.

The supervisory-org tree is deliberately **not** draggable — it nests
organizations, not reporting lines.

### Per-leader scoping

Set `leaderEmailField` **or** `visibleLeadersField` and each signed-in leader
sees only their own branch, rooted at themselves — every view, including the
data grid. Admin emails in `adminEmails` bypass it. This is **display** scoping:
the extension still loads the full table. For enforced row-level security, pair
it with a native Airtable interface element filtered by
`Visible to leaders = current user` (see `../Posorgchart/RLS.md`). Scoping is
off by default, so the extension shows the full org until you configure it.

## Sample data

`sample-data/` holds four importable CSVs describing one consistent fictional
organisation — 150 positions across 24 supervisory orgs, plus a restructuring
scenario rendered as a 22-slide deck. Vacancies (including a vacant manager),
hierarchical short codes, part-time FTE and every status value are represented,
and the deck's current headcount reconciles with the people table org by org.
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
    reparent.js         the one write path: validate a drop, build the update
    finance.js          cash flow, NPV, payback, scenarios, sensitivity
    people.js           the people org model (tree, totals, scoping)
    suporg.js           the supervisory-org model (tree, conflict detection)
    stacked.js          the deck model: slides → levels → orgs → slots,
                        status buckets, KPI maths, layout + pagination
    exports.js          PNG / vector PDF / 16:9 slide PDF / CSV
  components/
    Controls.js         filter, search, export menu, toggle
    Reparent.js         drag state machine + the result toast
    PersonCard.js       the Workday card + its two section layouts
    Slide.js            the deck primitives: slot, cluster, level band, slide
    FilterTree.js       the hierarchical tier filter
    StackedTree.js      the box-tree renderer: pan/zoom, connectors, histogram
  views/
    StackedDeck.js  Dashboard.js  PositionChart.js
    SupOrgChart.js  PeopleTree.js  DataTable.js
```
