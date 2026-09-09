// "Position view" — the Workday-style chart: one person in focus with their
// direct reports below, drilled through via the cards and the breadcrumb.
//
// Read-only: cards open the underlying Airtable record, nothing writes back.

import {useState, useRef, useMemo, useCallback} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import {CheckboxFilter, SearchBox, ExportMenu} from '../components/Controls';
import {
    DecisionContext, PersonCard, ManagerSection, OrgSection,
} from '../components/PersonCard';
import {exportPNG, exportVectorPDF} from '../lib/exports';
import {ancestorChain} from '../lib/people';

export default function PositionChart({org, cfg, decisionFieldPresent}) {
    const {nodeMap, rootIds, totals, statusColors} = org;
    const [focusIdState, setFocusIdState] = useState(null);
    const [managerFilter, setManagerFilter] = useState(() => new Set());
    const [orgFilter, setOrgFilter] = useState(() => new Set());
    const [showAvatars, setShowAvatars] = useState(true);
    const [showDecision, setShowDecision] = useState(true);
    const boardRef = useRef(null);

    const hasStatus = Object.keys(statusColors).length > 0;

    // Managers = people with at least one direct report.
    const managerOptions = useMemo(() => {
        return Object.values(nodeMap)
            .filter(n => n.childIds.length > 0)
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(n => {
                const count = `${n.childIds.length} report${n.childIds.length !== 1 ? 's' : ''}`;
                // Vacant seats read "Role title (Vacant)"; the title is already the label.
                const label = n.vacant ? `${n.displayName} (Vacant)` : n.displayName;
                const sub = n.vacant ? count : count + (n.jobTitle ? ` · ${n.jobTitle}` : '');
                return {value: n.id, label, sub, vacant: n.vacant};
            });
    }, [nodeMap]);

    // Organizations = distinct values of the org field, with a position count.
    const orgOptions = useMemo(() => {
        const counts = new Map();
        Object.values(nodeMap).forEach(n => {
            const value = (n.org || '').trim();
            if (value) counts.set(value, (counts.get(value) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([value, c]) => ({value, label: value, sub: `${c} position${c !== 1 ? 's' : ''}`}));
    }, [nodeMap]);

    // The Manager and Organization filters are mutually exclusive — selecting in
    // one clears the other so the board shows a single, unambiguous view.
    const selectManagers = useCallback(next => {
        setManagerFilter(next);
        if (next.size) setOrgFilter(new Set());
    }, []);
    const selectOrgs = useCallback(next => {
        setOrgFilter(next);
        if (next.size) setManagerFilter(new Set());
    }, []);

    const defaultFocusId = useMemo(() => {
        if (rootIds.length === 0) return null;
        return [...rootIds].sort((a, b) => (totals[b] || 0) - (totals[a] || 0))[0];
    }, [rootIds, totals]);

    const focusId = (focusIdState && nodeMap[focusIdState]) ? focusIdState : defaultFocusId;
    const focus = focusId ? nodeMap[focusId] : null;

    const chain = useMemo(
        () => (focusId ? ancestorChain(nodeMap, focusId) : []),
        [nodeMap, focusId],
    );

    const drill = useCallback(id => setFocusIdState(id), []);
    // Clicking a card while a filter is active jumps back to normal navigation.
    const drillFromFilter = useCallback(id => {
        setManagerFilter(new Set());
        setOrgFilter(new Set());
        setFocusIdState(id);
    }, []);
    const openRecord = useCallback(node => { if (node && node.record) expandRecord(node.record); }, []);

    const managerActive = managerFilter.size > 0;
    const orgActive = orgFilter.size > 0;
    const filterActive = managerActive || orgActive;
    const selectedManagers = useMemo(
        () => [...managerFilter].filter(id => nodeMap[id])
            .sort((a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName)),
        [managerFilter, nodeMap],
    );
    // Selected orgs → the positions in each, sorted managers-first then by name.
    const selectedOrgs = useMemo(() => {
        if (!orgActive) return [];
        return [...orgFilter].sort((a, b) => a.localeCompare(b)).map(value => ({
            org: value,
            members: Object.values(nodeMap)
                .filter(n => (n.org || '').trim() === value)
                .sort((a, b) =>
                    (b.childIds.length > 0) - (a.childIds.length > 0) ||
                    a.displayName.localeCompare(b.displayName)),
        }));
    }, [orgActive, orgFilter, nodeMap]);

    // Build the sections the vector PDF draws: a manager section (manager card +
    // direct reports) per manager, OR an org section (org banner + members) per
    // organization, OR the focused manager when no filter is active.
    const buildExportData = useCallback(() => {
        const toCard = n => ({
            name: n.displayName,
            // For vacant seats the title is already the headline, so don't repeat it.
            title: n.vacant ? '' : n.jobTitle,
            dept: n.department,
            directs: n.childIds.length,
            total: totals[n.id] || 0,
            vacant: n.vacant,
        });
        if (orgActive) {
            return selectedOrgs.map(({org: value, members}) => ({
                kind: 'org',
                header: {name: value, count: members.length},
                reports: members.map(toCard),
            }));
        }
        const ids = managerActive ? selectedManagers : (focusId ? [focusId] : []);
        return ids.map(id => ({
            kind: 'manager',
            header: toCard(nodeMap[id]),
            reports: nodeMap[id].childIds.filter(c => nodeMap[c]).map(c => toCard(nodeMap[c])),
        }));
    }, [orgActive, selectedOrgs, managerActive, selectedManagers, focusId, nodeMap, totals]);

    const exportItems = useMemo(() => [
        {label: 'PDF (crisp vector)', run: () => exportVectorPDF(buildExportData(), 'position-view')},
        {label: 'PNG image', run: () => boardRef.current && exportPNG(boardRef.current, 'position-view')},
    ], [buildExportData]);

    if (!focus) {
        return (
            <div className="empty-state">
                No people to display. Check that the name and manager fields
                resolved (see the Fields panel in the Data tab).
            </div>
        );
    }

    const children = focus.childIds.map(id => nodeMap[id]).filter(Boolean);

    return (
        <DecisionContext.Provider value={showDecision}>
            <div className="view-root">
                {/* Toolbar */}
                <div className="toolbar">
                    <div className="toolbar-left">
                        <CheckboxFilter
                            label="Manager"
                            options={managerOptions}
                            selected={managerFilter}
                            onChange={selectManagers}
                        />
                        {cfg.orgFilterField && (
                            <CheckboxFilter
                                label="Organization"
                                options={orgOptions}
                                selected={orgFilter}
                                onChange={selectOrgs}
                            />
                        )}
                        {filterActive && (
                            <button
                                className="tb-btn tb-btn-clear"
                                onClick={() => { setManagerFilter(new Set()); setOrgFilter(new Set()); }}
                                title="Clear filters"
                            >
                                {orgActive
                                    ? `Clear · ${selectedOrgs.length} org${selectedOrgs.length !== 1 ? 's' : ''}`
                                    : `Clear · ${selectedManagers.length} manager${selectedManagers.length !== 1 ? 's' : ''}`}
                            </button>
                        )}
                    </div>
                    <div className="toolbar-right">
                        {hasStatus && (
                            <div className="legend">
                                {Object.entries(statusColors).map(([label, color]) => (
                                    <span key={label} className="legend-item">
                                        <span className="legend-dot" style={{background: color}} />
                                        {label}
                                    </span>
                                ))}
                            </div>
                        )}
                        <SearchBox nodeMap={nodeMap} onJump={drillFromFilter} />
                        <button
                            className={`tb-btn ${showAvatars ? 'tb-btn-active' : ''}`}
                            onClick={() => setShowAvatars(v => !v)}
                            title={showAvatars ? 'Hide avatar circles' : 'Show avatar circles'}
                        >
                            Avatars
                        </button>
                        {decisionFieldPresent && (
                            <button
                                className={`tb-btn ${showDecision ? 'tb-btn-active' : ''}`}
                                onClick={() => setShowDecision(v => !v)}
                                title={showDecision ? 'Hide employee decision' : 'Show employee decision'}
                            >
                                Decision
                            </button>
                        )}
                        <ExportMenu items={exportItems} />
                    </div>
                </div>

                {/* Breadcrumb (focus mode only) */}
                {!filterActive && (
                    <div className="breadcrumb">
                        {chain.length === 0 && <span className="crumb crumb-current">Top of organization</span>}
                        {chain.map(id => (
                            <span key={id} className="crumb-wrap">
                                <button className="crumb" onClick={() => drill(id)}>{nodeMap[id].displayName}</button>
                                <span className="crumb-sep">›</span>
                            </span>
                        ))}
                        {chain.length > 0 && <span className="crumb crumb-current">{focus.displayName}</span>}
                    </div>
                )}

                {/* Board */}
                <div className="board-scroll">
                    {orgActive ? (
                        <div className="board board-filtered" ref={boardRef}>
                            {selectedOrgs.length === 0 && (
                                <div className="no-reports">No matching organizations.</div>
                            )}
                            {selectedOrgs.map(({org: value, members}) => (
                                <OrgSection
                                    key={value}
                                    org={value}
                                    members={members}
                                    totals={totals}
                                    statusColors={statusColors}
                                    showAvatar={showAvatars}
                                    onDrill={drillFromFilter}
                                    onOpen={openRecord}
                                />
                            ))}
                        </div>
                    ) : managerActive ? (
                        <div className="board board-filtered" ref={boardRef}>
                            {selectedManagers.length === 0 && (
                                <div className="no-reports">No matching managers.</div>
                            )}
                            {selectedManagers.map(id => (
                                <ManagerSection
                                    key={id}
                                    node={nodeMap[id]}
                                    nodeMap={nodeMap}
                                    totals={totals}
                                    statusColors={statusColors}
                                    showAvatar={showAvatars}
                                    onDrill={drillFromFilter}
                                    onOpen={openRecord}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="board" ref={boardRef}>
                            {focus.parentId && nodeMap[focus.parentId] && (
                                <button
                                    className="up-btn"
                                    onClick={() => drill(focus.parentId)}
                                    title={`Up to ${nodeMap[focus.parentId].displayName}`}
                                >
                                    ↑ {nodeMap[focus.parentId].displayName}
                                </button>
                            )}

                            <div className="focus-row">
                                <PersonCard
                                    node={focus}
                                    variant="focus"
                                    directs={focus.childIds.length}
                                    total={totals[focus.id] || 0}
                                    statusColor={focus.status ? statusColors[focus.status] : null}
                                    showAvatar={showAvatars}
                                    onDrill={drill}
                                    onOpen={openRecord}
                                />
                            </div>

                            {children.length > 0 ? (
                                <>
                                    <div className="connector-vertical" />
                                    <div className="reports-label">
                                        {children.length} direct report{children.length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="reports-grid">
                                        {children.map(child => (
                                            <PersonCard
                                                key={child.id}
                                                node={child}
                                                variant="report"
                                                directs={child.childIds.length}
                                                total={totals[child.id] || 0}
                                                statusColor={child.status ? statusColors[child.status] : null}
                                                showAvatar={showAvatars}
                                                onDrill={drill}
                                                onOpen={openRecord}
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="no-reports">No direct reports</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </DecisionContext.Provider>
    );
}
