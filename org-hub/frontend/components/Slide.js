// The slide primitives shared by the two stacked views: a position slot, an
// org cluster, a DLT level band, and the slide chrome (title bar, KPI table,
// notes band, legend).
//
// The 1280×720 geometry and the three-slots-per-column packing are ported from
// the Apps Script deck, so a slide rendered here breaks where the deck breaks.

import {expandRecord} from '@airtable/blocks/interface/ui';
import {
    slotMatchesMode, slotValue, slotBase, slotBucket,
    clusterWidth, layoutOrgRows, computeKpis, computePageKpis, LAYOUT,
} from '../lib/stacked';
import {STATUS_COLORS} from '../config';

function fmtCount(v, countMode) {
    const n = Number(v || 0);
    return countMode === 'fte' ? n.toFixed(1) : String(Math.round(n));
}

// Country codes render as small text chips. The source deck fetches flag PNGs
// from a CDN; an extension iframe can't rely on that, and the code is the
// unambiguous label anyway.
function CountryChips({country}) {
    const codes = String(country || '')
        .split(/[;,]/)
        .map(x => x.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 4);
    if (!codes.length) return <div className="slot-flags" />;
    return (
        <div className="slot-flags">
            {codes.map(c => <span key={c} className="slot-flag">{c}</span>)}
        </div>
    );
}

// ─── Slot ────────────────────────────────────────────────────────────────────

