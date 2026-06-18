# ELEVATE TNA Dashboard

A demo dashboard for the Roche **ELEVATE Program** showing how CIA findings
translate into **Training Needs → Learning Modules → persona-level Learning
Journeys**. Built to match the look-and-feel of the CIA Control Tower
(navy primary, serif headlines, paper-white canvas).

## Run

```bash
npm install
npm run dev      # start the dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Open the printed local URL (default http://localhost:5173).

## What's inside

A single-page React app driven entirely by one denormalized table
(`src/data/tna_master.json` — 29 Training Needs × 50 columns). All grouping,
filtering, and aggregation happens in React state; there is no backend.

### Five views

1. **Headline Bar** — 6 KPI tiles (51 CIA Impacts · 29 Training Needs ·
   17 Modules · 5 Journeys · 134 hrs · 14 critical-path weeks). Click a tile
   to jump to the related view.
2. **CIA Heatmap** — Persona × Change-Category matrix, cell intensity scaled to
   weighted severity. Click any cell or component bar to open the detail drawer.
3. **TNA Flow (Sankey)** — CIA Impact → Training Need → Learning Module.
   Hover a node to light up its full lineage; click to open the source records.
4. **Learning Journey** — drag-and-drop module re-sequencing across
   Pre-go-live / Concurrent / Post-go-live phases, with live hour recalculation.
   Defaults to *Primary Point of Contact × Global*.
5. **Module Library** — filterable card grid of all 17 modules.

### Detail Drawer

Slides in from the right across all views. Shows each record's full lineage:
the verbatim **Source Quote**, the CIA Impact (as-is → to-be), the Training
Need (competency, proficiency gap, hours), and the Journey phase.

## Data note

The headline figure of **51 CIA Impacts** is the wider upstream CIA total;
only the **29** impacts that yielded Training Needs appear in this table.
Every other figure is derived live from the data via `distinct()` / `sum()`
helpers in `src/utils/aggregations.js`. No data is invented — empty fields
render empty.

## Stack

React 18 · Vite · Tailwind (base utilities) · @dnd-kit (drag-and-drop) ·
lucide-react (icons) · custom SVG for the Sankey.
