# Feature Management — Pipeline Tracker (Airtable custom extension)

A single Airtable Blocks SDK extension with an **A/B mode toggle**:

- **High-level (Mode A)** — bird's-eye, cross-team, read-only: pipeline rail, KPI strip,
  flow board, Feature × Phase heatmap, recent-handshakes feed, filters.
- **My team (Mode B)** — operational: Incoming / In progress / Blocked / Ready-to-push
  lanes for one team, with **Promote** and **Accept / Return** actions that write records.

The extension contains **no data** — it binds to the live base at runtime and reads/aggregates
client-side (the base is small, ~620 records, so no native rollup/formula fields are needed).

## The field contract

`frontend/constants.js` is the single source of truth for every table name, field name and
single-select option the extension depends on. These must match the base **verbatim**
(punctuation included — `Acceptance Met?`, `Comments / Handoff Notes`, the long stage names).
If they drift, the extension shows a **setup banner** listing exactly what to rename. Change
the base or change `constants.js`, but never let the two diverge.

Notable format pins handled in `frontend/data.js`:
- `Stage Tasks.Acceptance Criteria` is a **JSON array stored as a string** — parsed into a
  checklist; "all `done:true`" gates Promote.
- Dates are ISO `YYYY-MM-DD`; booleans are Airtable checkboxes.
- `Environment` is `N/A` except on the 5x sourcing tasks (`DEV`/`UAT`/`PROD`).

## Stage path / sourcing branch

Canonical order `1 → 2 → 3 → [4 if Requires Gateway Derivation] → <one 5x> → [6..10 unless Reference Data]`.
The 5x branch is chosen by `Attributes.Sourcing Type` (see `SOURCING_BRANCH` in `constants.js`).
"Next stage" for Promote and "upstream" for the dependency validator are derived from this path
in memory — see `attributePath` / `nextStageCode` / `prevStageCode`.

## Files

```
frontend/
  index.js       entry + A/B toggle + setup/loading states
  constants.js   the field contract (literals, colors, stage-path logic)
  data.js        useModel() — binds tables/fields, reads records, joins + aggregates
  actions.js     promoteTask / decideTask — type-aware, permission-checked writes
  components.js  shared chips, KPI cards, acceptance list, setup banner
  ModeA.js       high-level dashboard
  ModeB.js       team dashboard
  style.css      responsive, focus-visible, prefers-reduced-motion
```

## Run / release

> Custom extensions require a **paid (Team+) plan** — they don't render on Free.

```bash
cd "feature management"
npm install
npx block run        # local dev against your base (uses .block/<id>.remote.json)
npx block release    # publish; Airtable hosts the bundle
```

First-time setup: in the base → **Extensions → Build a custom extension**, create the extension
to generate the `blockId`/`baseId` pairing (`.block/*.remote.json`), then `block run`.
Confirm the current CLI/SDK from <https://airtable.com/developers/extensions>.

> Note: the folder name contains a space. Node tooling handles it, but if your shell or a CI
> step trips on it, run from inside the quoted directory as shown above.

## Writes & limits (§8)

Each Promote/Accept/Return performs 2–3 writes (`createRecordsAsync`/`updateRecordsAsync`,
≤50 records/call, ~15 writes/s) — well within limits. Every write is permission-checked first,
and an in-flight guard prevents a click from double-firing.

## Known data caveat (§9)

`Stage Tasks.Upstream Task` is not populated. The dependency validator therefore derives
"upstream" from the attribute's stage order at runtime (a task is flagged when it's
In Progress / Submitted but its path-predecessor isn't Done/Approved). If you later seed
`Upstream Task`, switch the validator to read it directly.

## Demo script (§11)

1. **Mode A** — rail + KPIs show the whole programme; heatmap shows Loans Disbursement near
   delivered, Repurchase Agreements just starting.
2. Call out **Blocked** and **Awaiting review** in the KPI strip.
3. **Mode B → Data & AI Modelling Crew** — in-progress queue (who's on what) + incoming.
4. **Push** a ready-to-push task → handshake posts, the next stage's task activates, the card
   moves on Mode A's board.
5. Watch the **recent handshakes feed** update live.
