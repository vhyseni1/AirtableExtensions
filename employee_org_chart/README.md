# Employee Org Chart (Airtable Interface Extension)

A copy of the `org_chart` extension, re-pointed at an **employee** table and
extended with image/PDF export.

## Data sources

All field-name dependencies live in one place — the `FIELDS` object at the top
of `frontend/index.js`. Edit these to match your table; nothing else hardcodes a
field name.

| Config key          | Purpose                                                        | Configured value           |
| ------------------- | ------------------------------------------------------------- | -------------------------- |
| `tableName`         | Table to read from (`null` = first table in base)             | `Employees & Positions`    |
| `primaryNameSource` | Card title. `'name'` = record's primary field, or a field name | `[E] First Name, Last Name` |
| `jobTitleField`     | Sub-text line 1 (set `null` to hide)                          | `REF Title [F]`            |
| `departmentField`   | Sub-text line 2 (set `null` to hide)                          | `[F] Supervisory Organization 🔗` |
| `statusField`       | Drives card **border** color + the dynamic legend (`null` = off) | `null`                 |
| `headcountField`    | Numeric field summed in the depth histogram (`null` = 1/node) | `null`                     |
| `parentLinkField`   | Linked-record "reports to" field (`null` = auto-detect first link field) | `Future Manager` |

The reporting hierarchy is read from `parentLinkField`. Set it to your exact
"Reports To" / manager field name if the table has more than one linked-record
field; otherwise the first linked-record field is used automatically.

### Border colors & legend

Border colors are assigned **dynamically**: each distinct value of `statusField`
gets a stable color from a built-in palette, and the legend builds itself from
the values actually present. No need to hardcode the possible status values.
Leave `statusField` as `null` to disable border coloring entirely (the legend
and its toggle hide automatically).

Card **fill** coloring (the old "Scoping" feature) has been removed — all cards
render on a white background.

## Features added vs. the original

- **Export ▸ PNG image** — full-resolution PNG of the whole chart.
- **Export ▸ PDF (single page)** — the chart scaled to fit one landscape A4 page.
- **Export ▸ PDF (multi-page)** — the chart rendered at full size and paginated
  top-to-bottom across multiple A4 pages so large charts stay legible.
- **Legend toggle** — a switch in the toolbar to show/hide the status legend.

Exports temporarily strip pan/zoom and capture the tree at its natural size, so
the result is always the complete chart regardless of the current view.

## Setup

```bash
npm install            # installs deps, incl. html2canvas + jspdf
```

This folder has **no** Airtable block remote configured (the copied bindings
were removed so it can't overwrite the original `org_chart` extension). Create a
new extension/block in your Airtable interface and wire up the remote before
running or releasing.
