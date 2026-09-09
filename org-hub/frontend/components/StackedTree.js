// The stacked (top-down) tree renderer — the Airtable port of the Apps Script
// org renderer. Generic over the node shape so both the supervisory-org tree
// and the people tree can use it.
//
// A node is: {
//   id, title, subtitle?, meta?, weight?, borderColor?, bgColor?,
//   badge?, children: [node]
// }
//
// Read-only: clicking a card calls onOpen(node); there is no drag-to-reparent.

import {useState, useRef, useEffect, useCallback} from 'react';

// ─── SVG connector layer ─────────────────────────────────────────────────────

function ConnectorLines({wrapperRef, version}) {
    const [paths, setPaths] = useState([]);

    useEffect(() => {
        if (!wrapperRef.current) return;

        const wrapper = wrapperRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        const scale = wrapperRect.width / wrapper.offsetWidth || 1;
        const newPaths = [];

        wrapper.querySelectorAll('[data-node-id]').forEach(parentEl => {
            const parentId = parentEl.getAttribute('data-node-id');
            const li = parentEl.closest('li');
            if (!li) return;
            const childUl = li.querySelector(':scope > ul');
            if (!childUl) return;

            const childCards = childUl.querySelectorAll(':scope > li > [data-node-id]');
            if (childCards.length === 0) return;

            const parentRect = parentEl.getBoundingClientRect();
            const px = (parentRect.left + parentRect.width / 2 - wrapperRect.left) / scale;
            const py = (parentRect.bottom - wrapperRect.top) / scale;

            childCards.forEach(childEl => {
                const childRect = childEl.getBoundingClientRect();
                const cx = (childRect.left + childRect.width / 2 - wrapperRect.left) / scale;
                const cy = (childRect.top - wrapperRect.top) / scale;
                const midY = py + (cy - py) * 0.5;
                newPaths.push({
                    key: `${parentId}-${childEl.getAttribute('data-node-id')}`,
                    d: `M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`,
                });
            });
        });

        setPaths(newPaths);
    }, [wrapperRef, version]);

    return (
        <svg className="connector-svg">
            {paths.map(p => <path key={p.key} d={p.d} />)}
        </svg>
    );
}

// ─── Per-level weight histogram (background bars) ────────────────────────────

