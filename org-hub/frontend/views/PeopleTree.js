// "People tree" view — the same stacked renderer, driven by the reporting
// hierarchy from Employees & Positions rather than by supervisory orgs. Useful
// when you want the whole management chain on one canvas instead of the
// one-manager-at-a-time position view.
//
// Read-only.

import {useState, useRef, useMemo, useCallback} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import StackedTree from '../components/StackedTree';
import {ExportMenu, ToggleSwitch, CheckboxFilter} from '../components/Controls';
import {exportPNG, exportImagePDF} from '../lib/exports';
import {colorFromString} from '../lib/fields';

// Recursively turn a people node into the shape StackedTree renders. `seen`
// guards against a data cycle turning this into infinite recursion.
function toTreeNode(node, nodeMap, seen) {
    if (seen.has(node.id)) return null;
    seen.add(node.id);
    return {
        id: node.id,
        title: node.displayName,
        subtitle: node.vacant ? 'Vacant' : (node.jobTitle || null),
        meta: node.department || null,
        badge: node.decision || null,
        weight: node.fte || 0,
        borderColor: node.vacant ? '#cbd5e1' : colorFromString(node.displayName),
        bgColor: node.vacant ? '#f8fafc' : '#ffffff',
        record: node.record,
        children: node.childIds
            .map(id => nodeMap[id])
            .filter(Boolean)
            .map(child => toTreeNode(child, nodeMap, seen))
            .filter(Boolean),
    };
}

export default function PeopleTree({org}) {
    const {nodeMap, rootIds, totals} = org;
    const [depth, setDepth] = useState(2);
    const [showHistogram, setShowHistogram] = useState(false);
    const [rootFilter, setRootFilter] = useState(() => new Set());
    const boardRef = useRef(null);

    // Any manager can act as the tree root, so a large org can be sliced to one
    // branch instead of rendering thousands of cards at once.
    const rootOptions = useMemo(() => Object.values(nodeMap)
        .filter(n => n.childIds.length > 0)
        .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
        .map(n => ({
            value: n.id,
            label: n.vacant ? `${n.displayName} (Vacant)` : n.displayName,
            sub: `${n.childIds.length} direct · ${totals[n.id] || 0} total`,
            vacant: n.vacant,
        })), [nodeMap, totals]);

    const treeRoots = useMemo(() => {
        const ids = rootFilter.size > 0
            ? [...rootFilter].filter(id => nodeMap[id])
            : rootIds;
        const seen = new Set();
        return ids
            .map(id => toTreeNode(nodeMap[id], nodeMap, seen))
            .filter(Boolean);
    }, [rootFilter, rootIds, nodeMap]);

    const onOpen = useCallback(node => { if (node.record) expandRecord(node.record); }, []);

    const exportItems = useMemo(() => [
        {label: 'PDF (single page)', run: () => boardRef.current && exportImagePDF(boardRef.current, 'people-tree')},
        {label: 'PNG image', run: () => boardRef.current && exportPNG(boardRef.current, 'people-tree')},
    ], []);

    if (treeRoots.length === 0) {
        return <div className="empty-state">No people to display.</div>;
    }

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <CheckboxFilter
                        label="Root"
                        options={rootOptions}
                        selected={rootFilter}
                        onChange={setRootFilter}
                    />
                    {rootFilter.size > 0 && (
                        <button
                            className="tb-btn tb-btn-clear"
                            onClick={() => setRootFilter(new Set())}
                            title="Back to the top of the organization"
                        >
                            Clear · {rootFilter.size} root{rootFilter.size !== 1 ? 's' : ''}
                        </button>
                    )}
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
                        label="FTE bars"
                        title={showHistogram ? 'Hide histogram' : 'Show histogram'}
                    />
                    <ExportMenu items={exportItems} />
                </div>
            </div>

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
