// The Workday-style person card and the two section layouts built from it.

import {createContext, useContext} from 'react';
import {colorFromString, initials} from '../lib/fields';

// Whether the per-employee "decision" chip is shown. Provided once at the board
// root rather than drilled through every section/tree level (parallel to the
// avatar toggle, which is prop-drilled). Always false during export.
export const DecisionContext = createContext(false);

export function PersonCard({node, variant, directs, total, statusColor, showAvatar, onDrill, onOpen}) {
    const showDecision = useContext(DecisionContext);
    const drillable = variant === 'report' && directs > 0;
    const cls = ['person-card', `person-card-${variant}`, 'clickable'];
    if (!showAvatar) cls.push('no-avatar');
    if (node.vacant) cls.push('vacant');
    if (statusColor) cls.push('has-accent');
    // Reports drill into their own subtree; the focus card opens the record.
    const onClick = variant === 'report' ? () => onDrill(node.id) : () => onOpen(node);
    const title = variant === 'report'
        ? `Drill into ${node.displayName}`
        : `Open ${node.displayName} in Airtable`;
    return (
        <div
            className={cls.join(' ')}
            style={statusColor ? {'--card-accent': statusColor} : undefined}
            onClick={onClick}
            title={title}
        >
            {showAvatar && (
                <div
                    className="person-avatar"
                    style={{background: node.vacant ? '#cbd5e1' : colorFromString(node.displayName)}}
                >
                    {node.vacant ? '—' : initials(node.displayName)}
                </div>
            )}
            <div className="person-info">
                <div className="person-name">{node.displayName}</div>
                {node.vacant
                    ? <div className="vacant-badge">Vacant</div>
                    : (node.jobTitle && <div className="person-title">{node.jobTitle}</div>)}
                {node.department && <div className="person-dept">{node.department}</div>}
            </div>
            <div className="person-foot">
                {directs > 0 ? (
                    <span className="person-reports">
                        ({directs} direct report{directs !== 1 ? 's' : ''} · {total} total)
                    </span>
                ) : (
                    <span className="person-ic">(Individual contributor)</span>
                )}
            </div>
            {showDecision && node.decision && (
                <div className="person-decision">
                    <span
                        className="decision-chip"
                        style={node.decisionStyle
                            ? {background: node.decisionStyle.bg, color: node.decisionStyle.fg, borderColor: node.decisionStyle.bg}
                            : undefined}
                    >
                        {node.decision}
                    </span>
                </div>
            )}
            {drillable && <div className="person-drill">▾</div>}
        </div>
    );
}

// A manager + their direct reports (used by the Manager filter view).
export function ManagerSection({node, nodeMap, totals, statusColors, showAvatar, onDrill, onOpen}) {
    const children = node.childIds.map(id => nodeMap[id]).filter(Boolean);
    return (
        <div className="manager-section">
            <PersonCard
                node={node}
                variant="focus"
                directs={node.childIds.length}
                total={totals[node.id] || 0}
                statusColor={node.status ? statusColors[node.status] : null}
                showAvatar={showAvatar}
                onDrill={onDrill}
                onOpen={onOpen}
            />
            {children.length > 0 && (
                <>
                    <div className="connector-vertical" />
                    <div className="reports-grid">
                        {children.map(child => (
                            <PersonCard
                                key={child.id}
                                node={child}
                                variant="report"
                                directs={child.childIds.length}
                                total={totals[child.id] || 0}
                                statusColor={child.status ? statusColors[child.status] : null}
                                showAvatar={showAvatar}
                                onDrill={onDrill}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// An organization + the positions in it (used by the Organization filter view).
export function OrgSection({org, members, totals, statusColors, showAvatar, onDrill, onOpen}) {
    return (
        <div className="manager-section">
            <div className="org-header">
                <span className="org-header-name">{org}</span>
                <span className="org-header-count">
                    {members.length} position{members.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="reports-grid">
                {members.map(n => (
                    <PersonCard
                        key={n.id}
                        node={n}
                        variant="report"
                        directs={n.childIds.length}
                        total={totals[n.id] || 0}
                        statusColor={n.status ? statusColors[n.status] : null}
                        showAvatar={showAvatar}
                        onDrill={onDrill}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}
