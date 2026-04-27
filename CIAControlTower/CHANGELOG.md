# Changelog

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
