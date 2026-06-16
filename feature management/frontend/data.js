import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {
    TABLES,
    FIELDS,
    STATUS,
    APPROVAL,
    PHASE_GROUPS,
    ACTIVE_STATUSES,
    nextStageCode,
    prevStageCode,
} from './constants';

// ─── Cell readers (defensive — a missing field never throws) ──────────────────
export function str(record, field) {
    if (!record || !field) return '';
    try {
        const v = record.getCellValueAsString(field.id);
        return v == null ? '' : String(v).trim();
    } catch {
        return '';
    }
}
export function bool(record, field) {
    if (!record || !field) return false;
    try {
        return record.getCellValue(field.id) === true;
    } catch {
        return false;
    }
}
// Linked-record cell → array of {id, name}. Empty array when unset/missing.
export function links(record, field) {
    if (!record || !field) return [];
    try {
        const v = record.getCellValue(field.id);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}
export function firstLinkId(record, field) {
    const l = links(record, field);
    return l.length ? l[0].id : null;
}

// Acceptance Criteria: a JSON array stored as a string in a long-text cell (§2).
// Returns [{text, done}]. Tolerant of empty / malformed cells.
export function parseAcceptance(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(x => x && typeof x === 'object')
            .map(x => ({text: String(x.text || ''), done: x.done === true}));
    } catch {
        return [];
    }
}
export function allAcceptanceMet(items) {
    return items.length > 0 && items.every(i => i.done);
}

// Resolve a table + the subset of FIELDS we use; record anything missing.
function bindTable(base, tableName, fieldSpec, missing) {
    const table =
        typeof base.getTableByNameIfExists === 'function'
            ? base.getTableByNameIfExists(tableName)
            : base.tables.find(t => t.name === tableName) || null;
    if (!table) {
        missing.push({table: tableName, field: null});
        return {table: null, fields: {}};
    }
    const fields = {};
    for (const [key, fieldName] of Object.entries(fieldSpec)) {
        const f =
            typeof table.getFieldByNameIfExists === 'function'
                ? table.getFieldByNameIfExists(fieldName)
                : table.fields.find(x => x.name === fieldName) || null;
        if (!f) missing.push({table: tableName, field: fieldName});
        fields[key] = f;
    }
    return {table, fields};
}