export function Slot({slot, mode, countMode, onOpen}) {
    const value = slotValue(slot, mode, countMode);
    const base = slotBase(slot, mode, countMode);
    const bucket = slotBucket(slot, mode);
    const style = bucket ? STATUS_COLORS[bucket] : null;

    // The diff badge only appears in the direction that side can move: the
    // current side can only shrink, the future side can only grow. Anything
    // else would double-report the same change on both slides.
    const diff = value - base;
    const showDiff = Math.round(diff * 100) !== 0
        && (mode === 'current' ? (base > 0 && diff < 0) : (slot.future > 0 && base > 0 && diff > 0));

    return (
        <div
            className={`slot${bucket ? ` slot-${bucket}` : ''}`}
            style={style ? {background: style.bg, color: style.fg, borderColor: 'transparent'} : undefined}
            title={`${slot.pos}${slot.country ? ` · ${slot.country}` : ''}`}
            onClick={() => onOpen && slot.record && onOpen(slot.record)}
        >
            <CountryChips country={slot.country} />
            <div className="slot-pos">{slot.pos}</div>
            <div className="slot-badges">
                <span className="slot-count">{fmtCount(value, countMode)}</span>
                {showDiff && (
                    <span className={`slot-count slot-diff ${diff > 0 ? 'pos' : 'neg'}`}>
                        {diff > 0 ? '+' : ''}{fmtCount(diff, countMode)}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Org cluster ─────────────────────────────────────────────────────────────

export function OrgCluster({orgObj, mode, countMode, onOpen}) {
    const slots = (orgObj.slots || []).filter(s => slotMatchesMode(s, mode));
    if (!slots.length) return null;

    const totalCols = Math.max(1, Math.ceil(slots.length / 3));
    const colsPerBand = Math.min(3, totalCols);
    const bands = Math.ceil(totalCols / colsPerBand);
    const total = slots.reduce((sum, s) => sum + slotValue(s, mode, countMode), 0);

    const bandEls = [];
    for (let b = 0; b < bands; b++) {
        const colsThisBand = Math.min(colsPerBand, totalCols - b * colsPerBand);
        const cols = [];
        for (let c = 0; c < colsThisBand; c++) {
            const start = (b * colsPerBand + c) * 3;
            const colSlots = slots.slice(start, start + 3);
            if (!colSlots.length) continue;
            cols.push(
                <div className="org-col" key={c}>
                    {colSlots.map((s, i) => (
                        <Slot key={`${s.pos}-${s.country}-${i}`} slot={s} mode={mode}
                            countMode={countMode} onOpen={onOpen} />
                    ))}
                </div>,
            );
        }
        bandEls.push(<div className="org-row" key={b}>{cols}</div>);
    }

    return (
        <div className="org-cluster" style={{width: clusterWidth(totalCols)}}>
            <div className={`org-head${totalCols <= 1 ? ' wrap2' : ''}`}>
                <span className="org-head-text">{orgObj.org}</span>
                <span className="org-head-badge">{fmtCount(total, countMode)}</span>
            </div>
            <div className="org-body">{bandEls}</div>
        </div>
    );
}

// ─── Level band ──────────────────────────────────────────────────────────────

export function LevelBand({levelObj, mode, countMode, onOpen}) {
    const orgs = (levelObj.orgs || []).filter(o => (o.slots || []).some(s => slotMatchesMode(s, mode)));
    if (!orgs.length) return null;
    const rows = layoutOrgRows(orgs);
    return (
        <>
            {rows.map((row, i) => (
                <div className="level-row" key={i}>
                    <div className="dlt-label"><span>{levelObj.level}</span></div>
                    <div className="side-area">
                        <div className="cluster-row">
                            {row.map((d, j) => (
                                <OrgCluster key={j} orgObj={d.org} mode={mode}
                                    countMode={countMode} onOpen={onOpen} />
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
}

// ─── KPI table ───────────────────────────────────────────────────────────────

function KpiTable({slideKpi, pageKpi, countMode}) {
    const cell = (v, cls) => <div className={`kpi-cell ${cls}`}>{fmtCount(v, countMode)}</div>;
    return (
        <div className="kpi-table">
            <div className="kpi-row-lbl" />
            <div className="kpi-cell hdr c-grey">As Is</div>
            <div className="kpi-cell hdr c-red">At Risk</div>
            <div className="kpi-cell hdr c-green">New Pos</div>
            <div className="kpi-cell hdr c-blue">Proposed</div>

            <div className="kpi-row-lbl">Slide</div>
            {cell(pageKpi.asIs, 'c-grey')}
            {cell(pageKpi.impacted, 'c-red')}
            {cell(pageKpi.newPos, 'c-green')}
            {cell(pageKpi.toBe, 'c-blue')}

            <div className="kpi-row-lbl">Org</div>
            {cell(slideKpi.asIs, 'c-grey')}
            {cell(slideKpi.impacted, 'c-red')}
            {cell(slideKpi.newPos, 'c-green')}
            {cell(slideKpi.toBe, 'c-blue')}
        </div>
    );
}

// ─── Notes band ──────────────────────────────────────────────────────────────

function bullets(text) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) return null;
    return <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>;
}

function NotesBand({notes}) {
    return (
        <div className="notes-band">
            <div />
            <div className="note-box">
                <div className="note-title">Potential people impact</div>
                <div className="note-content">{bullets(notes && notes.peopleImpact)}</div>
            </div>
            <div className="note-box">
                <div className="note-title">Organizational ambition</div>
                <div className="note-content">{bullets(notes && notes.ambition)}</div>
            </div>
        </div>
    );
}

function Legend({mode, countMode}) {
    const countLabel = countMode === 'fte' ? 'FTE' : 'Headcount';
    const items = mode === 'current'
        ? [
            ['selection', 'In selection'],
            ['mapped', 'Mapped / no change'],
            ['risk', 'At risk'],
        ]
        : [
            ['selection', 'In selection'],
            ['mapped', 'Mapped / no change'],
            ['posted', 'New positions'],
        ];
    return (
        <div className="legend-band">
            <div className="slide-legend">
                {items.map(([bucket, label]) => (
                    <span className="leg-item" key={bucket}>
                        <span className="leg-sw" style={{background: STATUS_COLORS[bucket].bg}} />
                        <span>{label}</span>
                    </span>
                ))}
                <span className="leg-item">
                    <span className="leg-dot" style={{background: '#1d4ed8'}} />
                    <span>{countLabel}</span>
                </span>
                <span className="leg-item">
                    <span className="leg-dot" style={{background: mode === 'current' ? '#ef4444' : '#22c55e'}} />
                    <span>{mode === 'current' ? 'Decreased' : 'Increased'}</span>
                </span>
            </div>
            <div className="footer-line">
                Subject to employee representative consultation process
            </div>
        </div>
    );
}

// ─── A whole slide ───────────────────────────────────────────────────────────

export function Slide({slide, pageLevels, mode, countMode, pageNum, totalPages, showNotes}) {
    const slideKpi = computeKpis(slide.totals, mode);
    const pageKpi = computePageKpis(pageLevels, mode);
    const onOpen = record => expandRecord(record);

    return (
        <div className="slide-wrap">
            <div className="slide">
                <div className="slide-pad">
                    <div className="slide-topbar">
                        <div>
                            <div className="slide-title">
                                {slide.slideTitle}
                                {totalPages > 1 && (
                                    <span className="slide-page"> ({pageNum}/{totalPages})</span>
                                )}
                                <span className={`mode-tag ${mode}`}>
                                    {mode === 'current' ? 'Current' : 'Future'}
                                </span>
                            </div>
                            <div className="slide-subtitle">
                                {(slide.notes && slide.notes.subtitle) || slide.sectionName || ''}
                            </div>
                        </div>
                    </div>

                    <div className="content-band">
                        <div className="matrix-head">
                            <div className="dlt-head">{slide.sectionLevel || ''}</div>
                            <div className="headbar">
                                <div className="headbar-left">
                                    {mode === 'current' ? 'Current: ' : 'Future: '}
                                    {slide.sectionName || slide.slideTitle}
                                </div>
                                <KpiTable slideKpi={slideKpi} pageKpi={pageKpi} countMode={countMode} />
                            </div>
                        </div>
                        <div className="levels">
                            {(pageLevels || []).map((lv, i) => (
                                <LevelBand key={`${lv.level}-${i}`} levelObj={lv} mode={mode}
                                    countMode={countMode} onOpen={onOpen} />
                            ))}
                        </div>
                    </div>

                    {showNotes && <NotesBand notes={slide.notes} />}
                    <Legend mode={mode} countMode={countMode} />
                </div>
            </div>
        </div>
    );
}

// ─── Side-by-side slide (the Index.html layout) ──────────────────────────────
//
// The same level bands rendered twice — current on the left, future on the
// right — so a reader compares the two states without paging between them.

export function ComparisonSlide({slide, pageLevels, countMode, pageNum, totalPages, showNotes}) {
    const onOpen = record => expandRecord(record);
    const curTotal = slide.totals.curFuture;
    const futTotal = slide.totals.future;
    const levels = (pageLevels || []).filter(l =>
        l.orgs.some(o => o.slots.some(s => s.current > 0 || s.future > 0)));

    return (
        <div className="slide-wrap">
            <div className="slide slide-wide">
                <div className="slide-pad">
                    <div className="slide-topbar">
                        <div>
                            <div className="slide-title">
                                {slide.slideTitle}
                                {totalPages > 1 && (
                                    <span className="slide-page"> ({pageNum}/{totalPages})</span>
                                )}
                            </div>
                            <div className="slide-subtitle">
                                {(slide.notes && slide.notes.subtitle) || slide.sectionName || ''}
                            </div>
                        </div>
                    </div>

                    <div className="content-band">
                        <div className="matrix-head matrix-head-split">
                            <div className="dlt-head">{slide.sectionLevel || ''}</div>
                            <div className="headbar">
                                <span className="total-badge">{fmtCount(curTotal, countMode)}</span>
                                <div className="headbar-left">
                                    Current: {slide.sectionName || slide.slideTitle}
                                </div>
                            </div>
                            <div className="headbar">
                                <span className="total-badge">{fmtCount(futTotal, countMode)}</span>
                                <div className="headbar-left">
                                    Future: {slide.sectionName || slide.slideTitle}
                                </div>
                            </div>
                        </div>
                        <div className="levels">
                            {levels.map((lv, i) => (
                                <div className="level-row level-row-split" key={`${lv.level}-${i}`}>
                                    <div className="dlt-label"><span>{lv.level}</span></div>
                                    {['current', 'future'].map(mode => (
                                        <div className="side-area" key={mode}>
                                            {layoutOrgRows(
                                                lv.orgs.filter(o => o.slots.some(s => slotMatchesMode(s, mode))),
                                                LAYOUT.splitSideW,
                                            ).map((row, r) => (
                                                <div className="cluster-row" key={r}>
                                                    {row.map((d, j) => (
                                                        <OrgCluster key={j} orgObj={d.org} mode={mode}
                                                            countMode={countMode} onOpen={onOpen} />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    {showNotes && <NotesBand notes={slide.notes} />}
                    <Legend mode="future" countMode={countMode} />
                </div>
            </div>
        </div>
    );
}
