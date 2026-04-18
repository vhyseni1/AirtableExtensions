import {
    initializeBlock,
    useBase,
    useRecords,
    expandRecord,
} from '@airtable/blocks/interface/ui';
import {useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo} from 'react';
import './style.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeGet(record, fieldName) {
    try {
        return record.getCellValueAsString(fieldName);
    } catch {
        return '';
    }
}

function parseName(fullName) {
    const match = fullName.match(/^(.+?)\s*\(([^)]*)\)\s*\(([^)]*)\)\s*$/);
    if (match) {
        return {team: match[1].trim(), manager: match[2].trim(), orgId: match[3].trim()};
    }
    const match2 = fullName.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
    if (match2) {
        return {team: match2[1].trim(), manager: match2[2].trim(), orgId: ''};
    }
    return {team: fullName, manager: '', orgId: ''};
}

const HEADCOUNT_FIELD = '[C] SupOrgAssignement % Rollup (from Employees & Positions / FUTURE)';

function safeGetNumber(record, fieldName) {
    try {
        const v = record.getCellValue(fieldName);
        if (v === null || v === undefined) return 0;
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        return isNaN(n) ? 0 : n;
    } catch {
        return 0;
    }
}

function buildTree(records, parentField) {
    const map = {};
    const parentOf = {}; // childId → parentId
    const conflicts = []; // {node, type, detail}

    records.forEach(r => {
        const parsed = parseName(r.name);
        map[r.id] = {
            id: r.id,
            name: r.name,
            record: r,
            teamName: parsed.team,
            managerName: parsed.manager,
            orgId: parsed.orgId,
            status: safeGet(r, 'SO Status'),
            scoping: safeGet(r, 'Scoping'),
            shortCode: safeGet(r, 'Short Code'),
            headcount: safeGetNumber(r, HEADCOUNT_FIELD),
            children: [],
        };
    });

    // Build parent→child edges and detect simple conflicts
    records.forEach(r => {
        let parentCell = null;
        if (parentField) {
            try {
                parentCell = r.getCellValue(parentField);
            } catch {
                /**/
            }
        }
        const parentId = parentCell && parentCell[0] && parentCell[0].id;

        if (parentId === r.id) {
            // Self-reference
            conflicts.push({
                node: map[r.id],
                type: 'Self-reference',
                detail: `"${map[r.id].teamName}" reports to itself`,
            });
            return;
        }

        if (parentId && map[parentId]) {
            parentOf[r.id] = parentId;
        }
    });

    // Detect cycles: walk up from each node — if we revisit, it's a cycle
    const inCycle = new Set();
    Object.keys(parentOf).forEach(startId => {
        const visited = new Set();
        let cur = startId;
        while (cur && parentOf[cur]) {
            if (visited.has(cur)) {
                // Found a cycle — mark all in the loop
                let loopId = cur;
                do {
                    inCycle.add(loopId);
                    loopId = parentOf[loopId];
                } while (loopId && loopId !== cur);
                inCycle.add(cur);
                break;
            }
            visited.add(cur);
            cur = parentOf[cur];
        }
    });

    // Report cycle conflicts
    const reportedCycles = new Set();
    inCycle.forEach(id => {
        if (!reportedCycles.has(id) && map[id]) {
            // Find the full loop for the detail message
            const loop = [id];
            let next = parentOf[id];
            while (next && next !== id) {
                loop.push(next);
                next = parentOf[next];
            }
            const names = loop.map(lid => map[lid] ? map[lid].teamName : lid);
            conflicts.push({
                node: map[id],
                type: 'Circular reference',
                detail: names.join(' → ') + ' → ' + (map[id] ? map[id].teamName : id),
            });
            loop.forEach(lid => reportedCycles.add(lid));
        }
    });

    // Build the tree, skipping cycle nodes
    Object.keys(parentOf).forEach(childId => {
        if (inCycle.has(childId)) return;
        const pid = parentOf[childId];
        if (map[pid] && !inCycle.has(pid)) {
            map[pid].children.push(map[childId]);
        }
    });

    // Roots: nodes with no parent (or parent not in map), excluding cycle nodes
    const roots = [];
    records.forEach(r => {
        if (inCycle.has(r.id)) return;
        if (!parentOf[r.id]) {
            roots.push(map[r.id]);
        }
    });

    return {roots, conflicts, nodeMap: map};
}

