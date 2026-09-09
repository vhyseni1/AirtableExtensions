# Prompt: add the Impact view, slide export and production log to Org Hub

Copy everything below the line into the model. It is self-contained — it
restates the source behaviour rather than assuming the reader has the Apps
Script open.

---

You are extending an existing Airtable Interface Extension, `org-hub`, in the
repository `vhyseni1/AirtableExtensions`. Read `org-hub/README.md` and
`org-hub/frontend/config.js` before writing any code, and follow the
conventions already in that codebase rather than inventing new ones.

Your task is to port three things from a Google Apps Script app
(`vhyseni1/orgdesiger`) that this extension is replacing:

1. **Impact view** — a per-site impact table, one slide per organisational unit
2. **Slide export** — turn the rendered slides into a downloadable `.pptx`
3. **Slides production log** — a job table tracking every export

## What already exists (do not rebuild it)

`org-hub` is a read-only extension with a tabbed shell (`frontend/index.js`),
five chart views, a dashboard and a data grid. Reuse these:

| Module | What to reuse |
| --- | --- |
| `frontend/config.js` | every table/field name lives here; add yours to it and hardcode nothing elsewhere |
| `frontend/lib/fields.js` | `readText`, `readNumber`, `findFieldByName`, `findTable`, `normName` — defensive cell reading that never throws on a missing field |
| `frontend/lib/stacked.js` | `bucketForStatus` — the status normaliser you must reuse verbatim |
| `frontend/lib/exports.js` | `exportPNG`, `exportSlidesPDF`, `toCSV`, `downloadText`, `timestamp` |
| `frontend/components/Controls.js` | `CheckboxFilter`, `SearchBox`, `ExportMenu`, `ToggleSwitch` |
| `frontend/components/Slide.js` | the `.slide` chrome and the 1280×720 canvas conventions |
| `frontend/views/DataTable.js` | the grid + Fields diagnostics panel |
| `frontend/style.css` | slide, toolbar, panel and grid styles — extend, don't duplicate |

The shell's navigation is a data structure (`NAV` in `frontend/index.js`).
Adding a view is a one-entry change there plus a branch in the router. Views
that depend on an optional table must hide themselves and fall back to a
sibling when that table is absent — copy the existing `requires` / `fallback`
pattern.

---

## Feature 1 — Impact view

A slide per organisational unit showing, for every site, how its population
splits across the four workforce-transition statuses. Unlike the stacked deck
this is a **table**, not a chart.

### Source table (`Impact Tables`)

One row per position-ish record. Configure the field names in `config.js` under
a new `IMPACT` export.

| Field | Required | Purpose |
| --- | --- | --- |
| `Slide No` | no | sort order only — **not** the grouping key |
| `Slide Title` | **yes** | groups rows into slides |
| `Subtitle` | no | slide subtitle |
| `Region` | **yes** | outer grouping, rendered as a row-spanning cell |
| `Site` | **yes** | one table row each |
| `Position Name` | no | not displayed; kept for traceability |
| `Status` | **yes** | bucketed into mapped / selection / posted / risk |
| `HC Count` | no | headcount for the row; **defaults to 1** when absent |
| `FTE` | no | FTE for the row; enables the HC/FTE toggle when present |
| `Country` | no | ISO codes, collected per slide |

Also support an optional `Impact Notes` table (`Slide` + `Note`) whose text
becomes the slide footnote, matched against **either** `Slide Title` or
`Slide No`.

### Aggregation rules — follow these exactly

- Group by **`Slide Title`**. `Slide No` is used only for sorting; slides
  without one sort alphabetically after those with one.
- Skip a row when `Slide Title` is blank.
- Skip a row only when **both** `Region` and `Site` are blank. When exactly one
  is blank, copy the other into it.
- Run `Status` through `bucketForStatus` (already in `lib/stacked.js`). A value
  that buckets to `null` **skips the row** — but count those skips and the
  distinct unrecognised values, and surface them in the Fields panel. Silently
  dropping rows is the failure mode that makes this view untrustworthy.
- Accumulate per `(slide, region, site)`: `mapped`, `selection`, `posted`,
  `risk`, each in both HC and FTE.

