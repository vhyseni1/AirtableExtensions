# Standalone HTML replica

`index.html` is a **single self-contained file** — no build, no server, no dependencies, no
network calls. Open it in a browser (double-click, or drop it on a share) and the whole
Feature Management extension is there.

## What it replicates

| Extension file | Replicated as |
|---|---|
| `frontend/constants.js` | the `FIELDS` / `STATUS` / `PHASE_*` block + `attributePath` / `nextStageCode` / `maturityFraction` — same literals, same stage-path rule |
| `frontend/data.js` (`useModel`) | `buildModel(raw)` — same joins, same per-feature aggregates, same KPI definitions |
| `frontend/actions.js` | `promoteTask` / `decideTask` — same status/approval transitions, same acceptance gate, same cycle bump, same handshake record |
| `frontend/Roadmap.js` | **Roadmap** tab |
| `frontend/TeamView.js` | **By team** tab |
| `frontend/Workflow.js` | **Workflow** tab (Push / Accept / Return all work) |
| `expandRecord()` | attribute detail modal (all 23 fields + stage path + handshake history) |
| `useBase()` / `useRecords()` | the embedded `SEED` object, or a CSV you load at runtime |

Two things the flat file adds, both to satisfy "show full data":

- **Stage ladder** — a per-stage strip (all 14 stages, counts, responsible team), next to the
  7-phase rail the extension already had.
- **Register** tab — every row of every table with every column, nothing truncated.

## Differences from the extension (unavoidable)

- Writes go to an **in-memory copy** of the dataset, not to Airtable. *Reset demo data* restores
  the seed; a page reload does the same. Nothing persists.
- No Airtable session, so **Acting as** is a picker over everyone on the Teams roster; that name
  is written as the handshake's Decision Maker.
- No permission checks (`hasPermissionTo…`) — there is no base to check against.
- The setup banner is not needed: field names that don't match simply read as empty, and the
  footer states the row counts actually loaded.

## Loading your own data

**Load CSVs…** accepts an Airtable CSV export of any of the five tables. Files are matched by
filename containing `teams`, `features`, `attributes`, `stages`, or `handshakes`; the columns must
be the field names in `constants.js` verbatim. Files are read in the browser and never uploaded.

The seed dataset is the output of `../sample-data/generate.py` — synthetic, with no client or
vendor identifiers.
