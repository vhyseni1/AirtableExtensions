# Feature Management — Pipeline Tracker (Airtable custom extension)

A single Airtable Blocks SDK extension with a four-way view toggle:

- **Roadmap** — bird's-eye: features grouped by **Initiative**, each with a maturity rail across
  the 7 phases plus its Target Go-Live date and % maturity. Includes a pipeline rail, KPI strip
  and recent-handshakes feed.
- **By team** — concise per-team queue: roster, per-person load, and the team's attributes
  grouped by stage/phase.
- **Workflow** — operational lanes (Incoming / In progress / Blocked / Ready-to-push) with
  **Promote** and **Accept / Return** actions that write to the base.
- **Executive review** — a **stories reel**: full-bleed cards that auto-advance with a pip rail,
  tap zones, keyboard control and pause. Built for showing, not browsing. Deck order: overview →
  pipeline → one card per initiative → delivery risk → blocked → decision queue → rework →
  momentum → the ask.

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
standalone/
  index.html     dependency-free single-file replica of all three views (see below)
  README.md      what it replicates and where it necessarily differs
```

## Standalone HTML replica

`standalone/index.html` is the same three views — plus a full-data Register tab — in one flat
file with no build step, no server and no network calls. It runs the identical stage-path,
aggregate and Promote/Accept/Return logic against an embedded copy of `sample-data/`, writing to
an in-memory dataset instead of the base, and can load an Airtable CSV export at runtime. Use it
for demos, reviews and anyone without a Team+ seat. Details in `standalone/README.md`.

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

### Windows / PowerShell

`release.ps1` wraps the release with the preflight checks that catch the usual mistakes — wrong
Node, unpaired remote, missing token, dirty tree, failing lint — and uploads nothing until they all
pass. It operates on its own directory, so the space in the folder name is not an issue.

The script is deliberately **pure ASCII and BOM-free**: Windows PowerShell 5.1 reads a BOM-less
UTF-8 script as ANSI, which mangles any non-ASCII character in it, and the legacy console cannot
render box-drawing or check-mark glyphs anyway. Keep it that way.

First time on a machine:

```powershell
# 1. Get the code (skip if you already have a clone). Replace the path with
#    wherever you keep repos — there is no default location.
cd $HOME
git clone https://github.com/vhyseni1/AirtableExtensions.git
cd "$HOME\AirtableExtensions\feature management"

# 2. Clear the "downloaded from the internet" mark and allow unsigned scripts.
#    -Scope Process limits the policy change to this window.
Unblock-File .\release.ps1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

Then, for every release:

```powershell
.\release.ps1                                          # default remote, auto comment
.\release.ps1 -Remote prod -Comment "Executive review"  # named remote (.block\prod.remote.json)
.\release.ps1 -SkipLint -Force                          # ship the working tree as-is
```

| Parameter | Effect |
|---|---|
| `-Remote <name>` | Release to `.block\<name>.remote.json` instead of the default `.block\remote.json`. |
| `-Comment <text>` | Release note (CLI caps it at 1000 chars; the script truncates). Defaults to `<branch>@<sha> — <timestamp>`. |
| `-SkipLint` | Skip `npm run lint`. |
| `-Force` | Allow a release from a dirty working tree — refused by default. |
| `-CliVersion` | Pin `@airtable/blocks-cli` (default `3.0.3`) so a CLI release can't change your build unasked. |

Prerequisites it checks for you, and how to satisfy them:

- **Node 18.18+** — ESLint 9 in this repo is the binding constraint, not the CLI (which declares
  `>=10`).
- **Remote pairing** — one of `.block\remote.json` (default) or `.block\<name>.remote.json`
  (named). See *Pairing the folder with a base* below.
- **Personal access token** with the **`block:manage`** scope, from
  <https://airtable.com/create/tokens>, stored via `block set-api-key` (writes
  `.airtableblocksrc.json` — home directory by default; the app-scoped copy is git-ignored, keep it
  that way).

#### Pairing the folder with a base

A checkout has no `.block/` directory — that pairing is per machine and is not committed. Do this
once, then never again on that machine.

Get the **block identifier** (`<baseId>/<blockId>`, e.g. `app12345678/blk12345678`) from the base:
**Extensions → Add an extension → Build a custom extension**. Airtable shows a
`block init app…/blk… ` command; the `app…/blk…` part is the identifier.

Then pick one:

```powershell
# A. Named remote — the supported command. The name is REQUIRED
#    (letters, digits, hyphen, underscore) and it writes .block\prod.remote.json.
npx --yes --package @airtable/blocks-cli@3.0.3 block add-remote app.../blk... prod
.\release.ps1 -Remote prod          # -Remote needed on every release

# B. Default remote — write the file yourself, then no flag is ever needed.
New-Item -ItemType Directory -Force .block | Out-Null
'{"baseId": "app...", "blockId": "blk..."}' | Set-Content .block\remote.json -Encoding ascii
.\release.ps1
```

`block add-remote` cannot produce the default `.block\remote.json` — only `block init` does, and
`init` refuses to write into a directory that already exists (and would pull a template over your
code). So in an existing checkout it is A or B, never `init`.

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
- **Executive review**: the deck length is 9 + one card per initiative; ← / → and the tap zones
  move between cards; pause holds the current card; a feature with a past go-live reads
  "date passed, N% left", never a bare minus or an em-dash pace.
