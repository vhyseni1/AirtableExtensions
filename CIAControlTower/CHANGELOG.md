# Changelog

## v2.0.0 — 2026-05-06

### Changed (breaking schema migration)
Migrated the dashboard to ELEVATE-CIA Master Logic Framework **v3.1**. Field names are no longer backward-compatible with v1.x:

- `Row_ID` → `ID`
- `Category` → `Change_Category` (and `Role & Responsibility` renamed to `Roles & Responsibilities`)
- `Impact_Lens` + `Affiliate_Country` → **single `Affiliate` field** with 8 values: `Global, DE, UK, FR, ES, IT, CA, BR`. MWM is gone.
- `Persona` is now auto-derived in Airtable from `Role`. The canonical row identifier is `Role` (free text or linked record); Persona stays as a derived advisory dimension for matrix axes.
- `Component` → `Change_Component`
- `Description` (single long-text) → split into `Description_As-Is` and `Description_To-Be`
- `Severity` → `Change_Impact`

### Added
- New required field **`Business_Archetypes`** (multi-select: `i8 First Mover, i7 First Mover, i8, i7, Global Function`).
- New conditional field **`ECL_Stream`** (single select: `Comms, Change, Training, Other`) — populated only when `Responsible = ECL Workstream`.
- New filter chips for `Business_Archetypes` in the FilterBar.
- New heatmap **Business_Archetype × Change_Component** on the Heat maps tab.
- SourceTrace now reads `Description_As-Is` and `Description_To-Be` directly (no regex split). Source-trace right column adds `ECL_Stream` and `Business_Archetypes` to the native-rendered field grid.

### Removed
- The Lens segmented filter (replaced by the single Affiliate selector).
- The regex parser that split AS-IS/TO-BE out of the legacy single `Description` field.

## v1.1.0 — 2026-04-27

### Changed
- Re-skinned the dashboard to Roche brand tokens:
  - Primary palette: Roche Dark Blue `#022366`, Roche Blue `#0B41CD`, Light Blue `#1482FA`, Extra Light Blue `#BDE3FF`.
  - Severity bands now follow Roche traffic-light status colors: Red `#FF1F26`, Yellow `#FFD60C`, Green `#00B458`.
  - Tag accents use the Roche accent palette: Heatmap → Orange `#FF7D29`, Pressure → Dark Red `#C40000`, Gap → Dark Orange `#ED4A0D`, Friction → Dark Purple `#BC36F0`.
  - Page surface is Extra-Light-Blue tinted (`#F2F6FF`); panels are crisp white for separation; rules use Extra Light Blue.
  - Type stack switched to **Roche Sans** for both body and headlines (proprietary; falls back to Helvetica → Arial → system sans on non-Roche machines). Removed Playfair Display + Inter Google Fonts imports.
- Schema-mismatch and field-read paths hardened so missing fields render the "Schema mismatch" screen instead of throwing during `useMemo`.
- Switched the SDK initializer to the interface-alpha object form (`initializeBlock({interface: () => ...})`) so the bundle loads inside an Interface page.

## v1.0.0 — 2026-04-27

Initial release.

### Added
- Four-zone dashboard: HeadlineBar, HeatMap (Component × Persona + Lens stack), DiagnosticGrid (Heat / Gaps / Pressure / Friction), SourceTrace.
- Six insight tiles in Zone 1 with delta-vs-prior-run indicators.
- Persistent FilterBar (Run, Lens, Severity, Persona chips, Tag chips) applied globally to all zones.
- DrillSheet for three-click navigation: tile/cell → row → `expandRecord`. Esc to close. Virtualizes above 50 rows.
- Heuristic party extraction in the Friction panel (`Party A ⟑ Party B`).
- Pull-quote SourceTrace with AS-IS → TO-BE → Action Required flow.
- Narrative mode: 5-beat auto-cycle walkthrough with one-sentence callouts.
- Print stylesheet for `Export PDF` (A3 landscape, animations disabled).
- Freshness indicator: latest `Source_Run`, date-extracted when present.
- Editorial empty states throughout.
- Schema validator: surfaces missing fields without crashing.
- Strict TypeScript across business logic (`tsc --noEmit` clean).
