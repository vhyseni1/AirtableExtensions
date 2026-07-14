# Importing the sample data into Airtable

Five CSVs in this folder match the extension's field contract (`frontend/constants.js`)
**verbatim**. They're **synthetic** demo data, sized to make all three views light up:
6 features across 2 initiatives, 14 stages, 16 attributes, 10 handshakes — with deliberate
blocked / awaiting-review / ready-to-push cases.

Regenerate or expand anytime: `python3 generate.py`.

## Import order (so links resolve to existing rows)
1. **Teams.csv** 2. **Stages.csv** 3. **Entities.csv** 4. **Initiatives.csv** 5. **Features.csv** 6. **Attributes.csv** 7. **Handshakes.csv**

In Airtable: **Add a table → Import data → CSV file**. The **first column becomes the primary
field** (already ordered correctly: Team Name / Stage Name / Feature Name / Attribute ID /
Handshake ID).

## After import — set field types
CSV import makes every column text. Convert these (Airtable auto-creates single-select options
from the values, and matches link columns on the **target table's primary field**, so the exact
strings here resolve cleanly):

| Table | Field → type |
|---|---|
| **Teams** | `Users` → Multiple collaborators *(optional; see note)*. |
| **Stages** | `Order` → Number. `Responsible Team`, `Approver Team` → Link to **Teams**. |
| **Initiatives** | `Entity` → Link to **Entities**. `Status` → Single select. |
| **Features** | `Initiative` → Link to **Initiatives**. `Status`, `Priority` → Single select. `Owning Team` → Link to **Teams**. `Target Go-Live Date` → Date. |
| **Attributes** | `Sourcing Type`, `Status`, `Approval Status`, `Environment` → Single select. `Is Reference Data`, `Requires Gateway Derivation`, `Acceptance Met?` → **Checkbox**. `Current Stage` → Link to **Stages**. `Assigned Team`, `Approver Team` → Link to **Teams**. `Assignee` → Collaborator *(or leave text)*. `Due Date`/`Started`/`Completed` → Date. `Cycle Number` → Number. **`Acceptance Criteria` → keep Long text** (it holds JSON). **`Addressed By`, `Forks Into` → Link to _this same_ Attributes table** (self-link, allow linking to multiple; matches on `Attribute ID`). |
| **Handshakes** | `Attribute` → Link to **Attributes**. `Stage` → Link to **Stages**. `From Team`, `To Team` → Link to **Teams**. `Action` → Single select. `Timestamp` → Date. `Cycle Number` → Number. `Feature` → text or Link to **Features**. |

### Notes / gotchas
- **Checkboxes**: boolean columns are exported as `checked` / empty. When you convert a text
  column to Checkbox, non-empty cells become ticked — so this round-trips correctly. (Getting
  `Is Reference Data` / `Requires Gateway Derivation` right matters — they drive the stage path.)
- **Collaborators** (`Users`, `Assignee`): Airtable maps collaborators by **email of real base
  members**, which demo names won't match. Easiest for a demo: leave `Assignee` as **text**
  (the dashboards read it fine) and only convert `Users` to collaborators if you want the team
  roster chips populated.
- **`Acceptance Criteria`** stays Long text — it's a JSON array string the extension parses; the
  raw cell looks like a blob in the grid, so don't surface that column on stage.
- The extension shows a **setup banner** naming any table/field whose name doesn't match — if
  something's off after import, it'll tell you exactly what to rename.

## What the data demonstrates
- **Roadmap**: two initiatives; *Loans Disbursement* near-delivered, *Repurchase Agreements* just
  starting; per-feature maturity bars + go-live dates.
- **KPIs**: ~3 awaiting review, ~2 blocked, ~3 ready to push.
- **By team**: e.g. **Data & AI Modelling Crew** shows its in-flight attributes by stage.
- **Workflow**: pending approvals (CD-02, IRS-01, FX-01) appear in *Incoming* for their approver
  team; *IRS-02* and *REPO-01* sit in *Ready to push*; blockers surface their reasons. Promote /
  Accept then advance stages and post to the Handshakes feed.
