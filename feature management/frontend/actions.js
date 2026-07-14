import {STATUS, APPROVAL, HANDSHAKE_ACTION} from './constants';
import {allAcceptanceMet} from './data';

// Build a cell value matching a field's type. Undefined → caller skips it.
function cellFor(field, {linkId, name, text, dateISO, number}) {
    if (!field) return undefined;
    const type = field.type || '';
    if (type === 'multipleRecordLinks' || type === 'singleRecordLink') {
        return linkId ? [{id: linkId}] : undefined;
    }
    if (type === 'singleSelect') return name ? {name} : undefined;
    if (type === 'date' || type === 'dateTime') return dateISO || undefined;
    if (type === 'number' || type === 'autoNumber') return number != null ? number : undefined;
    const v = text != null ? text : name;
    return v != null && v !== '' ? String(v) : undefined;
}

// Read a cell from `record` and return a value shaped to WRITE the same field
// on another record — works whether the field is a link, select, or text.
function copyCellValue(record, field) {
    if (!record || !field) return undefined;
    let v;
    try {
        v = record.getCellValue(field.id);
    } catch {
        return undefined;
    }
    if (v == null || v === '') return undefined;
    const t = field.type || '';
    if (t === 'multipleRecordLinks' || t === 'singleRecordLink' || t === 'multipleSelects' || t === 'multipleCollaborators') {
        return Array.isArray(v) ? v.map(x => ({id: x.id})) : undefined;
    }
    if (t === 'singleSelect' || t === 'singleCollaborator') {
        return v.id ? {id: v.id} : (v.name ? {name: v.name} : undefined);
    }
    return v; // text / number / etc — write back verbatim
}