function collectSubtreeIds(node, set = new Set()) {
    set.add(node.id);
    node.children.forEach(c => collectSubtreeIds(c, set));
    return set;
}

// ─── SO Status → border color ───────────────────────────────────────────────

const SO_STATUS_COLORS = {
    'No Changes SO':     {border: '#8b8b8b', label: 'No Changes SO',     dot: '#8b8b8b'},
    'New SO - Draft':    {border: '#f59e0b', label: 'New SO - Draft',    dot: '#f59e0b'},
    'New SO':            {border: '#22c55e', label: 'New SO',            dot: '#22c55e'},
    'Updated SO':        {border: '#3b82f6', label: 'Updated SO',        dot: '#3b82f6'},
    'Decommissioned SO': {border: '#ef4444', label: 'Decommissioned SO', dot: '#ef4444'},
};

function statusBorderColor(status) {
    const entry = SO_STATUS_COLORS[status];
    return entry ? entry.border : '#e2e8f0';
}

// ─── Scoping → background color ─────────────────────────────────────────────

const SCOPING_COLORS = {
    'In Scope':     {bg: '#eff6ff', label: 'In Scope',     dot: '#3b82f6'},
    'Out of Scope': {bg: '#fef2f2', label: 'Out of Scope', dot: '#ef4444'},
};

function scopingBgColor(scoping) {
    const entry = SCOPING_COLORS[scoping];
    return entry ? entry.bg : '#ffffff';
}

// ─── SVG Connector Layer ────────────────────────────────────────────────────

function ConnectorLines({wrapperRef, version}) {
    const [paths, setPaths] = useState([]);

    useEffect(() => {
        if (!wrapperRef.current) return;

        const wrapper = wrapperRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        const scale = wrapperRect.width / wrapper.offsetWidth || 1;
        const newPaths = [];

        const parentCards = wrapper.querySelectorAll('[data-node-id]');

        parentCards.forEach(parentEl => {
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
                const d = `M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`;

                newPaths.push({key: `${parentId}-${childEl.getAttribute('data-node-id')}`, d});
            });
        });

        setPaths(newPaths);
    }, [wrapperRef, version]);

    return (
        <svg className="connector-svg">
            {paths.map(p => (
                <path key={p.key} d={p.d} />
            ))}
        </svg>
    );
}

// ─── Depth Histogram (background bars per level) ────────────────────────────

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

        // Group cards by depth and measure their vertical band
        const cards = wrapper.querySelectorAll('[data-depth]');
        const depthMap = {};

        cards.forEach(el => {
            const depth = parseInt(el.getAttribute('data-depth'), 10);
            const hc = parseFloat(el.getAttribute('data-headcount')) || 0;
            const rect = el.getBoundingClientRect();
            const top = (rect.top - wrapperRect.top) / scale;
            const bottom = (rect.bottom - wrapperRect.top) / scale;

            if (!depthMap[depth]) {
                depthMap[depth] = {sum: 0, minTop: top, maxBottom: bottom};
            }
            depthMap[depth].sum += hc;
            depthMap[depth].minTop = Math.min(depthMap[depth].minTop, top);
            depthMap[depth].maxBottom = Math.max(depthMap[depth].maxBottom, bottom);
        });

        const levels = Object.entries(depthMap).map(([d, v]) => ({
            depth: parseInt(d, 10),
            sum: Math.round(v.sum),
            top: v.minTop,
            bottom: v.maxBottom,
        }));

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
                <div
                    key={b.depth}
                    className="depth-bar"
                    style={{
                        top: b.top,
                        height: b.height,
                        width: b.width,
                    }}
                >
                    <span className="depth-bar-label">{b.sum}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Pan & Zoom hook ────────────────────────────────────────────────────────