Two derived numbers per site row:

```
scope    = mapped + selection + risk          // employees in scope today
toStruct = mapped + selection + posted        // the to-be structure
```

### Region ordering

Regions are not sorted alphabetically. Emit them in this order:

1. European regions, alphabetical
2. a synthetic **`Europe Total`** row aggregating all of them (only when there
   is at least one European region)
3. `Flexible locations`, alphabetical
4. `US` / `USA` / `United States`
5. `UK` / `United Kingdom` / `Great Britain`
6. everything else, alphabetical
7. `ROW`, always last

Region matching is case- and whitespace-insensitive. You will need a small
`classifyRegion` helper for step 1; a lookup of European country and region
names is fine — keep it in `config.js` so it can be edited without touching
logic.

### Slide layout

A 1280×720 canvas matching the existing `.slide`, containing one table:

| Region | Site | Employees in scope (HC) | To be structure | Mapped | In selection process | To be posted | Employees potentially at risk (HC) |

- The **Region** cell spans its site rows (`rowSpan`).
- The `Europe Total` row is visually distinct.
- A **Total** row appears **only on the last page** of a slide.
- Column headers are configurable strings in `config.js` (the source lets a
  client relabel them). `(HC)` in a header swaps to `(FTE)` when the count
  toggle is on FTE.
- The footnote renders **only on the last page**.

### Pagination

Roughly **17 data rows per page**. Keep a region group intact where it fits:
start a new page rather than splitting a region across the boundary. A region
larger than a page is chunked, and each chunk **restates the region cell** with
a corrected `rowSpan`. Page labels read `(1/3)` in the title, as the other
views do.

### Summary slide

Prepend one synthetic slide aggregating **every** slide's region/site figures.
Exclude the per-slide `Europe Total` rows from that aggregation — they are
already sums and would double-count. The summary uses the identical layout and
its own footnote key.

### Toolbar

Reuse the deck toolbar: a **Headcount / FTE** segmented toggle (FTE only when
the FTE field resolves), a slide-zoom cycle, and an export menu offering the
existing PDF/PNG plus the new `.pptx`.

---

## Feature 2 — Slide export to `.pptx`

The Apps Script called `SlidesApp.create()` server-side. **Do not port that.**
An Interface Extension is sandboxed browser JavaScript: no server, no Google
OAuth. Build the deck client-side instead.

- Use **PptxGenJS** (add to `package.json`), 16:9 layout — `10 × 5.625 in`.
- Capture each `.slide` element with `html2canvas`, `scale` ≥ 2,
  `toDataURL('image/jpeg', 0.95)`.
- One captured image per slide, placed full-bleed at `x:0, y:0, w:10, h:5.625`.
- Save as `<source>-<timestamp>.pptx` via PptxGenJS's `writeFile`.

Two mechanics you must copy from `exportSlidesPDF` in `lib/exports.js`:

- The deck renders scaled by a `--slide-zoom` CSS variable. **Force it to `1`
  for the duration of the capture and restore it after**, or html2canvas
  captures the shrunken slide.
- Add the `exporting` class to each slide while capturing so interactive
  affordances are hidden, and remove it in a `finally`.

Report progress per slide through a callback so the UI can show
"Capturing slide 7 of 22…". Capture in **batches of 20** and yield to the event
loop between batches — a 60-slide deck otherwise locks the tab.

Put the generator in `frontend/lib/pptx.js` and export a single
`exportPptx(deckEl, {name, source, onProgress})`.

---

## Feature 3 — Slides production log

A table of every export, so a user who kicks off a long capture can navigate
away and come back to it.

### This is the one part of the extension that WRITES

Everything else in `org-hub` is read-only. Therefore:

- Check `table.hasPermissionToCreateRecords()` / `hasPermissionToUpdateRecords()`
  **before** attempting a write.
- When permission is missing, the export must still work — it just doesn't get
  logged. Say so in the UI once; don't fail the export.
- When the `Slide Production` table is absent, hide the view and skip logging
  entirely. Do not try to create the table.

### Table (`Slide Production`)

