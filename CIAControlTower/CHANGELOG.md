# Changelog

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
