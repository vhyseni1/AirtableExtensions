// The people org model: turn "Employees & Positions" records into a tree of
// nodes keyed by record id. Shared by the position chart, the dashboard and the
// data table so all three agree on who reports to whom.

import {
    readText, readNumber, normName, normCode, readCollaboratorEmails,
    findFieldByName, extractParentRef, selectChoiceStyles,
} from './fields';

export const VACANT_LABEL = 'Vacant position';

// The incumbent's name. Unlike the display name, this does NOT fall back to the
// primary field — an empty result means the position has no incumbent (vacant).
function incumbentName(record, nameField) {
    const raw = nameField ? readText(record, nameField) : record.name;
    return (raw || '').trim();
}

// Resolve every configured field name in PEOPLE against a live table.
export function resolvePeopleConfig(table, PEOPLE) {
    const nameField = PEOPLE.primaryNameSource && PEOPLE.primaryNameSource !== 'name'
        ? findFieldByName(table, PEOPLE.primaryNameSource)
        : null;
    const parentField = PEOPLE.parentLinkField
        ? findFieldByName(table, PEOPLE.parentLinkField)
        : (table.fields.find(f => f.type === 'multipleRecordLinks') || null);
    const departmentField = findFieldByName(table, PEOPLE.departmentField);
    return {
        nameField,
        jobTitleField: findFieldByName(table, PEOPLE.jobTitleField),
        departmentField,
        statusField: findFieldByName(table, PEOPLE.statusField),
        parentField,
        employeeIdField: findFieldByName(table, PEOPLE.employeeIdField),
        managerIdField: findFieldByName(table, PEOPLE.managerIdField),
        orgFilterField: findFieldByName(table, PEOPLE.orgFilterField) || departmentField,
        leaderEmailField: findFieldByName(table, PEOPLE.leaderEmailField),
        shortCodeField: findFieldByName(table, PEOPLE.shortCodeField),
        visibleLeadersField: findFieldByName(table, PEOPLE.visibleLeadersField),
        employeeDecisionField: findFieldByName(table, PEOPLE.employeeDecisionField),
        fteField: findFieldByName(table, PEOPLE.fteField),
        positionStatusField: findFieldByName(table, PEOPLE.positionStatusField),
    };
}

// A stable key over the resolved config, so memoized derivations re-run when a
// field is renamed/deleted but not on every render.
export function configKey(cfg) {
    return Object.values(cfg).map(f => (f ? f.id : '∅')).join('|');
}

export function buildOrg(records, cfg, colorUtils) {
    const {parentField, nameField, jobTitleField, departmentField, statusField,
        employeeIdField, managerIdField, orgFilterField, leaderEmailField,
        shortCodeField, visibleLeadersField, employeeDecisionField, fteField} = cfg;

    const decisionStyleByName = selectChoiceStyles(employeeDecisionField, colorUtils);

    const nodeMap = {};
    const idByName = {};
    const idByEmployeeId = {}; // employee-id value → record id

    records.forEach(r => {
        const incumbent = incumbentName(r, nameField);
        const vacant = !incumbent;
        const jobTitle = readText(r, jobTitleField);
        // Vacant seats show the role title as the headline (fall back to a
        // generic label only if there's no title either).
        const displayName = vacant ? (jobTitle || VACANT_LABEL) : incumbent;
        const decision = readText(r, employeeDecisionField);
        nodeMap[r.id] = {
            id: r.id,
            record: r,
            displayName,
            vacant,
            jobTitle,
            department: readText(r, departmentField),
            org: readText(r, orgFilterField),
            status: readText(r, statusField),
            email: normName(readText(r, leaderEmailField)),
            shortCode: normCode(readText(r, shortCodeField)),
            visibleLeaders: readCollaboratorEmails(r, visibleLeadersField),
            decision,
            decisionStyle: decisionStyleByName[normName(decision)] || null,
            fte: fteField ? readNumber(r, fteField) : (vacant ? 0 : 1),
            childIds: [],
            parentId: null,
        };
        // Don't index vacant "names" — they'd collide and mis-match by name.
        if (!vacant) {
            [displayName, r.name].forEach(n => {
                const k = normName(n);
                if (k && !(k in idByName)) idByName[k] = r.id;
            });
        }
        if (employeeIdField) {
            const eid = normName(readText(r, employeeIdField));
            if (eid && !(eid in idByEmployeeId)) idByEmployeeId[eid] = r.id;
        }
    });

    // Prefer a true id over name matching (names are ambiguous for duplicates):
    //   1. explicit manager-id → employee-id mapping (most reliable),
    //   2. linked-record id from the manager lookup/link,
    //   3. name match as a last resort.
    const resolveParentId = r => {
        if (managerIdField) {
            const mid = normName(readText(r, managerIdField));
            if (mid && idByEmployeeId[mid] && idByEmployeeId[mid] !== r.id) return idByEmployeeId[mid];
        }
        const {ids, names} = extractParentRef(r, parentField);
        for (const id of ids) {
            if (nodeMap[id] && id !== r.id) return id;
        }
        for (const nm of names) {
            const id = idByName[normName(nm)];
            if (id && id !== r.id) return id;
        }
        return null;
    };

    records.forEach(r => {
        const pid = resolveParentId(r);
        if (pid && nodeMap[pid]) {
            nodeMap[r.id].parentId = pid;
            nodeMap[pid].childIds.push(r.id);
        }
    });

    const byName = (a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName);
    Object.values(nodeMap).forEach(n => n.childIds.sort(byName));

    return deriveRootsTotals(nodeMap);
}

