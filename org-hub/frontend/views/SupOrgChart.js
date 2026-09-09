// "Supervisory org" view — the stacked, top-down org chart over the
// Supervisory Organizations table. Border = SO Status, fill = Scoping, and the
// background histogram sums the headcount rollup at each level.
//
// Read-only: cards open the record; there is no drag-to-reparent.

import {useState, useRef, useMemo, useCallback} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import StackedTree from '../components/StackedTree';
import {ExportMenu, ToggleSwitch} from '../components/Controls';
import {exportPNG, exportImagePDF} from '../lib/exports';
import {SO_STATUS_COLORS, SCOPING_COLORS} from '../config';

// ─── Conflict banner ─────────────────────────────────────────────────────────

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
                            <span className="conflict-fix">Click to open</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Map a supervisory-org node onto the shape StackedTree renders.
function toTreeNode(node) {
    const scoping = SCOPING_COLORS[node.scoping];
    return {
        id: node.id,
        title: node.teamName,
        subtitle: node.managerName || null,
        meta: node.orgId || null,
        badge: node.headcount ? `${Math.round(node.headcount * 10) / 10} FTE` : null,
        weight: node.headcount,
        borderColor: SO_STATUS_COLORS[node.status] || '#e2e8f0',
        bgColor: scoping ? scoping.bg : '#ffffff',
        record: node.record,
        children: node.children.map(toTreeNode),
    };
}

export default function SupOrgChart({tree}) {
    const {roots, conflicts} = tree;
    const [depth, setDepth] = useState(2);
    const [showHistogram, setShowHistogram] = useState(true);
    const boardRef = useRef(null);

    const treeRoots = useMemo(() => roots.map(toTreeNode), [roots]);
    const onOpen = useCallback(node => { if (node.record) expandRecord(node.record); }, []);

    const exportItems = useMemo(() => [
        {label: 'PDF (single page)', run: () => boardRef.current && exportImagePDF(boardRef.current, 'supervisory-org')},
        {label: 'PNG image', run: () => boardRef.current && exportPNG(boardRef.current, 'supervisory-org')},
    ], []);

    if (treeRoots.length === 0) {
        return (
            <div className="empty-state">
                No supervisory organizations to display. Check that the table and
                the parent-link field resolved (see the Fields panel in the Data tab).
            </div>
        );
    }

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left header-legends">
                    <div className="legend-group">
                        <span className="legend-title">Border:</span>
                        {Object.entries(SO_STATUS_COLORS).map(([label, color]) => (
                            <span key={label} className="legend-item">
                                <span className="legend-dot-border" style={{borderColor: color}} />
                                <span>{label}</span>
                            </span>
                        ))}
                    </div>
                    <div className="legend-group">
                        <span className="legend-title">Fill:</span>
                        {Object.entries(SCOPING_COLORS).map(([label, c]) => (
                            <span key={label} className="legend-item">
                                <span className="legend-dot-fill" style={{background: c.dot}} />
                                <span>{label}</span>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="toolbar-right">
                    <span className="toolbar-label">Depth:</span>
                    {[1, 2, 3, 99].map(d => (
                        <button
                            key={d}
                            className={`toolbar-depth-btn ${depth === d ? 'active' : ''}`}
                            onClick={() => setDepth(d)}
                        >
                            {d === 99 ? 'All' : d}
                        </button>
                    ))}
                    <ToggleSwitch
                        checked={showHistogram}
                        onChange={setShowHistogram}
                        label="Headcount bars"
                        title={showHistogram ? 'Hide histogram' : 'Show histogram'}
                    />
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <ConflictBanner conflicts={conflicts} />

            <StackedTree
                roots={treeRoots}
                onOpen={onOpen}
                depth={depth}
                showHistogram={showHistogram}
                boardRef={boardRef}
            />
        </div>
    );
}
