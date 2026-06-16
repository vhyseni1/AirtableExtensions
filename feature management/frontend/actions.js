import {STATUS, APPROVAL, HANDSHAKE_ACTION} from './constants';
import {allAcceptanceMet} from './data';

// Build a cell value matching a field's type. Returns undefined when the field
// is missing or no usable value was supplied (caller skips undefined entries).
function cellFor(field, {linkId, name, text, dateISO}) {
    if (!field) return undefined;
    const type = field.type || '';
    if (type === 'multipleRecordLinks' || type === 'singleRecordLink') {
        return linkId ? [{id: linkId}] : undefined;
    }
    if (type === 'singleSelect') {
        return name ? {name} : undefined;
    }
    if (type === 'date' || type === 'dateTime') {
        return dateISO || undefined;
    }
    // text / number / anything else → plain string
    const v = text != null ? text : name;
    return v != null && v !== '' ? String(v) : undefined;
}

// Assemble a {fieldId: value} write object from a list of [field, spec] pairs,
// dropping anything undefined so we never touch fields the base doesn't have.
function writeObject(pairs) {
    const out = {};
    for (const [field, spec] of pairs) {
        if (!field) continue;
        const v = cellFor(field, spec);
        if (v !== undefined) out[field.id] = v;
    }
    return out;
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function decisionMakerName(session) {
    const u = session && session.currentUser;
    return (u && (u.name || u.email)) || 'Current user';
}

// Items in the task's acceptance checklist that are still not done.
export function remainingAcceptance(task) {
    return task.acceptance.filter(i => !i.done).map(i => i.text);
}

async function createHandshake(model, fields, session, {task, action, fromTeamId, toTeamId, comment, cycleNumber}) {
    const hs = model.fieldsRaw.handshakes;
    const table = model.tablesRaw.handshakes;
    if (!table) return;
    const pairs = [
        [hs.stageTask, {linkId: task.id, text: task.taskId}],
        [hs.feature, {text: task.featureName, name: task.featureName}],
        [hs.attribute, {text: task.attr ? task.attr.attributeId : '', name: task.attr ? task.attr.attributeId : ''}],
        [hs.stage, {text: task.stageName, name: task.stageName}],
        [hs.fromTeam, {linkId: fromTeamId, text: task.assignedTeamName}],
        [hs.toTeam, {linkId: toTeamId}],
        [hs.action, {name: action}],
        [hs.decisionMaker, {text: decisionMakerName(session)}],
        [hs.timestamp, {dateISO: todayISO()}],
        [hs.comments, {text: comment || ''}],
        [hs.cycleNumber, {text: cycleNumber != null ? String(cycleNumber) : undefined}],
    ];
    const obj = writeObject(pairs);
    if (typeof table.hasPermissionToCreateRecords === 'function' && !table.hasPermissionToCreateRecords([{fields: obj}])) {
        throw new Error('You do not have permission to create Handshake records in this base.');
    }
    await table.createRecordsAsync([{fields: obj}]);
}

// Activate (or create) the next stage's task as Not Started.
async function upsertNextTask(model, task, nextStage) {
    const stTable = model.tablesRaw.stageTasks;
    const stf = model.fieldsRaw.stageTasks;
    if (!stTable || !nextStage) return;

    const existing = model.tasksByKey[`${task.attrKey}|${nextStage.code}`];
    if (existing) {
        const obj = writeObject([[stf.status, {name: STATUS.notStarted}]]);
        if (typeof stTable.hasPermissionToUpdateRecord === 'function' && !stTable.hasPermissionToUpdateRecord(existing.record, obj)) {
            throw new Error('No permission to update the next Stage Task.');
        }
        await stTable.updateRecordsAsync([{id: existing.id, fields: obj}]);
        return;
    }
    // Create a fresh Not Started task for the next stage in the path.
    const attrId = task.attr ? task.attr.attributeId : '';
    const obj = writeObject([
        [stf.taskId, {text: `${attrId} / ${nextStage.code}`}],
        [stf.attribute, {linkId: task.attr ? task.attr.recordId : null, text: attrId}],
        [stf.feature, {text: task.featureName, name: task.featureName}],
        [stf.stage, {linkId: nextStage.id, text: nextStage.name}],
        [stf.stageCode, {text: nextStage.code}],
        [stf.phaseGroup, {name: nextStage.phaseGroup, text: nextStage.phaseGroup}],
        [stf.assignedTeam, {linkId: nextStage.responsibleTeamId, text: nextStage.responsibleTeamName}],
        [stf.status, {name: STATUS.notStarted}],
        [stf.approvalStatus, {name: APPROVAL.notRequired}],
    ]);
    if (typeof stTable.hasPermissionToCreateRecords === 'function' && !stTable.hasPermissionToCreateRecords([{fields: obj}])) {
        throw new Error('No permission to create the next Stage Task.');
    }
    await stTable.createRecordsAsync([{fields: obj}]);
}

// ── Promote / Push to next phase (§6) ─────────────────────────────────────────
export async function promoteTask(model, task, session) {
    if (!allAcceptanceMet(task.acceptance)) {
        const remaining = remainingAcceptance(task);
        const err = new Error('Acceptance criteria not yet met.');
        err.remaining = remaining;
        throw err;
    }
    const nextStage = task.nextCode ? model.stagesByCode[task.nextCode] : null;
    const stTable = model.tablesRaw.stageTasks;
    const stf = model.fieldsRaw.stageTasks;

    // 1) Mark this task Submitted for Review (+ Pending approval).
    const upd = writeObject([
        [stf.status, {name: STATUS.submitted}],
        [stf.approvalStatus, {name: APPROVAL.pending}],
    ]);
    if (typeof stTable.hasPermissionToUpdateRecord === 'function' && !stTable.hasPermissionToUpdateRecord(task.record, upd)) {
        throw new Error('You do not have permission to update this Stage Task.');
    }
    await stTable.updateRecordsAsync([{id: task.id, fields: upd}]);

    // 2) Post the handshake to the next stage's responsible team.
    await createHandshake(model, model.fieldsRaw.handshakes, session, {
        task,
        action: HANDSHAKE_ACTION.submitted,
        fromTeamId: task.assignedTeamId,
        toTeamId: nextStage ? nextStage.responsibleTeamId : null,
        cycleNumber: 1,
    });

    // 3) Activate/create the next stage task.
    if (nextStage) await upsertNextTask(model, task, nextStage);
}

// ── Accept / Return (§6) ──────────────────────────────────────────────────────
export async function decideTask(model, task, decision, comment, session) {
    const stTable = model.tablesRaw.stageTasks;
    const stf = model.fieldsRaw.stageTasks;
    const nextStage = task.nextCode ? model.stagesByCode[task.nextCode] : null;

    if (decision === 'accept') {
        const upd = writeObject([
            [stf.status, {name: STATUS.approved}],
            [stf.approvalStatus, {name: APPROVAL.approved}],
        ]);
        if (typeof stTable.hasPermissionToUpdateRecord === 'function' && !stTable.hasPermissionToUpdateRecord(task.record, upd)) {
            throw new Error('You do not have permission to approve this Stage Task.');
        }
        await stTable.updateRecordsAsync([{id: task.id, fields: upd}]);
        await createHandshake(model, model.fieldsRaw.handshakes, session, {
            task,
            action: HANDSHAKE_ACTION.approved,
            fromTeamId: task.assignedTeamId,
            toTeamId: nextStage ? nextStage.responsibleTeamId : null,
            cycleNumber: 1,
        });
        return;
    }

    // Return — comment required; bump cycle number.
    if (!comment || !comment.trim()) {
        throw new Error('A comment is required when returning a task.');
    }
    let cycle = 1;
    try {
        const c = task.record.getCellValue(stf.cycleNumber && stf.cycleNumber.id);
        if (typeof c === 'number') cycle = c + 1;
    } catch {
        cycle = 1;
    }
    const upd = writeObject([
        [stf.status, {name: STATUS.returned}],
        [stf.approvalStatus, {name: APPROVAL.returned}],
        [stf.comments, {text: comment.trim()}],
        [stf.cycleNumber, {text: undefined}], // number field set below if present
    ]);
    if (stf.cycleNumber && (stf.cycleNumber.type === 'number' || stf.cycleNumber.type === 'autoNumber')) {
        upd[stf.cycleNumber.id] = cycle;
    }
    if (typeof stTable.hasPermissionToUpdateRecord === 'function' && !stTable.hasPermissionToUpdateRecord(task.record, upd)) {
        throw new Error('You do not have permission to return this Stage Task.');
    }
    await stTable.updateRecordsAsync([{id: task.id, fields: upd}]);
    await createHandshake(model, model.fieldsRaw.handshakes, session, {
        task,
        action: HANDSHAKE_ACTION.returned,
        fromTeamId: task.assignedTeamId,
        toTeamId: task.assignedTeamId,
        comment: comment.trim(),
        cycleNumber: cycle,
    });
}
