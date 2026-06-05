# Posorgchart (Airtable Interface Extension)

A **Workday-style** org chart explorer for the **Employees & Positions** table.
Instead of one large expandable tree, it shows a single person in focus with
their direct reports, and you drill up/down through the organization. Deploys to
Airtable block `blkaireIrJ5AuwUof`.

## How it works

- **Focus + direct reports** — the focused person sits at the top; their direct
  reports appear as a grid of cards below.
- **Drill down** — click any report card to make that person the new focus.
- **Drill up** — use the breadcrumb (the management chain) or the **↑ manager**
  button to climb back up.
- **Search** — jump straight to anyone by name, title, or department.
- **Avatars & stats** — each card shows initials, name, title, department, and
  "N direct · M total" team size.
- **Open ↗** — opens the underlying Airtable record.
- **Export** — PNG, single-page PDF, or multi-page PDF of the current board.
- **Fields** — a diagnostics panel showing how each configured field resolved
  against the live table, plus every real field name/type (handy when a field
  name doesn't match, e.g. an emoji).

## Data sources

All field-name dependencies live in the `FIELDS` object at the top of
`frontend/index.js`. Nothing else hardcodes a field name.

| Config key          | Purpose                                                         | Configured value           |
| ------------------- | -------------------------------------------------------------- | -------------------------- |
| `tableName`         | Table to read from (`null` = first table in base)              | `Employees & Positions`    |
| `primaryNameSource` | Card title. `'name'` = record's primary field, or a field name | `[E] First Name, Last Name` |
| `jobTitleField`     | Job title on the card (`null` to hide)                         | `REF Title [F]`            |
| `departmentField`   | Department / org on the card (`null` to hide)                  | `[F] Supervisory Organization 🔗` |
| `statusField`       | Optional colored accent + legend (`null` = off)               | `null`                     |
| `parentLinkField`   | Field pointing to a person's manager                          | `Future Manager`           |

**Manager field** may be either a linked-record field or a **lookup**. The chart
matches each person's manager by linked-record id *or* by the looked-up manager
name, so both work. When `null`, the first linked-record field is auto-detected.

**Field resolution** tolerates whitespace and decorative symbols (e.g. the "🔗"
link emoji), so a field whose name ends in an emoji still resolves. If something
isn't showing, open **Fields** to see exactly what resolved.

## Setup & deploy

```powershell
npm install            # installs deps, incl. html2canvas + jspdf
block run              # live preview
block release          # publishes to blkaireIrJ5AuwUof
```
