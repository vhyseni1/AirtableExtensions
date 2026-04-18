import {
    initializeBlock,
    useBase,
    useRecords,
    expandRecord,
} from '@airtable/blocks/interface/ui';
import {useState, useRef, useEffect, useCallback} from 'react';
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

    const roots = [];
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
        if (parentId && map[parentId]) {
            map[parentId].children.push(map[r.id]);
        } else {
            roots.push(map[r.id]);
        }
    });

    return roots;
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

function DepthHistogram({wrapperRef, version}) {
    const [bars, setBars] = useState([]);

    useEffect(() => {
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
        // Max bar width as a percentage of the wrapper width
        const maxBarWidth = wrapper.offsetWidth * 0.35;

        setBars(levels.map(l => ({
            depth: l.depth,
            sum: l.sum,
            top: l.top - 8,
            height: l.bottom - l.top + 16,
            width: maxBarWidth * (l.sum / maxSum),
        })));
    }, [wrapperRef, version]);

    if (bars.length === 0) return null;

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

    const onWheel = useCallback(e => {
        if (!viewportRef.current) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(z => Math.min(2, Math.max(0.2, z + delta)));
    }, [viewportRef]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, {passive: false});
        return () => el.removeEventListener('wheel', onWheel);
    }, [viewportRef, onWheel]);

    const resetView = useCallback(() => {
        setPan({x: 0, y: 0});
        setZoom(1);
    }, []);

    const zoomIn = useCallback(() => setZoom(z => Math.min(2, z + 0.15)), []);
    const zoomOut = useCallback(() => setZoom(z => Math.max(0.2, z - 0.15)), []);

    return {pan, zoom, onMouseDown, onMouseMove, onMouseUp, resetView, zoomIn, zoomOut};
}

// ─── Org Card ───────────────────────────────────────────────────────────────

function OrgCard({node, depth}) {
    const borderColor = statusBorderColor(node.status);
    const bgColor = scopingBgColor(node.scoping);

    return (
        <div
            className="org-card"
            data-node-id={node.id}
            data-depth={depth}
            data-headcount={node.headcount}
            style={{
                borderColor: borderColor,
                borderWidth: '2px',
                background: bgColor,
            }}
            onClick={e => {
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

function OrgNode({node, defaultExpanded, depth, onToggle}) {
    const [expanded, setExpanded] = useState(depth < defaultExpanded);
    const hasChildren = node.children.length > 0;

    const handleToggle = useCallback(() => {
        setExpanded(prev => !prev);
        setTimeout(() => onToggle(), 0);
    }, [onToggle]);

    return (
        <li>
            <OrgCard node={node} depth={depth} />
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
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

// ─── Main Chart ─────────────────────────────────────────────────────────────

function OrgChartWithData({table}) {
    const records = useRecords(table);
    const [defaultExpanded, setDefaultExpanded] = useState(2);
    const [lineVersion, setLineVersion] = useState(0);
    const viewportRef = useRef(null);
    const wrapperRef = useRef(null);

    const {pan, zoom, onMouseDown, onMouseMove, onMouseUp, resetView, zoomIn, zoomOut} =
        usePanZoom(viewportRef);

    const parentField = table.fields.find(f => f.type === 'multipleRecordLinks');
    const roots = buildTree(records, parentField);

    const redrawLines = useCallback(() => {
        setLineVersion(v => v + 1);
    }, []);

    useEffect(() => {
        const timer = setTimeout(redrawLines, 100);
        return () => clearTimeout(timer);
    }, [records, defaultExpanded, redrawLines]);

    // Redraw lines when pan/zoom changes
    useEffect(() => {
        redrawLines();
    }, [pan, zoom, redrawLines]);

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
                </div>
            </div>

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
                    <DepthHistogram wrapperRef={wrapperRef} version={lineVersion} />

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
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Zoom controls */}
            <div className="zoom-controls">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                <span className="zoom-level">{zoomPct}%</span>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                <button className="zoom-btn zoom-btn-reset" onClick={resetView} title="Reset view">Reset</button>
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