function usePanZoom(viewportRef) {
    const [pan, setPan] = useState({x: 0, y: 0});
    const [zoom, setZoom] = useState(1);
    const isDragging = useRef(false);
    const dragStart = useRef({x: 0, y: 0});
    const panStart = useRef({x: 0, y: 0});

    const onMouseDown = useCallback(e => {
        // Only pan on left-click on the background, not on cards/buttons
        if (e.button !== 0) return;
        if (e.target.closest('.org-card, .toggle-btn')) return;
        isDragging.current = true;
        dragStart.current = {x: e.clientX, y: e.clientY};
        panStart.current = {x: pan.x, y: pan.y};
        e.preventDefault();
    }, [pan]);

    const onMouseMove = useCallback(e => {
        if (!isDragging.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPan({x: panStart.current.x + dx, y: panStart.current.y + dy});
    }, []);

    const onMouseUp = useCallback(() => {
        isDragging.current = false;
    }, []);

    // Anchor a zoom change at a screen point inside the viewport, so the
    // content under that point stays fixed (viewport center by default).
    // Transform is: screen = pan + origin + scale * (p - origin),
    // where origin = (wrapperW/2, 0) because transformOrigin is "top center".
    // To keep a screen-space anchor (ax, ay) stationary across a zoom change:
    //   pan_new = pan + (1 - ratio) * (ax - origin - pan)
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
                // wrapper's transformOrigin sits at (wrapperW/2, 0) in local coords;
                // the wrapper's left edge is at viewport x = pan.x, so origin in
                // viewport coords is (pan.x + wrapperW/2, pan.y + 0).
                const wrapper = el.querySelector('.transform-wrapper');
                const wrapperW = wrapper ? wrapper.offsetWidth : rect.width;
                setPan(prev => {
                    const ox = prev.x + wrapperW / 2;
                    const oy = prev.y;
                    return {
                        x: prev.x + (1 - ratio) * (ax - ox),
                        y: prev.y + (1 - ratio) * (ay - oy),
                    };
                });
            }
            return nextZoom;
        });
    }, [viewportRef]);

    const onWheel = useCallback(e => {
        if (!viewportRef.current) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        applyZoomAt(z => z + delta, e.clientX, e.clientY);
    }, [viewportRef, applyZoomAt]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, {passive: false});
        return () => el.removeEventListener('wheel', onWheel);
    }, [viewportRef, onWheel]);

    // Center the wrapper inside the viewport at zoom=1. With
    // transform-origin "top center", pan.x = (viewportW - wrapperW) / 2
    // puts the wrapper's own center at the viewport's horizontal center,
    // regardless of how wide the tree currently is.
    const centerView = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const wrapper = vp.querySelector('.transform-wrapper');
        const vw = vp.offsetWidth;
        const ww = wrapper ? wrapper.offsetWidth : vw;
        setPan({x: (vw - ww) / 2, y: 0});
        setZoom(1);
    }, [viewportRef]);

    const zoomIn = useCallback(() => applyZoomAt(z => z + 0.15), [applyZoomAt]);
    const zoomOut = useCallback(() => applyZoomAt(z => z - 0.15), [applyZoomAt]);

    return {pan, zoom, onMouseDown, onMouseMove, onMouseUp, resetView: centerView, zoomIn, zoomOut, centerView};
}

// ─── Org Card ───────────────────────────────────────────────────────────────

