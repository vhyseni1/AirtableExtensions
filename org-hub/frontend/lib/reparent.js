// Changing a reporting line by dragging one card onto another.
//
// This is the only part of the extension that writes. Everything else reads.
//
// The subtlety that makes or breaks it: `buildOrg` resolves a person's manager
// from the MANAGER-ID TEXT FIELD FIRST, and only falls back to the link field
// (see `resolveParentId` in people.js). So writing just the link leaves the old
// manager id in place, the tree rebuilds exactly as it was, and the card
// silently snaps back. Both fields have to move together, in one update, which
// is what `reparentFields` builds.
//
// The same ordering tells us what to do when the new manager has no employee id
// of their own: write a blank manager id rather than leaving the stale one, so
// resolution falls through to the link we are also writing.

import {readText, normName} from './fields';

// Every id at or below `rootId`. A person may not be reparented onto their own
// descendant — that detaches the subtree from the tree and makes a cycle.
export function collectSubtreeIds(nodeMap, rootId) {
    const out = new Set();
    const walk = id => {
        if (!id || out.has(id)) return;
        out.add(id);
        const node = nodeMap[id];
        if (node) node.childIds.forEach(walk);
    };
    walk(rootId);
    return out;
}

// Is this drop legal, on the shape of the tree alone? Permission and field
// writability are checked separately, at the point of writing.
export function canReparent(nodeMap, childId, newParentId) {
    if (!childId || !newParentId) return {ok: false, reason: 'Nothing to move.'};
    if (childId === newParentId) return {ok: false, reason: 'A person cannot report to themselves.'};

    const child = nodeMap[childId];
    const parent = nodeMap[newParentId];
    if (!child) return {ok: false, reason: 'That person is no longer in view.'};
    if (!parent) return {ok: false, reason: 'That manager is no longer in view.'};
    if (child.parentId === newParentId) {
        return {ok: false, reason: `${child.displayName} already reports to ${parent.displayName}.`};
    }
    if (collectSubtreeIds(nodeMap, childId).has(newParentId)) {
        return {
            ok: false,
            reason: `${parent.displayName} reports into ${child.displayName}; that would make a loop.`,
        };
    }
    return {ok: true};
}

// Only a real link field can take a record reference. `parentLinkField` is
// allowed to be a lookup (the README says so), and a lookup is computed — not
// writable. In that case the manager id alone carries the change, which is fine
// because it is what resolution reads first anyway.
function isWritableLink(field) {
    return !!field && field.type === 'multipleRecordLinks';
}

// A text-ish field we can put an employee id into. Anything computed (formula,
// rollup, lookup) is not writable.
function isWritableText(field) {
    return !!field && (field.type === 'singleLineText' || field.type === 'multilineText');
}

// The cell values one reparent writes. Returns null when the table gives us no
// writable way to express the change at all.
export function reparentFields(cfg, newParentNode) {
    const {parentField, managerIdField, employeeIdField} = cfg;
    const fields = {};

    if (isWritableLink(parentField)) {
        fields[parentField.id] = [{id: newParentNode.id}];
    }
    if (isWritableText(managerIdField)) {
        // Blank when the new manager has no employee id: a stale id here would
        // outrank the link and quietly undo the move.
        const newManagerEmployeeId = employeeIdField
            ? readText(newParentNode.record, employeeIdField)
            : '';
        fields[managerIdField.id] = newManagerEmployeeId || '';
    }

    return Object.keys(fields).length > 0 ? fields : null;
}

// True when the move will actually survive a rebuild of the tree. If the only
// writable field is the link, but a manager-id field exists and holds a value
// that resolves to someone else, resolution would keep using the old id.
export function wouldStick(cfg, childNode, fields) {
    const {managerIdField} = cfg;
    if (!managerIdField) return true;
    if (managerIdField.id in fields) return true;
    // Manager id exists, is not writable, and still holds something.
    return !normName(readText(childNode.record, managerIdField));
}

// Performs the write. Returns {ok} or {ok: false, reason} — never throws, so a
// failed drop is a message rather than a broken board.
export async function applyReparent(table, cfg, nodeMap, childId, newParentId) {
    const legal = canReparent(nodeMap, childId, newParentId);
    if (!legal.ok) return legal;

    const child = nodeMap[childId];
    const parent = nodeMap[newParentId];
    if (!child.record) return {ok: false, reason: 'That card has no underlying record.'};

    const fields = reparentFields(cfg, parent);
    if (!fields) {
        return {
            ok: false,
            reason: 'No writable manager field on this table — the link is a lookup and there is no manager-id text field.',
        };
    }
    if (!wouldStick(cfg, child, fields)) {
        return {
            ok: false,
            reason: 'The manager-id field is not writable and still holds the old manager, which would override this change.',
        };
    }

    const check = table.checkPermissionsForUpdateRecord
        ? table.checkPermissionsForUpdateRecord(child.record, fields)
        : null;
    if (check && !check.hasPermission) {
        return {ok: false, reason: check.reasonDisplayString || 'You do not have permission to edit this record.'};
    }

    try {
        await table.updateRecordAsync(child.record, fields);
        return {ok: true, reason: `${child.displayName} now reports to ${parent.displayName}.`};
    } catch (err) {
        return {ok: false, reason: (err && err.message) ? err.message : String(err)};
    }
}
