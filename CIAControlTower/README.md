# ELEVATE-CIA Intelligence Dashboard

A custom Airtable extension that turns the `Impacts` table into a **change intelligence platform** — a Bloomberg-terminal-style instrument for surfacing where organizational change is failing, where the heat is, and what to escalate next.

The dashboard is organized as a four-zone narrative answering the four executive questions in order:

1. **Where is the heat?** (Zone 1 headline + Zone 2 matrix + Panel A)
2. **What's breaking?** (Panel B — gaps without owners or budget)
3. **Who's under pressure?** (Panel C — burnout signals by persona)
4. **Where is alignment failing?** (Panel D — friction between named parties)

Every visual on the dashboard is clickable. Three clicks max from headline insight to row edit.

---

## Install

```bash
npm install
npx block run     # local dev against the configured base
npx block release # ship to the base
```

> The extension uses the Airtable Blocks SDK (`@airtable/blocks`, `interface-alpha`). The CLI handles bundling. After `npm install`, pair the block with your base via `npx block init` (this writes `.airtableblocksrc.json` and `.block/remote.json`).

### Scripts

- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint over `frontend/src/**/*`

---

## Required Airtable schema

Single source table named **`Impacts`** with these fields, names exact:

| Field | Type | Allowed values |
|---|---|---|
| `Row_ID` | Number | auto |
| `Validation_Status` | Single select | `Pending`, `Reviewed`, `Discarded` |
| `Source_Run` | Single line text | batch tag, e.g. `Steerco_2026-04-22` |
| `Category` | Single select | `Process & Workflow`, `Technology & Integration`, `Data Ownership & Integrity`, `Analytics & Measurements`, `Role & Responsibility`, `Skill & Capability`, `Mindset & Cultural Sentiment`, `Engagement & Communication` |
| `Impact_Lens` | Single select | `Global`, `MWM`, `Affiliate` |
| `Affiliate_Country` | Single select | `DE`, `UK`, `FR`, `ES`, `IT`, `CA`, `BR`, `Other` |
| `Persona` | Single select | `PJP`, `HCD`, `HSP`, `GSCL`, `CSR`, `Admin` |
| `Component` | Single line text | canonical, e.g. `Vault 3.0`, `PowerBI Dashboard` |
| `Description` | Long text | format `AS-IS: ... --> TO-BE: ...` |
| `Severity` | Single select | `High`, `Medium`, `Low` |
| `Tags` | Multi-select | `Heatmap`, `Pressure`, `Gap`, `Friction` |
| `Confidence` | Single select | `High`, `Medium`, `Low` |
| `Source_Quote` | Long text | verbatim from transcript |
| `Source_Doc` | Single line text | filename + speaker reference |
| `Action_Required` | Long text | recommended mitigation |
| `Responsible` | Single select | `ECL Workstream`, `ELEVATE Program`, `Beyond ELEVATE` |
| `Action_Owner` | Single line text | free-form name |
| `Timeline` | Single line text | free-form |
| `Dependencies` | Long text | free-form |
| `Notes` | Long text | free-form |
| `Reviewer_Notes` | Long text | manual reviewer notes |

If any of these fields are missing the extension renders a schema-mismatch error listing the gaps. Field names are matched exactly; do not rename.

---

## What you'll see

### Masthead
Editorial title, eyebrow, and two actions: `Narrative ▶` (auto-cycle 5-beat walkthrough) and `Export PDF` (browser print → Save as PDF, A3 landscape).

### Zone 1 — Headline bar (sticky)
Six insight tiles. Each shows a large serif number, a micro-eyebrow, and a delta indicator vs the previous `Source_Run`:

- TOTAL IMPACTS · HIGH SEVERITY · GAPS OPEN · PRESSURE FLAGS · FRICTION POINTS · AVG CONFIDENCE
- Click any tile → right-side `DrillSheet` opens with the filtered rows. Click any row → `expandRecord()` opens the editable Airtable record. Three clicks total.

### Filter bar
Run selector (defaults to most recent run), Lens segmented control, Severity segmented control, Persona chips, Tag chips, freshness indicator (extracted date from `Source_Run`), and Reset.

### Zone 2 — Heat map
Component × Persona matrix. Cell shading ∝ count, color ∝ average severity. Click a cell → drill sheet. Below the matrix, a horizontal stacked bar per Lens (Global / MWM / Affiliate · DE / UK / FR …) segmented by Category pillar.

### Zone 3 — Diagnostic panels (2×2)
- **Panel A — Where the heat is:** top 5 components, bars banded by severity.
- **Panel B — What's breaking:** rows tagged `Gap`, sorted Severity → Confidence, as record cards.
- **Panel C — Who's under pressure:** thermometer bars per persona; pulses when avg severity is high.
- **Panel D — Where alignment fails:** friction points rendered as `Party A ⟑ Party B` with the disagreement summarized; party names are heuristically extracted from `Source_Quote`.