function OrgCard({node, depth, dragState, onDragStart, onDragEnd, onDrop}) {
    const borderColor = statusBorderColor(node.status);
    const bgColor = scopingBgColor(node.scoping);

    const isDragging = dragState.draggingId === node.id;
    const dragActive = dragState.draggingId !== null;
    const isForbidden = dragActive && dragState.forbiddenIds.has(node.id);
    const isValidTarget = dragActive && !isForbidden;

    const classNames = ['org-card'];
    if (isDragging) classNames.push('dragging');
    if (isValidTarget) classNames.push('drop-target');
    if (isForbidden) classNames.push('drop-forbidden');

    return (
        <div
            className={classNames.join(' ')}
            data-node-id={node.id}
            data-depth={depth}
            data-headcount={node.headcount}
            draggable="true"
            style={{
                borderColor: borderColor,
                borderWidth: '2px',
                background: bgColor,
            }}
            onDragStart={e => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', node.id);
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(node.id);
            }}
            onDragEnd={e => {
                e.stopPropagation();
                onDragEnd();
            }}
            onDragOver={e => {
                if (!dragActive || isForbidden) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const childId = e.dataTransfer.getData('text/plain');
                if (childId && childId !== node.id && !isForbidden) {
                    onDrop(node.id, childId);
                }
                onDragEnd();
            }}
            onClick={e => {
                if (dragActive) return;
                e.stopPropagation();
                expandRecord(node.record);
            }}
        >
            <div className="org-card-name">{node.teamName}</div>
            {node.managerName && (
                <div className="org-card-meta">{node.managerName}</div>
            )}
            {node.orgId && (
                <div className="org-card-meta">{node.orgId}</div>
            )}
            {node.children.length > 0 && (
                <div className="org-card-children-count">
                    {node.children.length} direct report{node.children.length !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    );
}

// ─── Org Node (recursive, collapsible) ──────────────────────────────────────

function OrgNode({node, defaultExpanded, depth, onToggle, dragState, onDragStart, onDragEnd, onDrop, autoExpandIds, onAutoExpanded}) {
    const [expanded, setExpanded] = useState(depth < defaultExpanded);
    const hasChildren = node.children.length > 0;

    useEffect(() => {
        if (autoExpandIds && autoExpandIds.has(node.id)) {
            setExpanded(true);
            onAutoExpanded(node.id);
            setTimeout(() => onToggle(), 0);
        }
    }, [autoExpandIds, node.id, onAutoExpanded, onToggle]);

    const handleToggle = useCallback(() => {
        setExpanded(prev => !prev);
        setTimeout(() => onToggle(), 0);
    }, [onToggle]);

    return (
        <li>
            <OrgCard
                node={node}
                depth={depth}
                dragState={dragState}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
            />
            {hasChildren && (
                <button
                    className="toggle-btn"
                    onClick={e => {
                        e.stopPropagation();
                        handleToggle();
                    }}
                    title={expanded ? 'Collapse' : 'Expand'}
                >
                    {expanded ? '−' : `+${node.children.length}`}
                </button>
            )}
            {hasChildren && expanded && (
                <ul>
                    {node.children.map(child => (
                        <OrgNode
                            key={child.id}
                            node={child}
                            defaultExpanded={defaultExpanded}
                            depth={depth + 1}
                            onToggle={onToggle}
                            dragState={dragState}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onDrop={onDrop}
                            autoExpandIds={autoExpandIds}
                            onAutoExpanded={onAutoExpanded}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

// ─── Conflict Banner ────────────────────────────────────────────────────────

function ConflictBanner({conflicts}) {
    const [expanded, setExpanded] = useState(false);

    if (conflicts.length === 0) return null;

    return (
        <div className="conflict-banner">
            <div className="conflict-header" onClick={() => setExpanded(prev => !prev)}>
                <span className="conflict-icon">!</span>
                <span className="conflict-summary">
                    {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
                </span>
                <span className="conflict-toggle">{expanded ? 'Hide' : 'Show'}</span>
            </div>
            {expanded && (
                <div className="conflict-list">
                    {conflicts.map((c, i) => (
                        <div
                            key={i}
                            className="conflict-item"
                            onClick={() => c.node && c.node.record && expandRecord(c.node.record)}
                        >
                            <span className="conflict-type">{c.type}</span>
                            <span className="conflict-detail">{c.detail}</span>
                            <span className="conflict-fix">Click to edit</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── About Modal ────────────────────────────────────────────────────────────

function AboutModal({onClose}) {
    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="about-overlay" onClick={onClose}>
            <div className="about-modal" onClick={e => e.stopPropagation()}>
                <button className="about-close" onClick={onClose} title="Close">×</button>
                <h2 className="about-title">About this Org Chart</h2>
                <p className="about-body">
                    This org chart was built by PwC as a token of appreciation for
                    the trust and partnership Roche has placed in us — and for the
                    results we've delivered together.
                </p>
                <p className="about-body">
                    We hope this tool continues to serve your organisation well.
                </p>
                <p className="about-contact">
                    Developed by the PwC team. Primary contact:{' '}
                    <strong>Valon Hyseni (PwC P&amp;O)</strong>. For questions,
                    please reach out.
                </p>
                <div className="about-signoff">— PwC</div>
            </div>
        </div>
    );
}

// ─── Main Chart ─────────────────────────────────────────────────────────────

function OrgChartWithData({table}) {
    const records = useRecords(table);
    const [defaultExpanded, setDefaultExpanded] = useState(2);
    const [lineVersion, setLineVersion] = useState(0);
    const [draggingId, setDraggingId] = useState(null);
    const [forbiddenIds, setForbiddenIds] = useState(() => new Set());
    const [dropError, setDropError] = useState(null);
    const [autoExpandIds, setAutoExpandIds] = useState(() => new Set());
    const [showHistogram, setShowHistogram] = useState(true);
    const [showAbout, setShowAbout] = useState(false);
    const viewportRef = useRef(null);
    const wrapperRef = useRef(null);

    const {pan, zoom, onMouseDown, onMouseMove, onMouseUp, resetView, zoomIn, zoomOut, centerView} =
        usePanZoom(viewportRef);

    // Re-center + reset zoom whenever the depth selector changes (the tree
    // collapses/expands dramatically, so the old pan/zoom would leave the
    // smaller tree off-screen). Also fires on initial mount, which centers
    // wide trees that would otherwise load left-aligned.
    useLayoutEffect(() => {
        centerView();
    }, [defaultExpanded, centerView]);

    const parentField = table.fields.find(f => f.type === 'multipleRecordLinks');
    const parentFieldId = parentField ? parentField.id : null;
    const {roots, conflicts, nodeMap} = useMemo(
        () => buildTree(records, parentField),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, parentFieldId],
    );

    const handleDragStart = useCallback(nodeId => {
        const node = nodeMap[nodeId];
        if (!node) return;
        setDraggingId(nodeId);
        setForbiddenIds(collectSubtreeIds(node));
        setDropError(null);
    }, [nodeMap]);

    const handleDragEnd = useCallback(() => {
        setDraggingId(null);
        setForbiddenIds(new Set());
    }, []);

    const handleDrop = useCallback(async (newParentId, childId) => {
        if (!parentField) {
            setDropError('No parent link field found on this table.');
            return;
        }
        const childNode = nodeMap[childId];
        if (!childNode || !childNode.record) return;
        const updateFields = {[parentField.id]: [{id: newParentId}]};
        try {
            await table.updateRecordAsync(childNode.record, updateFields);
            setAutoExpandIds(prev => {
                const next = new Set(prev);
                next.add(newParentId);
                return next;
            });
        } catch (err) {
            const check = table.checkPermissionsForUpdateRecord(childNode.record, updateFields);
            const reason = check && !check.hasPermission && check.reasonDisplayString
                ? check.reasonDisplayString
                : (err && err.message ? err.message : String(err));
            setDropError(`Update failed: ${reason}`);
        }
    }, [parentField, nodeMap, table]);

    const dragState = {draggingId, forbiddenIds};

    const handleAutoExpanded = useCallback(id => {
        setAutoExpandIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const redrawRafRef = useRef(0);
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

    useEffect(() => {
        redrawLines();
    }, [records, defaultExpanded, redrawLines]);

    // Note: no redraw on pan/zoom — SVG + histogram live inside transform-wrapper
    // and scale with it for free, so recomputing paths would be pure waste.

    const zoomPct = Math.round(zoom * 100);

    return (
        <div className="org-chart-root">
            {/* Header: legend left, depth right */}
            <div className="header-bar">
                <div className="header-legends">
                    <div className="legend-group">
                        <span className="legend-title">Border:</span>
                        {Object.values(SO_STATUS_COLORS).map(c => (
                            <span key={c.label} className="legend-item">
                                <span className="legend-dot-border" style={{borderColor: c.dot}} />
                                <span>{c.label}</span>
                            </span>
                        ))}
                    </div>
                    <div className="legend-group">
                        <span className="legend-title">Fill:</span>
                        {Object.values(SCOPING_COLORS).map(c => (
                            <span key={c.label} className="legend-item">
                                <span className="legend-dot-fill" style={{background: c.dot}} />
                                <span>{c.label}</span>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="header-depth">
                    <span className="toolbar-label">Depth:</span>
                    {[1, 2, 3, 99].map(d => (
                        <button
                            key={d}
                            className={`toolbar-depth-btn ${defaultExpanded === d ? 'active' : ''}`}
                            onClick={() => setDefaultExpanded(d)}
                        >
                            {d === 99 ? 'All' : d}
                        </button>
                    ))}
                    <label className="histogram-toggle-wrap" title={showHistogram ? 'Hide histogram' : 'Show histogram'}>
                        <span className="toolbar-label histogram-toggle-label">Histogram</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={showHistogram}
                            className={`toggle-switch ${showHistogram ? 'on' : 'off'}`}
                            onClick={() => setShowHistogram(v => !v)}
                        >
                            <span className="toggle-switch-knob" />
                        </button>
                    </label>
                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                        <span className="zoom-level">{zoomPct}%</span>
                        <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                        <button className="zoom-btn zoom-btn-reset" onClick={resetView} title="Reset view">Reset</button>
                    </div>
                    <button
                        className="about-btn"
                        onClick={() => setShowAbout(true)}
                        title="About this org chart"
                    >
                        About
                    </button>
                </div>
            </div>

            {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

            {/* Conflict banner */}
            <ConflictBanner conflicts={conflicts} />

            {/* Drop error toast */}
            {dropError && (
                <div className="drop-error" onClick={() => setDropError(null)}>
                    <span className="drop-error-icon">!</span>
                    <span className="drop-error-msg">{dropError}</span>
                    <span className="drop-error-close">×</span>
                </div>
            )}

            {/* Pannable / zoomable viewport */}
            <div
                className="viewport"
                ref={viewportRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                <div
                    className="transform-wrapper"
                    ref={wrapperRef}
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'top center',
                    }}
                >
                    {/* Background histogram bars per depth level */}
                    <DepthHistogram wrapperRef={wrapperRef} version={lineVersion} visible={showHistogram} />

                    {/* SVG connector lines (inside transform so they scale with tree) */}
                    <ConnectorLines wrapperRef={wrapperRef} version={lineVersion} />

                    {/* Tree */}
                    <div className="tree" key={defaultExpanded}>
                        <ul>
                            {roots.map(root => (
                                <OrgNode
                                    key={root.id}
                                    node={root}
                                    defaultExpanded={defaultExpanded}
                                    depth={0}
                                    onToggle={redrawLines}
                                    dragState={dragState}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDrop={handleDrop}
                                    autoExpandIds={autoExpandIds}
                                    onAutoExpanded={handleAutoExpanded}
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── App ────────────────────────────────────────────────────────────────────

function OrgChartApp() {
    const base = useBase();
    const table = base.tables[0];

    if (!table) {
        return (
            <div style={{padding: 16, color: '#dc2626'}}>
                No table found. Please configure a table in the Data panel.
            </div>
        );
    }

    return <OrgChartWithData table={table} />;
}

initializeBlock({interface: () => <OrgChartApp />});