function writeObject(pairs) {
    const out = {};
    for (const [field, spec] of pairs) {
        if (!field) continue;
        const v = cellFor(field, spec);
        if (v !== undefined) out[field.id] = v;
    }
    return out;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function decisionMakerName(session) {
    const u = session && session.currentUser;
    return (u && (u.name || u.email)) || 'Current user';
}

export function remainingAcceptance(attr) {
    return attr.acceptance.filter(i => !i.done).map(i => i.text);
}

async function createHandshake(model, session, {attr, action, fromTeamId, toTeamId, stage, comment, cycle}) {
    const table = model.tablesRaw.handshakes;
    const hf = model.fieldsRaw.handshakes;
    if (!table) return; // audit table optional — skip silently if absent
    const obj = writeObject([
        [hf.attribute, {linkId: attr.id, text: attr.attributeId, name: attr.attributeId}],
        [hf.feature, {text: attr.featureName, name: attr.featureName}],
        [hf.stage, {linkId: stage ? stage.id : null, text: stage ? stage.name : attr.currentStageName, name: stage ? stage.name : attr.currentStageName}],
        [hf.fromTeam, {linkId: fromTeamId, text: attr.assignedTeamName}],
        [hf.toTeam, {linkId: toTeamId}],
        [hf.action, {name: action}],
        [hf.decisionMaker, {text: decisionMakerName(session)}],
        [hf.timestamp, {dateISO: todayISO()}],
        [hf.comments, {text: comment || ''}],
        [hf.cycleNumber, {number: cycle != null ? cycle : undefined, text: cycle != null ? String(cycle) : undefined}],
    ]);
    if (typeof table.hasPermissionToCreateRecords === 'function' && !table.hasPermissionToCreateRecords([{fields: obj}])) {
        throw new Error('You do not have permission to create Handshake records.');
    }
    await table.createRecordsAsync([{fields: obj}]);
}

async function updateAttribute(model, attr, obj) {
    const table = model.tablesRaw.attributes;
    if (typeof table.hasPermissionToUpdateRecord === 'function' && !table.hasPermissionToUpdateRecord(attr.record, obj)) {
        throw new Error('You do not have permission to update this attribute.');
    }
    await table.updateRecordsAsync([{id: attr.id, fields: obj}]);
}

// ── Plain status change (drag to To do / In progress / Blocked) ───────────────
// Internal lifecycle move — no handshake (those are reserved for handoffs).
export async function setStatus(model, attr, status, reason) {
    const af = model.fieldsRaw.attributes;
    const pairs = [[af.status, {name: status}]];
    if (status === STATUS.blocked) pairs.push([af.blockedReason, {text: reason || ''}]);
    await updateAttribute(model, attr, writeObject(pairs));
}

// ── Relationships: address-by (link existing) / fork-out (create new) ─────────
export async function linkAddressedBy(model, attr, targetIds) {
    const af = model.fieldsRaw.attributes;
    if (!af.addressedBy) throw new Error('Add an "Addressed By" link field (Link → Attributes) to the base first.');
    const merged = [...new Set([...attr.addressedBy.map(x => x.id), ...targetIds])];
    await updateAttribute(model, attr, {[af.addressedBy.id]: merged.map(id => ({id}))});
}

export async function forkOutCreate(model, attr, names) {
    const table = model.tablesRaw.attributes;
    const af = model.fieldsRaw.attributes;
    if (!af.forksInto) throw new Error('Add a "Forks Into" link field (Link → Attributes) to the base first.');
    const stage1 = model.stagesByCode['1'] || null;
    const base = attr.attributeId || 'ATTR';
    const stamp = Date.now().toString(36).slice(-4).toUpperCase();

    // Copy the parent's Feature cell in its NATIVE shape (link / select / text);
    // fall back to a Features name-match if the cell can't be read (e.g. lookup).
    let featureVal = copyCellValue(attr.record, af.feature);
    if (featureVal === undefined && attr.featureName && Array.isArray(model.features)) {
        const fr = model.features.find(f => f.name === attr.featureName);
        if (fr) featureVal = [{id: fr.id}];
    }
    if (af.feature && featureVal === undefined) {
        throw new Error(`Couldn't read a Feature to copy from "${attr.businessName || attr.attributeId}" — set the parent's Feature, then fork.`);
    }

    // Duplicate the parent's catalogue AND position fields, each in its own
    // cell shape — a fork continues from the parent's stage, not from scratch.
    const copied = {};
    [af.sourcingType, af.isReferenceData, af.requiresGateway, af.fsdm, af.technicalName,
     af.currentStage, af.assignedTeam, af.approverTeam].forEach(f => {
        if (!f) return;
        const v = copyCellValue(attr.record, f);
        if (v !== undefined) copied[f.id] = v;
    });
    if (af.feature && featureVal !== undefined) copied[af.feature.id] = featureVal;

    // ONE atomic create with every field. If any cell shape is invalid the call
    // fails as a whole and the error surfaces — no half-made "Unassigned"
    // orphans. Stage/team fallbacks pass BOTH linkId and name so they write
    // whether those fields are links or single-selects; the parent's native
    // cell values (copied above) win when readable.
    const parentStage = attr.stage || stage1 || null;
    const payload = names.map((nm, i) => {
        const fields = writeObject([
            [af.attributeId, {text: `${base}-F${stamp}${i + 1}`}],
            [af.businessName, {text: (nm && nm.trim()) || `${attr.businessName || base} — fork ${i + 1}`}],
            [af.currentStage, {linkId: parentStage ? parentStage.id : null, name: parentStage ? parentStage.name : null}],
            [af.status, {name: STATUS.notStarted}],
            [af.assignedTeam, {linkId: parentStage ? parentStage.responsibleTeamId : null, name: parentStage ? parentStage.responsibleTeamName : null}],
            [af.approverTeam, {linkId: parentStage ? parentStage.approverTeamId : null, name: parentStage ? parentStage.approverTeamName : null}],
        ]);
        Object.assign(fields, copied);
        return {fields};
    });
    if (typeof table.hasPermissionToCreateRecords === 'function' && !table.hasPermissionToCreateRecords(payload)) {
        throw new Error('You do not have permission to create attribute records.');
    }
    const newIds = await table.createRecordsAsync(payload);

    // 3) link the parent → children
    const merged = [...attr.forksInto.map(x => x.id), ...newIds];
    await updateAttribute(model, attr, {[af.forksInto.id]: merged.map(id => ({id}))});
    return newIds;
}

// ── Promote: submit current stage for review (does not advance yet) ───────────
export async function promoteTask(model, attr, session) {
    if (!allAcceptanceMet(attr.acceptance)) {
        const err = new Error('Acceptance criteria not yet met.');
        err.remaining = remainingAcceptance(attr);
        throw err;
    }
    const af = model.fieldsRaw.attributes;
    const nextStage = attr.nextCode ? model.stagesByCode[attr.nextCode] : null;

    await updateAttribute(model, attr, writeObject([
        [af.status, {name: STATUS.submitted}],
        [af.approvalStatus, {name: APPROVAL.pending}],
    ]));

    await createHandshake(model, session, {
        attr,
        action: HANDSHAKE_ACTION.submitted,
        fromTeamId: attr.assignedTeamId,
        toTeamId: (nextStage && nextStage.responsibleTeamId) || attr.approverTeamId,
        stage: attr.stage,
        cycle: 1,
    });
}

// ── Accept / Return ───────────────────────────────────────────────────────────
export async function decideTask(model, attr, decision, comment, session) {
    const af = model.fieldsRaw.attributes;
    const nextStage = attr.nextCode ? model.stagesByCode[attr.nextCode] : null;

    if (decision === 'accept') {
        if (nextStage) {
            // Advance the attribute into the next maturity stage.
            await updateAttribute(model, attr, writeObject([
                [af.currentStage, {linkId: nextStage.id}],
                [af.status, {name: STATUS.notStarted}],
                [af.approvalStatus, {name: APPROVAL.notRequired}],
                [af.assignedTeam, {linkId: nextStage.responsibleTeamId}],
                [af.approverTeam, {linkId: nextStage.approverTeamId}],
            ]));
        } else {
            // No further stage — delivered.
            await updateAttribute(model, attr, writeObject([
                [af.status, {name: STATUS.done}],
                [af.approvalStatus, {name: APPROVAL.approved}],
            ]));
        }
        await createHandshake(model, session, {
            attr,
            action: HANDSHAKE_ACTION.approved,
            fromTeamId: attr.assignedTeamId,
            toTeamId: (nextStage && nextStage.responsibleTeamId) || attr.assignedTeamId,
            stage: attr.stage,
            cycle: 1,
        });
        return;
    }

    // Return — comment required; bump cycle number.
    if (!comment || !comment.trim()) {
        throw new Error('A comment is required when returning a task.');
    }
    let cycle = 1;
    try {
        const c = af.cycleNumber && attr.record.getCellValue(af.cycleNumber.id);
        if (typeof c === 'number') cycle = c + 1;
    } catch {
        cycle = 1;
    }
    await updateAttribute(model, attr, writeObject([
        [af.status, {name: STATUS.returned}],
        [af.approvalStatus, {name: APPROVAL.returned}],
        [af.comments, {text: comment.trim()}],
        [af.cycleNumber, {number: cycle, text: String(cycle)}],
    ]));
    await createHandshake(model, session, {
        attr,
        action: HANDSHAKE_ACTION.returned,
        fromTeamId: attr.approverTeamId || attr.assignedTeamId,
        toTeamId: attr.assignedTeamId,
        stage: attr.stage,
        comment: comment.trim(),
        cycle,
    });
}