function DepthHistogram({wrapperRef, version, visible}) {
    const [bars, setBars] = useState([]);

    useEffect(() => {
        if (!visible) {
            setBars([]);
            return;
        }
        if (!wrapperRef.current) return;

        const wrapper = wrapperRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        const scale = wrapperRect.width / wrapper.offsetWidth || 1;
        const depthMap = {};

        wrapper.querySelectorAll('[data-depth]').forEach(el => {
            const depth = parseInt(el.getAttribute('data-depth'), 10);
            const weight = parseFloat(el.getAttribute('data-weight')) || 0;
            const rect = el.getBoundingClientRect();
            const top = (rect.top - wrapperRect.top) / scale;
            const bottom = (rect.bottom - wrapperRect.top) / scale;
            if (!depthMap[depth]) depthMap[depth] = {sum: 0, minTop: top, maxBottom: bottom};
            depthMap[depth].sum += weight;
            depthMap[depth].minTop = Math.min(depthMap[depth].minTop, top);
            depthMap[depth].maxBottom = Math.max(depthMap[depth].maxBottom, bottom);
        });

        const levels = Object.entries(depthMap).map(([d, v]) => ({
            depth: parseInt(d, 10),
            sum: Math.round(v.sum),
            top: v.minTop,
            bottom: v.maxBottom,
        }));
        if (levels.length === 0) {
            setBars([]);
            return;
        }

        const maxSum = Math.max(...levels.map(l => l.sum), 1);
        const maxBarWidth = wrapper.offsetWidth * 0.3;

        setBars(levels.map(l => ({
            depth: l.depth,
            sum: l.sum,
            top: l.top - 8,
            height: l.bottom - l.top + 16,
            width: maxBarWidth * (l.sum / maxSum),
        })));
    }, [wrapperRef, version, visible]);

    if (!visible || bars.length === 0) return null;

    return (
        <div className="depth-histogram">
            {bars.map(b => (
                <div key={b.depth} className="depth-bar" style={{top: b.top, height: b.height, width: b.width}}>
                    <span className="depth-bar-label">{b.sum}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Pan & zoom ──────────────────────────────────────────────────────────────

function usePanZoom(viewportRef) {
    const [pan, setPan] = useState({x: 0, y: 0});
    const [zoom, setZoom] = useState(1);
    const isDragging = useRef(false);
    const dragStart = useRef({x: 0, y: 0});
    const panStart = useRef({x: 0, y: 0});

    const onMouseDown = useCallback(e => {
        // Only pan on left-click on the background, not on cards/buttons.
        if (e.button !== 0) return;
        if (e.target.closest('.org-card, .toggle-btn')) return;
        isDragging.current = true;
        dragStart.current = {x: e.clientX, y: e.clientY};
        panStart.current = {x: pan.x, y: pan.y};
        e.preventDefault();
    }, [pan]);

    const onMouseMove = useCallback(e => {
        if (!isDragging.current) return;
        setPan({
            x: panStart.current.x + (e.clientX - dragStart.current.x),
            y: panStart.current.y + (e.clientY - dragStart.current.y),
        });
    }, []);

    const onMouseUp = useCallback(() => { isDragging.current = false; }, []);

    // Anchor a zoom change at a screen point inside the viewport, so the content
    // under that point stays fixed (viewport center by default). The wrapper's
    // transformOrigin sits at (wrapperW/2, 0) in local coords, so to keep a
    // screen-space anchor (ax, ay) stationary:
    //   pan_new = pan + (1 - ratio) * (anchor - origin)
    const applyZoomAt = useCallback((compute, anchorX, anchorY) => {
        setZoom(prevZoom => {
            const nextZoom = Math.min(2, Math.max(0.2, compute(prevZoom)));
            if (nextZoom === prevZoom) return prevZoom;
            const ratio = nextZoom / prevZoom;
            const el = viewportRef.current;
            if (el) {
                const rect = el.getBoundingClientRect();
                const ax = anchorX != null ? anchorX - rect.left : rect.width / 2;
                const ay = anchorY != null ? anchorY - rect.top : rect.height / 2;
                const wrapper = el.querySelector('.transform-wrapper');
                const wrapperW = wrapper ? wrapper.offsetWidth : rect.width;
                setPan(prev => ({
                    x: prev.x + (1 - ratio) * (ax - (prev.x + wrapperW / 2)),
                    y: prev.y + (1 - ratio) * (ay - prev.y),
                }));
            }
            return nextZoom;
        });
    }, [viewportRef]);

    const onWheel = useCallback(e => {
        if (!viewportRef.current) return;
        e.preventDefault();
        applyZoomAt(z => z + (e.deltaY > 0 ? -0.05 : 0.05), e.clientX, e.clientY);
    }, [viewportRef, applyZoomAt]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, {passive: false});
        return () => el.removeEventListener('wheel', onWheel);
    }, [viewportRef, onWheel]);

    // Center the wrapper inside the viewport at zoom=1. With transform-origin
    // "top center", pan.x = (viewportW - wrapperW) / 2 puts the wrapper's own
    // center at the viewport's horizontal center, however wide the tree is.
    const centerView = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const wrapper = vp.querySelector('.transform-wrapper');
        const vw = vp.offsetWidth;
        const ww = wrapper ? wrapper.offsetWidth : vw;
        setPan({x: (vw - ww) / 2, y: 0});
        setZoom(1);
    }, [viewportRef]);

    return {
        pan, zoom, onMouseDown, onMouseMove, onMouseUp, centerView,
        zoomIn: useCallback(() => applyZoomAt(z => z + 0.15), [applyZoomAt]),
        zoomOut: useCallback(() => applyZoomAt(z => z - 0.15), [applyZoomAt]),
    };
}

// ─── Cards & recursive nodes ─────────────────────────────────────────────────

function TreeCard({node, depth, onOpen}) {
    return (
        <div
            className="org-card"
            data-node-id={node.id}
            data-depth={depth}
            data-weight={node.weight || 0}
            style={{
                borderColor: node.borderColor || '#e2e8f0',
                borderWidth: '2px',
                background: node.bgColor || '#ffffff',
            }}
            onClick={e => { e.stopPropagation(); onOpen(node); }}
            title={`Open ${node.title} in Airtable`}
        >
            <div className="org-card-name">{node.title}</div>
            {node.subtitle && <div className="org-card-meta">{node.subtitle}</div>}
            {node.meta && <div className="org-card-meta">{node.meta}</div>}
            {node.badge && <div className="org-card-badge">{node.badge}</div>}
            {node.children.length > 0 && (
                <div className="org-card-children-count">
                    {node.children.length} direct report{node.children.length !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    );
}

function TreeNode({node, defaultExpanded, depth, onToggle, onOpen}) {
    const [expanded, setExpanded] = useState(depth < defaultExpanded);
    const hasChildren = node.children.length > 0;

    const handleToggle = useCallback(() => {
        setExpanded(prev => !prev);
        setTimeout(() => onToggle(), 0);
    }, [onToggle]);

    return (
        <li>
            <TreeCard node={node} depth={depth} onOpen={onOpen} />
            {hasChildren && (
                <button
                    className="toggle-btn"
                    onClick={e => { e.stopPropagation(); handleToggle(); }}
                    title={expanded ? 'Collapse' : 'Expand'}
                >
                    {expanded ? '−' : `+${node.children.length}`}
                </button>
            )}
            {hasChildren && expanded && (
                <ul>
                    {node.children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            defaultExpanded={defaultExpanded}
                            depth={depth + 1}
                            onToggle={onToggle}
                            onOpen={onOpen}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

// ─── Public component ────────────────────────────────────────────────────────

export default function StackedTree({roots, onOpen, depth, showHistogram, boardRef}) {
    const [lineVersion, setLineVersion] = useState(0);
    const viewportRef = useRef(null);
    const wrapperRef = useRef(null);
    const redrawRafRef = useRef(0);

    const {pan, zoom, onMouseDown, onMouseMove, onMouseUp, centerView, zoomIn, zoomOut} =
        usePanZoom(viewportRef);

    const redrawLines = useCallback(() => {
        if (redrawRafRef.current) return;
        redrawRafRef.current = requestAnimationFrame(() => {
            redrawRafRef.current = 0;
            setLineVersion(v => v + 1);
        });
    }, []);

    useEffect(() => () => {
        if (redrawRafRef.current) cancelAnimationFrame(redrawRafRef.current);
    }, []);

    // Re-center + reset zoom whenever the depth selector changes (the tree
    // collapses/expands dramatically, so the old pan/zoom would leave the
    // smaller tree off-screen). Also fires on mount, centering wide trees that
    // would otherwise load left-aligned.
    useEffect(() => {
        centerView();
        redrawLines();
    }, [depth, roots, centerView, redrawLines]);

    return (
        <div
            className="viewport"
            ref={viewportRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            {/* Floating zoom controls — kept inside the viewport so they read the
                live pan/zoom state without lifting it into the parent toolbar. */}
            <div className="zoom-controls zoom-controls-float">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                <button className="zoom-btn zoom-btn-reset" onClick={centerView} title="Reset view">Reset</button>
            </div>
            <div
                className="transform-wrapper"
                ref={el => {
                    wrapperRef.current = el;
                    if (boardRef) boardRef.current = el;
                }}
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'top center',
                }}
            >
                {/* Background histogram bars per depth level */}
                <DepthHistogram wrapperRef={wrapperRef} version={lineVersion} visible={showHistogram} />

                {/* SVG connectors (inside the transform, so they scale for free) */}
                <ConnectorLines wrapperRef={wrapperRef} version={lineVersion} />

                <div className="tree" key={depth}>
                    <ul>
                        {roots.map(root => (
                            <TreeNode
                                key={root.id}
                                node={root}
                                defaultExpanded={depth}
                                depth={0}
                                onToggle={redrawLines}
                                onOpen={onOpen}
                            />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
