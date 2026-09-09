// The supervisory-organization model behind the stacked org chart.
//
// This is the Airtable port of the Apps Script "stacked org" renderer: a
// top-down tree of supervisory organizations, coloured by SO Status (border)
// and Scoping (fill), with conflict detection for self-references and cycles.

import {readText, readNumber, normCode, findFieldByName} from './fields';

// Supervisory org names in the source data follow the Workday convention
// "Team name (Manager) (OrgID)". Split it into its three parts; anything that
// doesn't match renders as a plain team name.
export function parseSupOrgName(fullName) {
    const three = fullName.match(/^(.+?)\s*\(([^)]*)\)\s*\(([^)]*)\)\s*$/);
    if (three) {
        return {team: three[1].trim(), manager: three[2].trim(), orgId: three[3].trim()};
    }
    const two = fullName.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
    if (two) {
        return {team: two[1].trim(), manager: two[2].trim(), orgId: ''};
    }
    return {team: fullName, manager: '', orgId: ''};
}

export function resolveSupOrgConfig(table, SUP_ORG) {
    const parentField = (SUP_ORG.parentLinkField
        ? findFieldByName(table, SUP_ORG.parentLinkField)
        : null)
        || table.fields.find(f => f.type === 'multipleRecordLinks')
        || null;
    return {
        nameField: findFieldByName(table, SUP_ORG.nameField),
        parentField,
        statusField: findFieldByName(table, SUP_ORG.statusField),
        scopingField: findFieldByName(table, SUP_ORG.scopingField),
        shortCodeField: findFieldByName(table, SUP_ORG.shortCodeField),
        headcountField: findFieldByName(table, SUP_ORG.headcountField),
        orgIdField: findFieldByName(table, SUP_ORG.orgIdField),
    };
}

export function buildSupOrgTree(records, cfg) {
    const {nameField, parentField, statusField, scopingField, shortCodeField,
        headcountField, orgIdField} = cfg;

    const map = {};
    const parentOf = {}; // childId → parentId
    const conflicts = []; // {node, type, detail}

    records.forEach(r => {
        const fullName = (nameField ? readText(r, nameField) : r.name) || r.name || '';
        const parsed = parseSupOrgName(fullName);
        const explicitOrgId = readText(r, orgIdField);
        map[r.id] = {
            id: r.id,
            name: fullName,
            record: r,
            teamName: parsed.team,
            managerName: parsed.manager,
            orgId: explicitOrgId || parsed.orgId,
            status: readText(r, statusField),
            scoping: readText(r, scopingField),
            shortCode: normCode(readText(r, shortCodeField)),
            headcount: readNumber(r, headcountField),
            children: [],
        };
    });

    // Build parent→child edges and flag self-references.
    records.forEach(r => {
        let parentCell = null;
        if (parentField) {
            try { parentCell = r.getCellValue(parentField); } catch { /* unreadable */ }
        }
        const cell = Array.isArray(parentCell) ? parentCell[0] : parentCell;
        const parentId = cell && (cell.id || cell.linkedRecordId);

        if (parentId === r.id) {
            conflicts.push({
                node: map[r.id],
                type: 'Self-reference',
                detail: `"${map[r.id].teamName}" reports to itself`,
            });
            return;
        }
        if (parentId && map[parentId]) parentOf[r.id] = parentId;
    });

    // Detect cycles: walk up from each node — if we revisit, it's a cycle.
    const inCycle = new Set();
    Object.keys(parentOf).forEach(startId => {
        const visited = new Set();
        let cur = startId;
        while (cur && parentOf[cur]) {
            if (visited.has(cur)) {
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

    const reportedCycles = new Set();
    inCycle.forEach(id => {
        if (reportedCycles.has(id) || !map[id]) return;
        const loop = [id];
        let next = parentOf[id];
        while (next && next !== id) {
            loop.push(next);
            next = parentOf[next];
        }
        const names = loop.map(lid => (map[lid] ? map[lid].teamName : lid));
        conflicts.push({
            node: map[id],
            type: 'Circular reference',
            detail: names.join(' → ') + ' → ' + map[id].teamName,
        });
        loop.forEach(lid => reportedCycles.add(lid));
    });

    // Build the tree, skipping cycle nodes.
    Object.keys(parentOf).forEach(childId => {
        if (inCycle.has(childId)) return;
        const pid = parentOf[childId];
        if (map[pid] && !inCycle.has(pid)) map[pid].children.push(map[childId]);
    });

    const byTeam = (a, b) => a.teamName.localeCompare(b.teamName);
    Object.values(map).forEach(n => n.children.sort(byTeam));

    // Roots: nodes with no parent (or a parent outside the map), minus cycles.
    const roots = records
        .filter(r => !inCycle.has(r.id) && !parentOf[r.id])
        .map(r => map[r.id])
        .sort(byTeam);

    return {roots, conflicts, nodeMap: map};
}

export function collectSubtreeIds(node, set = new Set()) {
    set.add(node.id);
    node.children.forEach(c => collectSubtreeIds(c, set));
    return set;
}

// Flatten a forest depth-first, tagging each node with its depth.
export function flattenTree(roots) {
    const out = [];
    const walk = (node, depth) => {
        out.push({node, depth});
        node.children.forEach(c => walk(c, depth + 1));
    };
    roots.forEach(r => walk(r, 0));
    return out;
}
