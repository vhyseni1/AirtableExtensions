// The stacked org views — the Airtable port of the Apps Script deck renderers.
//
//   variant "stacked"    one slide per side (StackedOrg.html): current pass
//                        then future pass, each with the four-column KPI table
//                        and the current↓ / future↑ diff badges.
//   variant "comparison" one slide per group with current and future rendered
//                        side by side (Index.html).
//
// Read-only: clicking a slot opens its record.

import {useState, useMemo, useRef, useCallback} from 'react';
import {Slide, ComparisonSlide} from '../components/Slide';
import FilterTree from '../components/FilterTree';
import {ExportMenu, ToggleSwitch} from '../components/Controls';
import ExportCeremony from '../components/ExportCeremony';
import {paginateLevels, buildFilterTree, computeKpis} from '../lib/stacked';
import {exportPNG, exportSlidesPDF, toCSV, downloadText} from '../lib/exports';
import {SLIDE, WORKS_COUNCIL} from '../config';

// Zoom presets rather than free pan/zoom: a slide is a fixed 1280×720 canvas,
// so what a reader wants is "fit the width", not arbitrary panning.
const ZOOMS = [0.5, 0.65, 0.8, 1];

export default function StackedDeck({model, variant}) {
    const {slides, dltLabels} = model;
    const [countMode, setCountMode] = useState('hc');
    const [showNotes, setShowNotes] = useState(true);
    const [zoom, setZoom] = useState(0.65);
    const [selected, setSelected] = useState(() => new Set());
    const [ceremony, setCeremony] = useState(false);
    const deckRef = useRef(null);

    const allSlideTitles = useMemo(() => slides.map(s => s.slideTitle), [slides]);
    const tree = useMemo(() => buildFilterTree(slides, dltLabels), [slides, dltLabels]);

    // An empty selection means "everything" — the filter starts unfiltered and
    // clearing it returns to that, rather than blanking the deck.
    const visible = useMemo(
        () => (selected.size === 0 ? slides : slides.filter(s => selected.has(s.slideTitle))),
        [slides, selected],
    );

    // Expand each slide into the pages that actually get rendered. The Apps
    // Script emits every current page first, then every future page, so the
    // deck reads as "here is today" then "here is the target".
    const pages = useMemo(() => {
        const out = [];
        if (variant === 'comparison') {
            visible.forEach(slide => {
                const paged = paginateLevels(slide.levels, 'both');
                paged.forEach((levels, i) => {
                    if (!levels.length) return;
                    out.push({
                        kind: 'comparison',
                        slide,
                        levels,
                        pageNum: i + 1,
                        totalPages: paged.length,
                        key: `${slide.slideTitle}-${i}`,
                    });
                });
            });
            return out;
        }
        ['current', 'future'].forEach(mode => {
            visible.forEach(slide => {
                const paged = paginateLevels(slide.levels, mode);
                paged.forEach((levels, i) => {
                    if (!levels.length) return;
                    out.push({
                        kind: 'slide',
                        slide,
                        levels,
                        mode,
                        pageNum: i + 1,
                        totalPages: paged.length,
                        key: `${mode}-${slide.slideTitle}-${i}`,
                    });
                });
            });
        });
        return out;
    }, [visible, variant]);

    const exportItems = useMemo(() => [
        {
            label: `Publish deck · ${pages.length} page${pages.length !== 1 ? 's' : ''}`,
            run: () => setCeremony(true),
        },
        {
            label: `PDF · ${pages.length} slide${pages.length !== 1 ? 's' : ''} (16:9)`,
            run: () => exportSlidesPDF(deckRef.current, SLIDE, 'org-design-deck'),
        },
        {
            label: 'PNG · whole deck',
            run: () => deckRef.current && exportPNG(deckRef.current, 'org-design-deck'),
        },
        {
            label: 'CSV · slide KPIs',
            run: () => {
                const rows = [];
                visible.forEach(slide => {
                    ['current', 'future'].forEach(mode => {
                        const k = computeKpis(slide.totals, mode);
                        rows.push([slide.slideTitle, mode, k.asIs, k.impacted, k.newPos, k.toBe, k.total]);
                    });
                });
                downloadText(
                    toCSV(['Slide', 'Side', 'As is', 'At risk', 'New positions', 'Proposed', 'Total'], rows),
                    'org-design-kpis.csv',
                );
            },
        },
    ], [pages.length, visible]);

    const cycleZoom = useCallback(() => {
        setZoom(z => ZOOMS[(ZOOMS.indexOf(z) + 1) % ZOOMS.length] || ZOOMS[0]);
    }, []);

    if (!slides.length) {
        return (
            <div className="empty-state">
                No org-design data to display. Check that the table and its Slide
                Title, Level, Supervisory Organization and Position Name fields
                resolved — see the Fields panel in the Data tab.
            </div>
        );
    }

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <FilterTree
                        tree={tree}
                        allSlideTitles={allSlideTitles}
                        selected={selected}
                        onChange={setSelected}
                    />
                    {selected.size > 0 && (
                        <button className="tb-btn tb-btn-clear" onClick={() => setSelected(new Set())}>
                            Clear · {selected.size} of {allSlideTitles.length}
                        </button>
                    )}
                    <span className="toolbar-label">
                        {pages.length} slide{pages.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="toolbar-right">
                    <div className="seg-toggle" role="group" aria-label="Count mode">
                        {[['hc', 'Headcount'], ['fte', 'FTE']].map(([value, label]) => (
                            <button
                                key={value}
                                className={`seg-btn ${countMode === value ? 'active' : ''}`}
                                onClick={() => setCountMode(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <ToggleSwitch checked={showNotes} onChange={setShowNotes} label="Notes" />
                    <button className="tb-btn" onClick={cycleZoom} title="Cycle slide zoom">
                        {Math.round(zoom * 100)}%
                    </button>
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="deck-scroll">
                <div className="deck" ref={deckRef} style={{'--slide-zoom': zoom}}>
                    {pages.length === 0 && (
                        <div className="no-reports">No slides match the current filter.</div>
                    )}
                    {pages.map(p => (p.kind === 'comparison' ? (
                        <ComparisonSlide
                            key={p.key}
                            slide={p.slide}
                            pageLevels={p.levels}
                            countMode={countMode}
                            pageNum={p.pageNum}
                            totalPages={p.totalPages}
                            showNotes={showNotes}
                        />
                    ) : (
                        <Slide
                            key={p.key}
                            slide={p.slide}
                            pageLevels={p.levels}
                            mode={p.mode}
                            countMode={countMode}
                            pageNum={p.pageNum}
                            totalPages={p.totalPages}
                            showNotes={showNotes}
                        />
                    )))}
                </div>
            </div>

            <ExportCeremony
                open={ceremony}
                totalPages={pages.length}
                driveLocation={WORKS_COUNCIL.driveLocation}
                title={variant === 'comparison' ? 'Current vs future deck' : 'Stacked org deck'}
                demo
                onClose={() => setCeremony(false)}
            />
        </div>
    );
}
