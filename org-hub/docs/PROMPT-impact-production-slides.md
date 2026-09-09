# Prompt: Impact view, .pptx export and production log (standalone)

For a model with **no access to this repository**. Everything it needs is
inlined below. Copy from the horizontal rule to the end.

The output is a set of self-contained files that drop into an existing Airtable
Interface Extension. The contract is deliberately narrow — the generated code
imports only from npm packages and from files it creates itself, never from
code it cannot see.

---

# Task

Build three features for an **Airtable Interface Extension** (React, bundled by
Airtable's `block` CLI). You are writing new files that will be dropped into an
existing extension called `org-hub`. You cannot see that codebase, so:

**Import only from npm packages and from files you create.** Do not import from
any path you have not written. Define every helper you need — the ones you must
reproduce exactly are given verbatim below.

The three features are ports of a Google Apps Script app that this extension
replaces:

1. **Impact view** — a per-site workforce-transition table, one slide per unit
2. **Slide export** — render the slides to a downloadable `.pptx`
3. **Slides production log** — an Airtable-backed job table tracking exports

## Files to produce

```
frontend/config.impact.js        all table/field names + labels for these features
frontend/lib/impactModel.js      aggregation, region ordering, pagination, summary
frontend/lib/pptx.js             the .pptx generator
frontend/views/ImpactView.js     the slide renderer + toolbar
frontend/views/ProductionView.js the job table
frontend/style.impact.css        styles for the above
sample-data/impact-generate.py   deterministic CSV generator
sample-data/Impact Tables.csv    generated
sample-data/Impact Notes.csv     generated
sample-data/Slide Production.csv generated (empty but for headers + 2 examples)
scripts/check-impact.mjs         verification harness, runs without Airtable
README.impact.md                 what you built, how it's configured
```

Each view must default-export a React component taking explicit props (listed
per feature below) so the host shell can mount it without modification.

---

# Part 0 — The SDK you are targeting (read this first)

Airtable **Interface Extensions** are not the same API as Airtable Apps. Models
get this wrong constantly. The rules:

- The **only** two import paths are `@airtable/blocks/interface/ui` and
  `@airtable/blocks/interface/models`.
- Import `initializeBlock`, `useBase`, `useRecords`, `useSession`,
  `expandRecord`, `colorUtils` from `@airtable/blocks/interface/ui` — **not**
  from `@airtable/blocks/ui`.
- Import the `FieldType` enum from `@airtable/blocks/interface/models`. Never
  compare `field.type` against a string literal.
- There are **no Airtable UI components** here. No `Box`, `Text`, `Button`.
  Write plain JSX and CSS.
- `useRecords(tableOrNull)` accepts `null` and returns `null`. But hooks cannot
  be called conditionally, so when a table is optional, put its `useRecords` in
  a child component that only mounts when the table exists.
- Read cells with `record.getCellValueAsString(field)` or
  `record.getCellValue(field)`. Both **throw** if the field is missing or
  hidden — always go through the defensive helpers below.
- Select cell values are `{id, name, color}`. Render `.name`, never the object.
- `useRecords` results can change at any time (edits, permission changes).
  Derive with `useMemo`, never mutate.

Writes (needed only by Feature 3):

- `table.hasPermissionToCreateRecords()` and
  `table.hasPermissionToUpdateRecords()` — check **before** writing.
- `table.createRecordAsync(fields)` → `Promise<recordId>`;
  `table.updateRecordAsync(recordOrId, fields)` → `Promise<void>`.
- Max 50 records per call, 15 calls/second. Chunk and `await`.

## Helpers you must reproduce verbatim

These are load-bearing. Copy them into a file you create (e.g.
`frontend/lib/impactFields.js`) exactly as written — behaviour depends on the
details, including the empty `catch` blocks.

```js
// Read a field as text. Falls back to getCellValue for linked-record / lookup
// fields whose getCellValueAsString can come back empty in the interface SDK.
export function readText(record, field) {
    if (!field) return '';
    let s = '';
    try { s = record.getCellValueAsString(field); } catch { s = ''; }
    if (s && s.trim()) return s.trim();

    let v;
    try { v = record.getCellValue(field); } catch { return ''; }
    const parts = [];
    const visit = it => {
        if (it == null) return;
        if (typeof it === 'string') { if (it.trim()) parts.push(it.trim()); }
        else if (typeof it === 'number') parts.push(String(it));
        else if (typeof it === 'object') {
            if (typeof it.name === 'string' && it.name.trim()) parts.push(it.name.trim());
            else if (typeof it.value === 'string' && it.value.trim()) parts.push(it.value.trim());
            else if (typeof it.value === 'number') parts.push(String(it.value));
        }
    };
    if (Array.isArray(v)) v.forEach(visit);
    else visit(v);
    return parts.join(', ').trim();
}

export function readNumber(record, field) {
    if (!field) return 0;
    let v;
    try { v = record.getCellValue(field); } catch { return 0; }
    if (v == null) {
        const s = readText(record, field);
        const parsed = parseFloat(s);
        return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
        return v.reduce((sum, item) => {
            if (typeof item === 'number') return sum + item;
            if (item && typeof item.value === 'number') return sum + item.value;
            return sum;
        }, 0);
    }
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
}

export function normName(s) {
    return String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
}

// Resolve a configured field NAME to a field instance, tolerating whitespace
// and decorative symbols (e.g. a trailing "🔗" emoji). Null if not found.
export function findFieldByName(table, name) {
    if (!table || !name) return null;
    const exact = typeof table.getFieldByNameIfExists === 'function'
        ? table.getFieldByNameIfExists(name)
        : table.fields.find(f => f.name === name);
    if (exact) return exact;
    const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(name);
    if (!target) return null;
    return table.fields.find(f => norm(f.name) === target) || null;
}
```

And the status normaliser — **ported behaviour, reproduce exactly**. It is
lenient on purpose: source data contains free-typed values like
`Potentially at risk` and `To be posted`, and cleaning that data is not an
option.

```js
export function bucketForStatus(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const t = s.toLowerCase().replace(/[\s_]+/g, '').replace(/-+/g, '');

    if (t === 'mapped' || t === 'directlymapped' || t === 'directmapped') return 'mapped';
    if (['selection', 'inselectionprocess', 'inselection', 'forselection',
        'selectionprocess', 'selected', 'underselection'].includes(t)) return 'selection';
    if (['posted', 'tobeposted', 'topost', 'open', 'openposition',
        'tobefilled', 'vacant', 'newposition', 'new'].includes(t)) return 'posted';
    if (['risk', 'atrisk', 'potentiallyatrisk', 'potentially',
        'impacted', 'redundant', 'atriskemployee', 'atriskemployees'].includes(t)) return 'risk';

    if (t.includes('mapped')) return 'mapped';
    if (t.includes('selection') || t.includes('selected')) return 'selection';
    if (t.includes('posted') || t.includes('vacant') || t.includes('tobefilled')) return 'posted';
    if (t.includes('risk') || t.includes('impacted') || t.includes('redundan')) return 'risk';
    return null;
}
```

## The slide canvas contract

The host extension already renders decks. Match its conventions so your slides
sit alongside the existing ones and the shared export path works:

- A slide is a **fixed 1280×720 element with class `slide`**, inside a wrapper
  with class `slide-wrap`.
- The deck container sets a CSS custom property `--slide-zoom` (e.g. `0.65`);
  the slide applies `transform: scale(var(--slide-zoom))` with
  `transform-origin: top left`. The wrapper is sized to the *scaled* dimensions
  so the page doesn't reserve the full 1280×720 around a shrunken slide.
- A slide being captured gets the class `exporting`, whose rule is
  `transform: none; box-shadow: none; border-radius: 0;`.

Reproduce these rules in `style.impact.css` (harmless if the host also defines
them — they are identical), and prefix any new class names with `impact-` or
`prod-` so nothing collides.

---

# Part 1 — Impact view

One slide per organisational unit, showing for every site how its population
splits across four workforce-transition statuses. This is a **table**, not a
chart.

**Component:** `ImpactView({table, notesTable, onExport})` — `table` is the
Impact Tables table, `notesTable` may be `null`, `onExport` is an optional
callback invoked with `(deckElement, {name, source})`.

## Source table — `Impact Tables`

One row per position-ish record.

| Field | Required | Purpose |
| --- | --- | --- |
| `Slide No` | no | sort order only — **not** the grouping key |
| `Slide Title` | **yes** | groups rows into slides |
| `Subtitle` | no | slide subtitle |
| `Region` | **yes** | outer grouping, rendered as a row-spanning cell |
| `Site` | **yes** | one table row each |
| `Position Name` | no | not displayed; kept for traceability |
| `Status` | **yes** | run through `bucketForStatus` |
| `HC Count` | no | headcount for the row; **defaults to 1** when the field is absent |
| `FTE` | no | when present, enables the HC/FTE toggle |
| `Country` | no | ISO codes, collected per slide |

Optional `Impact Notes` table: `Slide` + `Note`. Its text becomes the slide
footnote, matched against **either** `Slide Title` or `Slide No`.

## Aggregation rules — follow exactly

- Group by **`Slide Title`**. `Slide No` sorts only; slides without one sort
  after those with one, alphabetically by title.
- Skip a row when `Slide Title` is blank.
- Skip a row only when **both** `Region` and `Site` are blank. When exactly one
  is blank, copy the other into it.
- A `Status` that buckets to `null` **skips the row** — but count those skips
  and the distinct unrecognised values, and expose them on the model as
  `diagnostics`. The view must surface them. Silently dropping rows is the
  failure mode that makes this view untrustworthy.
- Accumulate per `(slide, region, site)`: `mapped`, `selection`, `posted`,
  `risk`, each in both HC and FTE.

Two derived numbers per site row:

```
scope    = mapped + selection + risk       // employees in scope today
toStruct = mapped + selection + posted     // the to-be structure
```

Note that `posted` is excluded from `scope` and `risk` from `toStruct` — that
asymmetry is the point of the table, not an error.

## Region ordering

Regions are **not** sorted alphabetically. Emit in this order:

1. European regions, alphabetical
2. a synthetic **`Europe Total`** row aggregating them — only when at least one
   European region exists
3. `Flexible locations` (also matches the singular), alphabetical
4. `US` / `USA` / `United States` / `United States of America`
5. `UK` / `United Kingdom` / `Great Britain`
6. everything else, alphabetical
7. `ROW`, always last

Matching is case- and whitespace-insensitive. `Flexible locations` is checked
**before** the Europe test, so a flexible-location row never lands in Europe.

You need a `classifyRegion(name)` helper returning `'Europe'` or something
else. Put the European country/region list in `config.impact.js` as data, so it
can be edited without touching logic.

## Slide layout

A 1280×720 canvas containing a title block, one table, and a footnote.

| Region | Site | Employees in scope (HC) | To be structure | Mapped | In selection process | To be posted | Employees potentially at risk (HC) |

- The **Region** cell spans its site rows (`rowSpan`).
- The `Europe Total` row is visually distinct (heavier weight / tinted).
- A **Total** row appears **only on the last page** of a slide.
- All eight column headers are configurable strings in `config.impact.js`.
  The literal `(HC)` inside a header swaps to `(FTE)` when the count toggle is
  on FTE — do this by string replacement on the configured label, so a
  relabelled header keeps working.
- The footnote renders **only on the last page**.
- Page label reads `(1/3)` after the title when a slide spans pages.

## Pagination

Roughly **17 data rows per page**. Keep a region group intact where it fits:
start a new page rather than splitting a region across the boundary. A region
larger than one page is chunked, and each chunk **restates the region cell**
with a corrected `rowSpan`. Emit the Total row and footnote only on the final
page of each slide.

17 is ported behaviour, not a computed value. Say so in a comment.

## Summary slide

Prepend one synthetic slide aggregating **every** slide's region/site figures.
**Exclude the per-slide `Europe Total` rows from that aggregation** — they are
already sums and would double-count. The summary uses the identical layout,
gets index 0, and has its own footnote key.

## Toolbar

- **Headcount / FTE** segmented toggle, shown only when the FTE field resolves.
- A zoom cycle button stepping `50% → 65% → 80% → 100%`, writing `--slide-zoom`
  on the deck container.
- An export menu with **PowerPoint (.pptx)** and **PNG**.
- A count of rendered slides.
- If `diagnostics.unbucketedRows > 0`, a dismissible warning naming the
  unrecognised status values and how many rows each cost.

---

# Part 2 — `.pptx` export

The original called `SlidesApp.create()` server-side in Apps Script. **Do not
port that.** An Interface Extension is sandboxed browser JavaScript: no server,
no Google OAuth. Build the deck client-side.

**Module:** `frontend/lib/pptx.js`, exporting
`exportPptx(deckEl, {name, source, onProgress})`.

- Use **PptxGenJS** and **html2canvas** (add both to `package.json`).
- Layout 16:9 — define a custom layout `10 × 5.625 in` and use it.
- Capture each `.slide` descendant of `deckEl` with html2canvas:
  `scale: Math.max(2, window.devicePixelRatio || 1)`, `backgroundColor:
  '#ffffff'`, `useCORS: true`, and explicit `width`/`height` from the element.
- `canvas.toDataURL('image/jpeg', 0.95)` — JPEG, not PNG. A 22-slide PNG deck
  is ~40 MB and will hang the tab.
- One image per slide, full-bleed at `x:0, y:0, w:10, h:5.625`.
- Save as `<source>-<YYYY-MM-DD-HH-MM-SS>.pptx` via `writeFile`.

Two mechanics that are not optional:

1. **Neutralise the zoom.** Set `--slide-zoom` to `1` on `deckEl` for the
   duration of the capture and restore the previous value in a `finally` —
   otherwise html2canvas captures the shrunken slide and the deck is a blurry
   65% of its resolution.
2. **Add and remove the `exporting` class** on each slide around its capture,
   in a `try/finally`, so interactive affordances are hidden.

Call `onProgress({done, total, phase})` per slide so the UI can show
"Capturing slide 7 of 22…". Capture in **batches of 20**, and `await` a
`requestAnimationFrame` (or `setTimeout 0`) between batches — a 60-slide deck
otherwise locks the tab for the whole capture with no repaint.

Throw on failure with a message worth showing to a user; the caller logs it.

---

# Part 3 — Slides production log

A table of every export, so someone who kicks off a long capture can navigate
away and come back to it.

**Component:** `ProductionView({table})`.

## This is the only part that writes

Assume the rest of the extension is strictly read-only. Therefore:

- Check `hasPermissionToCreateRecords()` / `hasPermissionToUpdateRecords()`
  **before** attempting a write.
- When permission is missing the export must **still work** — it just isn't
  logged. Surface that once, in the view; never fail the export because logging
  failed. Wrap every write in try/catch to the same end.
- When the table is absent, hide the view and skip logging entirely. **Do not
  attempt to create the table** — extensions cannot, and trying is a confusing
  failure.

## Table — `Slide Production`

| Field | Type | Notes |
| --- | --- | --- |
| `Job ID` | single line text (primary) | `job_` + `crypto.randomUUID()` |
| `Name` | single line text | e.g. `Impact Tables - 2026-09-09` |
| `Source` | single select | `Impact Tables`, `Stacked Org`, `Current vs Future` |
| `Status` | single select | `Processing`, `Capturing`, `Building`, `Complete`, `Failed` |
| `Total Slides` | number | |
| `Slides Done` | number | |
| `File Name` | single line text | the saved `.pptx` name |
| `Created` | date-time | ISO string |
| `Updated` | date-time | ISO string |
| `User Email` | email | from `useSession().currentUser.email` |
| `Notes` | long text | error message on failure |

Export a small job API from a file you create, e.g.
`frontend/lib/productionLog.js`:

```
createJob(table, {name, source, totalSlides, userEmail}) -> recordId | null
updateJob(table, recordId, {status, slidesDone, fileName, notes})
```

Both no-op and return `null` when the table or the permission is missing.

Status flow: `Processing` → `Capturing` (while html2canvas runs) → `Building`
(while PptxGenJS assembles) → `Complete`, or `Failed` with `Notes` set.

**Update `Slides Done` at most every 5 slides**, not every slide. One write per
frame will hit the rate limit and slow the capture more than it informs anyone.

## The view

A table: Name · Source · Progress · Status · File · Generated by · Date.

- **Progress** is a bar plus `7/22`; a completed job shows `22 slides` instead.
- **Status** is a coloured badge, with a spinner while in flight.
- Newest first, by `Created` descending.
- No polling timer. `useRecords` already re-renders when the table changes —
  rely on that.
- Empty state: "No slide exports yet — use Export ▸ PowerPoint to create one."

---

# Configuration

`frontend/config.impact.js` holds **every** table name, field name and label
used by these features, with a comment block explaining what each one drives.
Nothing else in your code may hardcode a table or field name. Both tables are
**optional** — the code must behave correctly in a base that has neither.

Include: the three table names, every field name above, the eight column header
labels, the European region list, and the status→colour map
(`mapped` grey `#eeeeee`, `selection` light blue `#cfeaff`, `posted` navy
`#0b2a63`, `risk` purple `#b14cff`).

---

# Sample data

`sample-data/impact-generate.py` — deterministic (seed it), no third-party
imports, standard library only. Writes:

- `Impact Tables.csv` — ~180 rows
- `Impact Notes.csv` — one row per slide
- `Slide Production.csv` — headers plus two example rows (one `Complete`, one
  `Failed`), so the view can be seen populated before any export runs

Invent a fictional company; use an `.example` email domain. The data must
exercise:

- **all four status buckets**, plus at least two free-typed variants
  (`Potentially at risk`, `To be posted`) that only the lenient bucketing
  catches;
- at least one European region **and** `US`, `UK`, `Flexible locations` and
  `ROW`, so the whole ordering rule is visible;
- **a slide with more than 17 data rows**, so pagination and the `(1/2)` label
  actually run;
- a slide whose region alone exceeds 17 rows, so the region-chunking path runs;
- at least one slide with a footnote, and one without;
- non-integer FTE values that differ from headcount.

Use `zlib.crc32` rather than `hash()` for any derived id — Python randomises
string hashing per process, which would make the file non-deterministic.

Write `README.impact.md` documenting the CSVs and the Airtable field types to
set after import (which columns become single selects, numbers, date-times).

---

# Verification — required, not optional

## 1. `scripts/check-impact.mjs`

A Node script that runs your model against the CSVs **without Airtable**. Fake
the SDK surface — you need only `table.fields`, `table.records`,
`table.getFieldByNameIfExists(name)`, and per record
`getCellValueAsString(field)` / `getCellValue(field)`. Roughly 60 lines.

Assert:

- every configured Impact field resolves against the CSV headers;
- `scope` and `toStruct` equal their component sums on every row;
- the `Europe Total` row equals the sum of the European region rows;
- the summary slide's totals equal the sum of the per-slide totals — this is
  the assertion that catches double-counting `Europe Total`;
- region ordering matches the rule, on a slide containing all seven categories;
- pagination emits every data row exactly once across pages;
- only the last page of each slide carries a Total row and a footnote;
- rows are dropped **only** for a blank title or a blank region-and-site — no
  row is lost to an unrecognised status;
- `diagnostics.unbucketedRows` is 0 for this data.

Print one line per assertion and exit non-zero on any failure.

Note: Node's ESM loader will not resolve extensionless relative imports the way
the bundler does. Either use explicit `.js` extensions in your imports, or ship
a small `--import` resolve hook alongside the script.

## 2. Render check

Render the Impact view in headless Chromium (Playwright) against the sample
data and assert **no slide's content overflows its canvas** — for every
`.slide`, compare the table container's `scrollHeight` to its `clientHeight`.
Also assert zero console errors and zero page errors.

This is not optional and not a formality. The 17-rows-per-page figure is an
estimate carried over from a different rendering engine; it is exactly the kind
of number that looks right and silently clips the last row. Measure it.

If Chromium is unavailable in your environment, say so plainly rather than
claiming the check passed.

## 3. Lint

Code must pass ESLint with `eslint-plugin-react` and
`eslint-plugin-react-hooks` at recommended settings — in particular no
conditional hooks and complete dependency arrays (an intentional omission needs
an inline `eslint-disable-next-line` with a one-line reason).

**Report what you actually ran and what it returned.** If something fails, say
so with the output rather than describing the code as done.

---

# Non-goals — do not do these

- Do not add Google OAuth, the Google Slides API, or any server component.
- Do not port auth, licence expiry, brute-force protection or Drive-folder
  logic from the source app. None of it applies.
- Do not bake a client logo into the slide.
- Do not fetch flag or logo images from a CDN — an extension iframe cannot rely
  on external images. Country codes render as text chips.
- Do not make any view other than the production log write to Airtable.
- Do not import from files you were not given and did not create.
- Do not open a pull request.

# Style

Four-space indent, named exports, `useMemo` over recomputation. Comments should
explain **why**, not restate the line. Where a rule looks arbitrary — the
17-row page, the region ordering, dropping unbucketed statuses, `posted` being
outside `scope` — state in a comment that it is ported behaviour, so the next
reader does not "fix" it.