### Zone 4 — Source trace
For the most-recently selected row (or the top high-severity row by default):
- **Pull quote** in serif italic with `Source_Doc` attribution
- **Severity / Confidence / Tag** badges
- **AS-IS → TO-BE → Action required** rendered as a vertical flow
- **Open record →** button as a one-click escape hatch

---

## Interaction model — three-click rule

| Click 1 | Click 2 | Click 3 |
|---|---|---|
| Insight tile (Zone 1) | Row in DrillSheet | Open record (`expandRecord`) |
| Heat map cell (Zone 2) | Row in DrillSheet | Open record |
| Diagnostic panel item (Zone 3) | (already at row level) | Open record (2-click path) |

`Esc` closes the DrillSheet. Filters apply globally to all four zones simultaneously and persist for the session.

---

## 10x features

- **Narrative mode** — 5-beat auto-cycle with one-sentence callouts ("12 high-severity impacts. 4 gaps unowned. PJPs are anxious. Vault 3.0 is the heat center."). Use `←` / `→` to step manually, `Esc` to exit.
- **Compare runs** — when ≥2 `Source_Run` values exist, every headline tile shows the delta vs the prior run, color-coded green/red against the metric's intent.
- **Export PDF** — `window.print()` plus a print stylesheet (A3 landscape, no animations, white backgrounds).
- **Freshness indicator** — last-run identifier in the filter bar; if the run name contains a `YYYY-MM-DD`, it is surfaced as the date.
- **Editorial empty states** — every zero-result panel returns a one-line statement, never "No data found."

---

## Architecture

```
frontend/src/
  index.tsx
  ambient.d.ts                     // local Blocks SDK type shim (dev-only)
  components/
    Dashboard.tsx                  // top-level orchestrator (filter + drill + selection state)
    HeadlineBar.tsx                // Zone 1
    FilterBar.tsx                  // run / lens / severity / persona / tag controls
    HeatMap.tsx                    // Zone 2 matrix + lens stack
    DiagnosticGrid.tsx             // Zone 3 wrapper
    panels/
      WhereTheHeatIs.tsx           // Panel A
      Gaps.tsx                     // Panel B
      Pressure.tsx                 // Panel C
      Friction.tsx                 // Panel D
    SourceTrace.tsx                // Zone 4
    NarrativeMode.tsx              // 10x: auto-cycle walkthrough
    primitives/
      InsightTile.tsx
      SeverityBadge.tsx
      TagChip.tsx
      PullQuote.tsx
      Panel.tsx
      EmptyState.tsx
      RecordRow.tsx
      DrillSheet.tsx
  hooks/
    useImpacts.ts                  // useBase + useRecords + normalization
    useFilteredImpacts.ts
    useAggregations.ts             // memoized rollups
  styles/
    tokens.ts                      // colors, fonts, spacing
    globals.ts                     // global CSS + print styles
  utils/
    schema.ts                      // table/field constants and types
    aggregations.ts                // pure rollups (matrix, gaps, pressure, friction, deltas)
```

Aggregations are pure functions over normalized `Impact[]`. The dashboard recomputes only when `filtered`/`all` change (memoized).

### Performance notes
- `useRecords` is called with an explicit `fields` list (no full-record fetches).
- Aggregations live in pure functions and are wrapped in `useMemo`.
- The `DrillSheet` virtualizes when row count exceeds 50 (windowed rendering with overscan).

---

## Known limitations

- Friction panel relies on heuristic extraction of party names from `Source_Quote` (regex on capitalized tokens + role keywords). When the quote does not name parties, it falls back to "Party A ⟑ Party B" and shows the full quote.
- Narrative mode is fixed at 5 beats / 3.5s each; not authorable.
- Export PDF uses the browser's print pipeline; the user picks "Save as PDF" in the print dialog.
- The freshness indicator uses the most recent `Source_Run` value; if your run names lack a date, it shows the raw identifier.
- Compare-runs deltas always compare the most recent `Source_Run` to the one before it. Cross-run choosers are not exposed yet.
- The extension assumes the SDK exposes `useBase`, `useRecords`, `expandRecord` from `@airtable/blocks/interface/ui` (matches the existing extensions in this repo). If the SDK surface changes, update `frontend/src/ambient.d.ts` and the imports.

---

## Design philosophy

Density over decoration. Earned beauty. Constrained palette: severity drives red/amber/green; tags get distinct accents; background is warm off-white (`#FAF8F5`). Serif (Playfair Display) for headlines; sans (Inter) for data; mono (JetBrains Mono) for numerics. Tabular figures throughout. No emojis. No pies. No 3D. No rainbow.

Every visual must serve one of the four executive questions. No vanity metrics.