export function ancestorChain(nodeMap, id) {
    const chain = [];
    let cur = nodeMap[id] ? nodeMap[id].parentId : null;
    let guard = 0;
    const seen = new Set([id]);
    while (cur && nodeMap[cur] && !seen.has(cur) && guard < 200) {
        chain.push(cur);
        seen.add(cur);
        cur = nodeMap[cur].parentId;
        guard++;
    }
    return chain.reverse();
}

// Compute rootIds + descendant totals for an arbitrary node map (also used
// after the full tree is pruned to a single leader's scope).
export function deriveRootsTotals(nodeMap) {
    const ids = Object.keys(nodeMap);
    const byName = (a, b) => nodeMap[a].displayName.localeCompare(nodeMap[b].displayName);
    const rootIds = ids.filter(id => !nodeMap[id].parentId).sort(byName);
    const totals = {};
    const compute = (id, stack) => {
        if (totals[id] != null) return totals[id];
        if (stack.has(id)) return 0;
        stack.add(id);
        let sum = 0;
        nodeMap[id].childIds.forEach(c => { if (nodeMap[c]) sum += 1 + compute(c, stack); });
        stack.delete(id);
        totals[id] = sum;
        return sum;
    };
    ids.forEach(id => compute(id, new Set()));
    return {nodeMap, rootIds, totals};
}

// Depth of each node from its root (root = 0). Cycle-safe.
export function depthByNode(nodeMap) {
    const depths = {};
    const compute = (id, stack) => {
        if (depths[id] != null) return depths[id];
        if (stack.has(id)) return 0;
        const parentId = nodeMap[id] ? nodeMap[id].parentId : null;
        if (!parentId || !nodeMap[parentId]) {
            depths[id] = 0;
            return 0;
        }
        stack.add(id);
        depths[id] = compute(parentId, stack) + 1;
        stack.delete(id);
        return depths[id];
    };
    Object.keys(nodeMap).forEach(id => compute(id, new Set()));
    return depths;
}

const STATUS_PALETTE = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

export function buildStatusColors(nodeMap) {
    const vals = new Set();
    Object.values(nodeMap).forEach(n => { if (n.status) vals.add(n.status); });
    const m = {};
    [...vals].sort().forEach((v, i) => { m[v] = STATUS_PALETTE[i % STATUS_PALETTE.length]; });
    return m;
}

// ─── Per-leader scoping ──────────────────────────────────────────────────────
//
// Returns the set of record ids the viewer may see, or null when scoping is off
// (unrestricted). An empty set means "configured, but nothing visible to you".

export function computeScope({fullNodeMap, cfg, viewerEmail, adminEmails}) {
    const scopingConfigured = !!(cfg.leaderEmailField || cfg.visibleLeadersField);
    if (!scopingConfigured) return {scope: null, scopingConfigured, isAdmin: false};

    const adminSet = new Set((adminEmails || []).map(normName));
    const isAdmin = adminSet.has(viewerEmail);
    if (isAdmin) return {scope: null, scopingConfigured, isAdmin};
    if (!viewerEmail) return {scope: new Set(), scopingConfigured, isAdmin};

    // 1) Collaborator field ("Visible to leaders") takes precedence.
    if (cfg.visibleLeadersField) {
        const s = new Set();
        for (const n of Object.values(fullNodeMap)) {
            if (n.visibleLeaders && n.visibleLeaders.includes(viewerEmail)) s.add(n.id);
        }
        if (s.size > 0) {
            // The access field lists each record's SUPERIORS, so this set is the
            // leader's subordinates — it excludes the leader's own seat, which
            // sits up in the parent org they don't manage. Add the immediate
            // parent(s) of the top of the scoped branch so the leader appears as
            // the top box, with their direct reports hanging beneath it.
            const parents = new Set();
            for (const id of s) {
                const n = fullNodeMap[id];
                if (n && n.parentId && !s.has(n.parentId)) parents.add(n.parentId);
            }
            parents.forEach(pid => { if (fullNodeMap[pid]) s.add(pid); });
            return {scope: s, scopingConfigured, isAdmin};
        }
    }

    // 2) Fall back to short-code prefix from the viewer's own leader node.
    const leaderNode = Object.values(fullNodeMap).find(n => n.email && n.email === viewerEmail);
    if (leaderNode && leaderNode.shortCode) {
        const code = leaderNode.shortCode;
        const s = new Set();
        for (const n of Object.values(fullNodeMap)) {
            if (n.shortCode && n.shortCode.startsWith(code)) s.add(n.id);
        }
        s.add(leaderNode.id);
        return {scope: s, scopingConfigured, isAdmin};
    }

    return {scope: new Set(), scopingConfigured, isAdmin};
}

// Clip a node map to a scope, severing parent/child links that leave it.
export function pruneToScope(fullNodeMap, scope) {
    if (!scope) return deriveRootsTotals(fullNodeMap);
    const m = {};
    for (const id of scope) {
        const n = fullNodeMap[id];
        if (!n) continue;
        m[id] = {
            ...n,
            parentId: (n.parentId && scope.has(n.parentId)) ? n.parentId : null,
            childIds: n.childIds.filter(c => scope.has(c)),
        };
    }
    return deriveRootsTotals(m);
}