// ─── The model hook ───────────────────────────────────────────────────────────
// Binds everything, loads all six tables, and returns plain JS objects + the
// derived aggregates the dashboards need. One hook, called once at the top.
export function useModel() {
    const base = useBase();

    const missing = [];
    const teams = bindTable(base, TABLES.teams, FIELDS.teams, missing);
    const stages = bindTable(base, TABLES.stages, FIELDS.stages, missing);
    const features = bindTable(base, TABLES.features, FIELDS.features, missing);
    const attributes = bindTable(base, TABLES.attributes, FIELDS.attributes, missing);
    const stageTasks = bindTable(base, TABLES.stageTasks, FIELDS.stageTasks, missing);
    const handshakes = bindTable(base, TABLES.handshakes, FIELDS.handshakes, missing);

    // Hooks must run unconditionally and in stable order — load every table
    // (null tables yield null record sets, handled below).
    const teamRecords = useRecords(teams.table);
    const stageRecords = useRecords(stages.table);
    const featureRecords = useRecords(features.table);
    const attributeRecords = useRecords(attributes.table);
    const taskRecords = useRecords(stageTasks.table);
    const handshakeRecords = useRecords(handshakes.table);

    return useMemo(() => {
        const coreMissingTables = missing.filter(m => m.field === null);
        const ready =
            stageTasks.table && stages.table && attributes.table && features.table;

        // ── Stages keyed by code ──
        const stagesByCode = {};
        (stageRecords || []).forEach(r => {
            const code = str(r, stages.fields.code);
            stagesByCode[code] = {
                id: r.id,
                record: r,
                name: str(r, stages.fields.name),
                code,
                phaseGroup: str(r, stages.fields.phaseGroup),
                responsibleTeamId: firstLinkId(r, stages.fields.responsibleTeam),
                responsibleTeamName: str(r, stages.fields.responsibleTeam),
                approverTeamName: str(r, stages.fields.approverTeam),
            };
        });

        // ── Attributes keyed by record id (and by Attribute ID string) ──
        const attrByRecordId = {};
        const attrByAttrId = {};
        (attributeRecords || []).forEach(r => {
            const a = {
                recordId: r.id,
                attributeId: str(r, attributes.fields.attributeId),
                businessName: str(r, attributes.fields.businessName),
                featureName: str(r, attributes.fields.feature),
                sourcingType: str(r, attributes.fields.sourcingType),
                isReferenceData: bool(r, attributes.fields.isReferenceData),
                requiresGateway: bool(r, attributes.fields.requiresGateway),
            };
            attrByRecordId[r.id] = a;
            if (a.attributeId) attrByAttrId[a.attributeId] = a;
        });

        // ── Teams ──
        const teamNames = (teamRecords || []).map(r => str(r, teams.fields.name)).filter(Boolean).sort();

        // ── Stage Tasks → rich objects ──
        const tasks = [];
        const tasksByKey = {}; // `${attrKey}|${code}` → task
        (taskRecords || []).forEach(r => {
            const attrLinkId = firstLinkId(r, stageTasks.fields.attribute);
            const attrIdStr = str(r, stageTasks.fields.attribute);
            const attr =
                (attrLinkId && attrByRecordId[attrLinkId]) ||
                attrByAttrId[attrIdStr] ||
                null;
            const featureName =
                str(r, stageTasks.fields.feature) || (attr ? attr.featureName : '');
            const acceptance = parseAcceptance(str(r, stageTasks.fields.acceptanceCriteria));
            const status = str(r, stageTasks.fields.status);
            const approvalStatus = str(r, stageTasks.fields.approvalStatus);
            const stageCode = str(r, stageTasks.fields.stageCode);
            const t = {
                id: r.id,
                record: r,
                taskId: str(r, stageTasks.fields.taskId),
                attrKey: attr ? attr.recordId : attrIdStr,
                attr,
                attributeBusinessName: attr ? attr.businessName : str(r, stageTasks.fields.attribute),
                featureName,
                stageCode,
                stageName: str(r, stageTasks.fields.stage),
                phaseGroup: str(r, stageTasks.fields.phaseGroup) || (stagesByCode[stageCode] || {}).phaseGroup || '',
                assignedTeamName: str(r, stageTasks.fields.assignedTeam),
                assignedTeamId: firstLinkId(r, stageTasks.fields.assignedTeam),
                assignee: str(r, stageTasks.fields.assignee),
                status,
                environment: str(r, stageTasks.fields.environment),
                acceptance,
                acceptanceMet: bool(r, stageTasks.fields.acceptanceMet),
                approverTeamName: str(r, stageTasks.fields.approverTeam),
                approvalStatus,
                comments: str(r, stageTasks.fields.comments),
                blockedReason: str(r, stageTasks.fields.blockedReason),
                dueDate: str(r, stageTasks.fields.dueDate),
            };
            // Path-derived flags.
            t.nextCode = attr ? nextStageCode(attr, stageCode) : null;
            t.prevCode = attr ? prevStageCode(attr, stageCode) : null;
            t.hasNext = !!t.nextCode;
            t.isActive = ACTIVE_STATUSES.includes(status);
            t.isBlocked = status === STATUS.blocked;
            t.isAwaitingReview =
                status === STATUS.submitted || approvalStatus === APPROVAL.pending;
            t.isReadyToPush = status === STATUS.approved && t.hasNext;
            tasks.push(t);
            tasksByKey[`${t.attrKey}|${stageCode}`] = t;
        });

        // Dependency validator (§9): derive "upstream" from path order since
        // Upstream Task isn't seeded. Flag when this task is active/in-progress
        // but its predecessor in the attribute path isn't Done.
        tasks.forEach(t => {
            t.dependencyWarning = false;
            if (!t.attr || !t.prevCode) return;
            if (t.status !== STATUS.inProgress && t.status !== STATUS.submitted) return;
            const up = tasksByKey[`${t.attrKey}|${t.prevCode}`];
            if (up && up.status !== STATUS.done && up.status !== STATUS.approved) {
                t.dependencyWarning = true;
            }
        });

        // ── Feature aggregates + Feature×Phase matrix (§4/§5) ──
        const featureOrder = (featureRecords || [])
            .map(r => str(r, features.fields.name))
            .filter(Boolean);
        const byFeature = {};
        featureOrder.forEach(f => {
            byFeature[f] = {total: 0, done: 0, phase: {}};
            PHASE_GROUPS.forEach(p => (byFeature[f].phase[p] = 0));
        });
        tasks.forEach(t => {
            const f = t.featureName;
            if (!byFeature[f]) {
                byFeature[f] = {total: 0, done: 0, phase: {}};
                PHASE_GROUPS.forEach(p => (byFeature[f].phase[p] = 0));
            }
            byFeature[f].total += 1;
            if (t.status === STATUS.done) byFeature[f].done += 1;
            if (t.phaseGroup && byFeature[f].phase[t.phaseGroup] != null) {
                byFeature[f].phase[t.phaseGroup] += 1;
            }
        });
        Object.values(byFeature).forEach(v => {
            v.pct = v.total ? Math.round((v.done / v.total) * 100) : 0;
        });

        // ── KPI strip (§5) ──
        const phaseCounts = {};
        PHASE_GROUPS.forEach(p => (phaseCounts[p] = 0));
        tasks.forEach(t => {
            if (t.isActive && phaseCounts[t.phaseGroup] != null) phaseCounts[t.phaseGroup] += 1;
        });
        const deliveredFeatures = Object.values(byFeature).filter(v => v.total && v.pct === 100).length;
        const totalDone = tasks.filter(t => t.status === STATUS.done).length;
        const kpis = {
            active: tasks.filter(t => t.isActive).length,
            awaitingReview: tasks.filter(t => t.isAwaitingReview).length,
            blocked: tasks.filter(t => t.isBlocked).length,
            readyToPush: tasks.filter(t => t.isReadyToPush).length,
            deliveredFeatures,
            overallPct: tasks.length ? Math.round((totalDone / tasks.length) * 100) : 0,
        };

        // ── Handshakes, newest first ──
        const handshakeList = (handshakeRecords || [])
            .map(r => ({
                id: r.id,
                handshakeId: str(r, handshakes.fields.handshakeId),
                feature: str(r, handshakes.fields.feature),
                attribute: str(r, handshakes.fields.attribute),
                stage: str(r, handshakes.fields.stage),
                fromTeam: str(r, handshakes.fields.fromTeam),
                toTeam: str(r, handshakes.fields.toTeam),
                action: str(r, handshakes.fields.action),
                decisionMaker: str(r, handshakes.fields.decisionMaker),
                timestamp: str(r, handshakes.fields.timestamp),
            }))
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

        return {
            ready,
            missing,
            coreMissingTables,
            // raw tables + resolved fields for write actions
            tablesRaw: {
                stageTasks: stageTasks.table,
                handshakes: handshakes.table,
            },
            fieldsRaw: {
                stageTasks: stageTasks.fields,
                handshakes: handshakes.fields,
            },
            stagesByCode,
            attrByRecordId,
            teamNames,
            featureOrder,
            tasks,
            tasksByKey,
            byFeature,
            phaseCounts,
            kpis,
            handshakes: handshakeList,
            loading: ready && taskRecords === null,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        teamRecords,
        stageRecords,
        featureRecords,
        attributeRecords,
        taskRecords,
        handshakeRecords,
    ]);
}

// Convenience: tasks for a given team (assigned to them).
export function tasksForTeam(tasks, teamName) {
    return tasks.filter(t => t.assignedTeamName === teamName);
}
// Tasks where this team is the approver and a decision is pending.
export function pendingApprovalsForTeam(tasks, teamName) {
    return tasks.filter(
        t => t.approverTeamName === teamName && t.approvalStatus === APPROVAL.pending,
    );
}
