# EW Data Quality Engine

Airtable Custom Extension that runs 18 cross-table data quality rules against the
External Workforce (EW) base and writes exceptions to a `DQ_Results` table.

## What it does

1. Reads `EPP`, `Fieldglass`, `PurchaseOrders`, `Spend`, `Valid_Cost_Centers` from
   the current base.
2. Reads the `Rules` table and runs every rule where `Active = Yes`.
3. Truncates `DQ_Results` and writes a fresh snapshot of all exceptions found.
4. Displays a UI with Run button, progress bar, summary stats, rule toggles, and
   a log panel.

Each run is a full refresh — there is no incremental mode. The latest snapshot in
`DQ_Results` is the source of truth for the downstream Interface dashboard.

## Prerequisites

- Airtable account on a plan that supports Custom Extensions (Pro or above).
- Node.js 14+ and npm.
- Airtable CLI: `npm install -g @airtable/blocks-cli`.

## Required base structure

| Table | Notes |
|---|---|
| `EPP` | Master EW records |
| `Fieldglass` | FG extract |
| `PurchaseOrders` | PO source |
| `Spend` | Finance spend lines |
| `Valid_Cost_Centers` | Reference list |
| `Rules` | Rule definitions; drives the engine |
| `DQ_Results` | Output table; extension writes here |

The extension reads tables by name. Don't rename or prefix them.

Field-type expectations the engine relies on:

- `Rules.Active` — Single Select with options `Yes`, `No`.
- `DQ_Results.Status` — Single Select with options `Open`, `In Progress`,
  `Resolved`, `Suppressed`. Default `Open`.
- `DQ_Results.Run_Timestamp` — Date field with "Include time" enabled.
- `DQ_Results.DQ_Dimension` — Single Select: `Completeness`, `Accuracy`,
  `Consistency`, `Referential`, `Validity`, `Uniqueness`.
- `DQ_Results.Severity` — Single Select: `High`, `Medium`, `Low`.

## Install and run (development)

```bash
cd ew-dq-engine
npm install
block run
```

The CLI prints a URL. In your Airtable base, open Extensions → Add an extension
→ Build a custom extension → paste the URL.

## Release

```bash
block release
```

## Configuration

There is no config file. The engine reads source tables by name from the current
base. To disable a rule without removing it from code, toggle its switch off in
the Active rules panel — that updates the `Active` field on the corresponding
row in the `Rules` table.

## Rule pack

18 rules covering Completeness, Accuracy, Validity, Uniqueness, Consistency
(EPP ↔ FG), and Referential integrity (EPP/Spend ↔ PO). See `frontend/engine/rules.js`
for the implementation and the brief for exact logic per rule.

With the v1 reference dataset (EPP 154, FG 143, PO 141, Spend 353), a clean run
produces approximately 149 exceptions in under 30 seconds.

## File layout

```
ew-dq-engine/
  package.json
  block.json
  frontend/
    index.js
    components/
      App.js
      RunPanel.js
      RulesPanel.js
      LogPanel.js
    engine/
      runner.js     orchestrates: read sources, run rules, write results
      rules.js      map of Rule_ID → async function(sources) => exceptions[]
      sources.js    load + index source tables
      writer.js     truncate + batch-write DQ_Results (50/batch)
```
