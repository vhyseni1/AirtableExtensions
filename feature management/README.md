# Feature Management — Pipeline Tracker (Airtable custom extension)

A single Airtable Blocks SDK extension with a three-way view toggle:

- **Roadmap** — bird's-eye: features grouped by **Initiative**, each with a maturity rail across
  the 7 phases plus its Target Go-Live date and % maturity. Includes a pipeline rail, KPI strip
  and recent-handshakes feed.
- **By team** — concise per-team queue: roster, per-person load, and the team's attributes
  grouped by stage/phase.
- **Workflow** — operational lanes (Incoming / In progress / Blocked / Ready-to-push) with
  **Promote** and **Accept / Return** actions that write to the base.

The extension holds **no data** — it binds to the live base at runtime (`useBase`/`useRecords`)
and joins/aggregates client-side. The base is small (~hundreds of rows), so no native
rollup/formula fields are required.

## Data model (5 tables)

Simplified from the original 6-table design: the heavy per-attribute-**per-stage**
`Stage Tasks` cross-product is **gone**. Each **Attribute is the work item** and carries its own
`Current Stage`.

| Table | Role |
|---|---|
| **Teams** | Teams **and** their users — `Users` is a multi-collaborator field. |
| **Features** | One row per feature; an **`Initiative`** field groups them. |
| **Attributes** | The work item: catalog fields **+** `Current Stage` (link→Stages), `Status`, `Assignee`, `Assigned/Approver Team`, `Acceptance Criteria`, dates. |
| **Stages** | Thin reference ladder: `Stage Code`, `Order`, `Phase Group`, `Responsible Team`, `Approver Team`. Drives order, phase and handoff routing. |
| **Handshakes** | Audit log of every promote / accept / return. Optional — the app degrades gracefully if absent. |

`frontend/constants.js` is the single source of truth for every table/field/option name and
must match the base **verbatim** (punctuation included — `Acceptance Met?`,
`Comments / Handoff Notes`). On any mismatch the app shows a **setup banner** naming what to fix.

### Why a thin `Stages` table (not 4 tables / globalConfig)
Full workflow + audit needs each stage's order, phase and responsible/approver team to route a
promote handshake. With `globalConfig` write-support unconfirmed in the interface-alpha SDK, that
backbone lives in a small, explicit **Stages reference table** — fully data-driven, no heuristics.
`Attributes.Current Stage` links to it, so an attribute's phase/owner is read straight off the link.

## Stage path / sourcing branch (logic, not data)

`1 → 2 → 3 → [4 if Requires Gateway Derivation] → <one 5x branch> → [6..10 unless Reference Data]`.
The 5x branch is chosen by `Attributes.Sourcing Type` (`SOURCING_BRANCH` in `constants.js`).
"Next stage" and per-feature maturity are derived from this path against the `Stages` ladder.

## Files

```
frontend/
  index.js       entry + 3-way toggle (Roadmap / By team / Workflow) + setup/loading
  constants.js   field contract (5-table), colors, stage-path logic
  data.js        useModel() — binds tables, reads records, Attributes-centric joins + aggregates
  actions.js     promoteTask / decideTask — type-aware, permission-checked, batched writes
  components.js  shared chips, KPI cards, progress bar, acceptance list, setup banner
  Roadmap.js     features-by-initiative roadmap + rail + KPIs + handshake feed
  TeamView.js    per-team queue
  Workflow.js    interactive lanes + Promote / Accept / Return
  style.css      responsive, focus-visible, prefers-reduced-motion
```

## Run / release

> Custom extensions require a **paid (Team+) plan** — they don't render on Free.

```bash
cd "feature management"
npm install
npx block run        # local dev against your base (.block/<id>.remote.json)
npx block release    # publish; Airtable hosts the bundle
```

First-time: in the base → **Extensions → Build a custom extension** to create the
`blockId`/`baseId` pairing, then `block run`. Confirm the current CLI/SDK at
<https://airtable.com/developers/extensions>. (The folder name has a space — run from inside the
quoted directory; Node tooling handles it.)

`npm run lint` runs ESLint over `frontend/`.

## Workflow & limits

Promote/Accept/Return each perform 2–3 writes (`createRecordsAsync`/`updateRecordsAsync`,
≤50 records/call, ~15 writes/s — well within limits). Every write is permission-checked first and
an in-flight guard prevents double-firing.

- **Promote** (owning team, work done): Status → Submitted for Review, Approval → Pending; posts a
  handshake to the next stage's responsible team.
- **Accept** (approver): advances `Current Stage` to the next step in the attribute's path
  (reassigning to that stage's responsible/approver team), or marks Done if final; posts a handshake.
- **Return** (approver): requires a comment, sets Rejected / Returned, bumps `Cycle Number`,
  posts a handshake.

## Verification

- `npm install && npx block run`, point at the base.
- Rename a field → confirm the **setup banner** lists it; restore.
- **Roadmap**: features group under their Initiative; rail position matches each feature's
  furthest attribute phase; go-live dates render.
- **By team**: selecting a team shows only that team's attributes and its roster.
- **Workflow**: Promote a ready attribute → handshake appears in the feed; Accept advances its
  stage on the roadmap; Return requires a comment and bumps Cycle Number.
