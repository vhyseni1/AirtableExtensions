# EW Data Quality Dashboard

Read-only Airtable Custom Extension that visualises the output of the
**EW Data Quality Engine** (`../ew-dq-engine`). Sponsors and the WFO
operating team open this extension to see KPIs, dimension breakdowns,
field completeness, cross-system consistency, top-offender RRPs, and the
most recent high-severity exceptions — styled to Roche corporate brand.

## What it does

- Reads `DQ_Results`, `Rules`, and `EPP` from the current base. Writes
  nothing.
- Re-renders reactively (`useRecords`) when the engine writes a new
  snapshot.
- Renders six panels in a single dense viewport: KPI strip, dimension
  bars, field completeness + cross-system consistency, RRP leaderboard,
  recent high-severity exceptions, and a run history footer.
- Supports four filter chips (severity / dimension / source table /
  owner RRP) plus a reset button. All panels recalculate on the filtered
  subset.
- Clicking a row in the RRP leaderboard drills the entire dashboard
  down to that RRP. Clicking a record ID in the exceptions list opens
  the matching EPP record via `expandRecord`.

## Prerequisites

- Airtable account on a plan that supports Custom Extensions (Pro or
  above).
- Node.js 14+ and npm.
- Airtable CLI: `npm install -g @airtable/blocks-cli`.
- The base must already contain the tables created/populated by the
  `ew-dq-engine` extension (see below).

## Required tables

| Table        | Why it's read                                          |
|--------------|---------------------------------------------------------|
| `DQ_Results` | The substrate for every panel                          |
| `Rules`      | Active-rule count for the footer; label lookup         |
| `EPP`        | Worker-count denominator + RRP→org/worker-count join   |

Required fields are exactly what the engine writes — see
`../ew-dq-engine/README.md` for type expectations. If any of these
tables is missing the dashboard renders a clear instructional screen
instead of attempting to load.

## Install and run (development)

```bash
cd "Data Quality Radar"
npm install
block run
```

The CLI prints a dev URL. In your Airtable base open Extensions → Add an
extension → Build a custom extension → paste the URL.

## Release

```bash
block release
```

## File layout

```
Data Quality Radar/
  package.json
  block.json
  frontend/
    index.js              initializeBlock entry
    App.js                layout shell + filter state
    theme.js              palette / spacing / typography (only file with hex values)
    components/
      Header.js           Roche-style top strip
      FilterBar.js        4 filter chips + reset
      Card.js             shared card chrome
      KpiStrip.js         panel 1
      DimensionBars.js    panel 2
      CompletenessCard.js panel 3 left
      ConsistencyCard.js  panel 3 right
      RrpLeaderboard.js   panel 4
      ExceptionList.js    panel 5
      RunHistoryFooter.js panel 6
    hooks/
      useDqData.js        reads DQ_Results + Rules + EPP via useRecords
      useFilteredData.js  applies filter state, returns aggregated shape
```

## Notes

- The dashboard uses the same React 16.14 + `@airtable/blocks ^1.18.0`
  stack as the engine extension so both install cleanly in the same
  base with no peer-dep drift.
- The bar chart in Panel 2 is custom-rendered div elements — no
  charting library — to keep the visual language uniform and the
  bundle small.
- Every hex value lives in `frontend/theme.js`. Swap in the official
  Roche brand assets there once available; no component changes are
  needed.
- The `Spend ↔ PO` match rate is computed against the EPP worker count
  as a v1 proxy (the dashboard does not read the `Spend` table). If
  precise denominators matter, add `Spend` to `useDqData.js` and
  divide by its row count instead.