| Field | Type | Notes |
| --- | --- | --- |
| `Job ID` | text (primary) | `job_` + a UUID |
| `Name` | text | e.g. `Impact Tables - 2026-09-09` |
| `Source` | single select | which view produced it: `Impact Tables`, `Stacked Org`, `Current vs Future` |
| `Status` | single select | `Processing` → `Capturing` → `Building` → `Complete`, or `Failed` |
| `Total Slides` | number | |
| `Slides Done` | number | updated as capture progresses |
| `File Name` | text | the saved `.pptx` name |
| `Created` / `Updated` | date-time (ISO) | |
| `User Email` | email | from `useSession().currentUser.email` |
| `Notes` | long text | error message on failure |

Write the job row when the export starts, update `Slides Done` every few slides
(not every slide — that's a write per frame), and set the terminal status when
it finishes or throws.

### The view

A table: Name · Source · Progress · Status · File · Generated by · Date.

- **Progress** is a bar plus `7/22`; a completed job shows `22 slides` instead.
- **Status** is a coloured badge, with a spinner while in flight.
- Newest first.
- Refresh automatically while any job is not terminal; stop polling when all
  are `Complete` or `Failed`. `useRecords` already re-renders on change, so
  prefer that over a timer.
- Empty state: "No slide exports yet — use Export ▸ PowerPoint to create one."

---

## Configuration

Add `IMPACT` and `PRODUCTION` exports to `frontend/config.js`, in the style of
the existing `PEOPLE` / `SUP_ORG` / `ORG_DESIGN` blocks: every table and field
name, with a comment block explaining what each one drives. Both tables are
**optional** — the extension must work unchanged in a base that has neither.

## Sample data

Extend `sample-data/generate.py`, which already builds one consistent fictional
company (Aurora Health Group, 150 positions, 24 supervisory orgs) plus a
restructuring scenario. Derive the Impact rows from **that same scenario** so
the numbers reconcile with the existing files rather than being a separate
invention. Emit `Impact Tables.csv` and `Impact Notes.csv`, and document them
in `sample-data/IMPORT.md` with the field types to set after import.

The data must exercise: all four status buckets; at least one European region
plus `US`, `UK`, `Flexible locations` and `ROW` so the whole ordering is
visible; a slide with more than 17 rows so pagination and the `(1/2)` label
run; and a slide with a footnote.

Keep the generator deterministic — it is seeded, and `zlib.crc32` is used
instead of `hash()` because Python randomises string hashing per process.

## Verification — required, not optional

1. `npm run lint` clean.
2. Extend `scripts/check-sample-data.mjs`, which runs the models against the
   CSVs outside Airtable using a faked SDK. Add assertions that:
   - every configured Impact field resolves;
   - `scope` and `toStruct` equal their component sums on every row;
   - the `Europe Total` row equals the sum of the European regions;
   - the summary slide's totals equal the sum of the per-slide totals;
   - region ordering matches the rule above;
   - pagination emits every data row exactly once, and only the last page
     carries a Total;
   - no source row is dropped for an unrecognised status.
3. Render the Impact view in Chromium (Playwright is available;
   `executablePath: '/opt/pw-browsers/chromium'`) against the sample data and
   assert **no slide's content overflows its canvas** — compare `scrollHeight`
   to `clientHeight` on the table container for every `.slide`. This is how the
   deck's pagination bug was caught; do the same here rather than trusting the
   row estimate.

Report what you actually ran and what it returned. If something fails, say so
with the output rather than describing the code as done.

## Non-goals — do not do these

- Do not add Google OAuth, the Google Slides API, or any server component.
- Do not port the Apps Script's auth, expiry, brute-force, licensing or
  Drive-folder logic. None of it applies here.
- Do not bake a client logo into the slide. The stacked deck deliberately has
  none; match that.
- Do not fetch flag images from a CDN. Country codes render as text chips —
  an extension iframe cannot rely on external images.
- Do not make any existing view writable.
- Do not create a pull request unless asked.

## Style

Match the surrounding code: 4-space indent, named exports, `useMemo` over
recomputation, comments that explain **why** a rule exists rather than
restating the line. Where a rule looks arbitrary — the 17-row page, the region
ordering, skipping unbucketed statuses — say in a comment that it is ported
behaviour, so the next reader doesn't "fix" it.
