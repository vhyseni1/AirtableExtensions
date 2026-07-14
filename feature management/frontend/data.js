import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {
    TABLES,
    FIELDS,
    STATUS,
    APPROVAL,
    PHASE_GROUPS,
    ACTIVE_STATUSES,
    attributePath,
    nextStageCode,
    maturityFraction,
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
// Collaborator / linked names → array of display strings.
export function names(record, field) {
    return links(record, field).map(x => x && (x.name || x.email)).filter(Boolean);
}

// Acceptance Criteria: JSON array stored as a string in a long-text cell.
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
export function useModel() {
    const base = useBase();

    const missing = [];
    const teams = bindTable(base, TABLES.teams, FIELDS.teams, missing);
    const features = bindTable(base, TABLES.features, FIELDS.features, missing);
    const attributes = bindTable(base, TABLES.attributes, FIELDS.attributes, missing);
    const stages = bindTable(base, TABLES.stages, FIELDS.stages, missing);
    const handshakes = bindTable(base, TABLES.handshakes, FIELDS.handshakes, missing);

    const teamRecords = useRecords(teams.table);
    const featureRecords = useRecords(features.table);
    const attributeRecords = useRecords(attributes.table);
    const stageRecords = useRecords(stages.table);
    const handshakeRecords = useRecords(handshakes.table);

    return useMemo(() => {
        const coreMissingTables = missing.filter(
            m => m.field === null && m.table !== TABLES.handshakes,
        );
        const ready = attributes.table && features.table && stages.table;

        // ── Stages reference ──
        const stagesByCode = {};
        const stagesByRecordId = {};
        const stagesByName = {};
        (stageRecords || []).forEach(r => {
            const s = {
                id: r.id,
                record: r,
                name: str(r, stages.fields.name),
                code: str(r, stages.fields.code),
                phaseGroup: str(r, stages.fields.phaseGroup),
                responsibleTeamId: firstLinkId(r, stages.fields.responsibleTeam),
                responsibleTeamName: str(r, stages.fields.responsibleTeam),
                approverTeamId: firstLinkId(r, stages.fields.approverTeam),
                approverTeamName: str(r, stages.fields.approverTeam),
            };
            if (s.code) stagesByCode[s.code] = s;
            stagesByRecordId[r.id] = s;
            if (s.name) stagesByName[s.name] = s;
        });

        // ── Teams (+ user rosters) ──
        const teamList = (teamRecords || []).map(r => ({
            id: r.id,
            name: str(r, teams.fields.name),
            users: names(r, teams.fields.users),
        }));
        const teamNames = teamList.map(t => t.name).filter(Boolean).sort();
        const usersByTeam = {};
        teamList.forEach(t => (usersByTeam[t.name] = t.users));

        // ── Features (+ Initiative grouping) ──
        const featureList = (featureRecords || []).map(r => ({
            id: r.id,
            record: r,
            name: str(r, features.fields.name),
            initiative: str(r, features.fields.initiative) || 'Ungrouped',
            owningTeam: str(r, features.fields.owningTeam),
            status: str(r, features.fields.status),
            priority: str(r, features.fields.priority),
            goLive: str(r, features.fields.goLive),
        }));
        const featureOrder = featureList.map(f => f.name).filter(Boolean);

        // ── Attributes = work items ──
        const attrs = (attributeRecords || []).map(r => {
            const stageLinkId = firstLinkId(r, attributes.fields.currentStage);
            const stage =
                (stageLinkId && stagesByRecordId[stageLinkId]) ||
                stagesByName[str(r, attributes.fields.currentStage)] ||
                null;
            const sourcingType = str(r, attributes.fields.sourcingType);
            const requiresGateway = bool(r, attributes.fields.requiresGateway);
            const currentCode = stage ? stage.code : '';
            const status = str(r, attributes.fields.status);
            const approvalStatus = str(r, attributes.fields.approvalStatus);
            const acceptance = parseAcceptance(str(r, attributes.fields.acceptanceCriteria));
            const pathAttr = {sourcingType, requiresGateway};
            const a = {
                id: r.id,
                record: r,
                attributeId: str(r, attributes.fields.attributeId),
                businessName: str(r, attributes.fields.businessName),
                featureName: str(r, attributes.fields.feature),
                featureId: firstLinkId(r, attributes.fields.feature),
                sourcingType,
                requiresGateway,
                isReferenceData: bool(r, attributes.fields.isReferenceData),
                stage,
                currentCode,
                currentStageName: stage ? stage.name : str(r, attributes.fields.currentStage),
                phase: stage ? stage.phaseGroup : '',
                status,
                assignee: str(r, attributes.fields.assignee),
                assignedTeamName: str(r, attributes.fields.assignedTeam),
                assignedTeamId: firstLinkId(r, attributes.fields.assignedTeam),
                approverTeamName: str(r, attributes.fields.approverTeam),
                approverTeamId: firstLinkId(r, attributes.fields.approverTeam),
                approvalStatus,
                acceptance,
                acceptanceMet: bool(r, attributes.fields.acceptanceMet) || allAcceptanceMet(acceptance),
                environment: str(r, attributes.fields.environment),
                dueDate: str(r, attributes.fields.dueDate),
                blockedReason: str(r, attributes.fields.blockedReason),
                addressedByIds: links(r, attributes.fields.addressedBy).map(x => x.id),
                forksIntoIds: links(r, attributes.fields.forksInto).map(x => x.id),
            };
            a.nextCode = nextStageCode(pathAttr, currentCode);
            a.hasNext = !!a.nextCode;
            a.maturity = maturityFraction(pathAttr, currentCode);
            a.isActive = ACTIVE_STATUSES.includes(status);
            a.isBlocked = status === STATUS.blocked;
            a.isAwaitingReview = status === STATUS.submitted || approvalStatus === APPROVAL.pending;
            a.isReadyToPush =
                a.hasNext &&
                (status === STATUS.approved || (status === STATUS.inProgress && a.acceptanceMet));
            a.isDelivered = !a.hasNext && status === STATUS.done;
            return a;
        });

        // ── Resolve self-referential attribute links to attribute objects ──
        const attrById = {};
        attrs.forEach(a => (attrById[a.id] = a));
        const resolveRel = ids => (ids || []).map(id => attrById[id]).filter(Boolean);
        attrs.forEach(a => {
            a.addressedBy = resolveRel(a.addressedByIds);
            a.forksInto = resolveRel(a.forksIntoIds);
            a.hasRelations = a.addressedBy.length > 0 || a.forksInto.length > 0;
        });

        // Forked children whose Feature cell is empty inherit the parent's
        // feature for display/aggregation, so a fork never renders as
        // "Unassigned" and children sit in the parent's lane. (A few passes
        // cover fork-of-fork chains.)
        for (let pass = 0; pass < 3; pass++) {
            let changed = false;
            attrs.forEach(p => {
                if (!p.featureName) return;
                p.forksInto.forEach(c => {
                    if (!c.featureName) { c.featureName = p.featureName; changed = true; }
                });
            });
            if (!changed) break;
        }

        // ── Per-feature aggregates + maturity ──
        const byFeature = {};
        const ensureFeature = f => {
            if (!byFeature[f]) {
                byFeature[f] = {total: 0, delivered: 0, blocked: 0, awaiting: 0, ready: 0, maturitySum: 0, phase: {}, furthest: -1};
                PHASE_GROUPS.forEach(p => (byFeature[f].phase[p] = 0));
            }
            return byFeature[f];
        };
        featureOrder.forEach(ensureFeature);
        attrs.forEach(a => {
            const v = ensureFeature(a.featureName || 'Unassigned');
            v.total += 1;
            v.maturitySum += a.maturity;
            if (a.isDelivered) v.delivered += 1;
            if (a.isBlocked) v.blocked += 1;
            if (a.isAwaitingReview) v.awaiting += 1;
            if (a.isReadyToPush) v.ready += 1;
            if (a.phase && v.phase[a.phase] != null) {
                v.phase[a.phase] += 1;
                v.furthest = Math.max(v.furthest, PHASE_GROUPS.indexOf(a.phase));
            }
        });
        Object.values(byFeature).forEach(v => {
            v.pct = v.total ? Math.round((v.maturitySum / v.total) * 100) : 0;
            v.furthestPhase = v.furthest >= 0 ? PHASE_GROUPS[v.furthest] : null;
        });

        // ── Per-feature health (drives the executive RAG status) ──
        const todayMs = Date.now();
        const parseDate = s => {
            const t = s ? Date.parse(s) : NaN;
            return Number.isNaN(t) ? null : t;
        };
        featureList.forEach(f => {
            const v = byFeature[f.name] || {total: 0, pct: 0, blocked: 0, awaiting: 0, ready: 0};
            f.pct = v.pct || 0;
            f.total = v.total || 0;
            f.blocked = v.blocked || 0;
            f.awaiting = v.awaiting || 0;
            f.ready = v.ready || 0;
            f.goLiveMs = parseDate(f.goLive);
            const overdue = f.goLiveMs != null && f.goLiveMs < todayMs && f.pct < 100;
            f.health = f.pct >= 100 ? 'delivered' : f.blocked > 0 ? 'blocked' : overdue ? 'at-risk' : 'on-track';
        });

        // ── Initiative → features ──
        const initiatives = {};
        featureList.forEach(f => {
            (initiatives[f.initiative] = initiatives[f.initiative] || []).push(f);
        });

        // ── Per-initiative aggregates (executive view) ──
        const byInitiative = Object.keys(initiatives).map(name => {
            const feats = initiatives[name];
            const featAttrTotal = feats.reduce((s, f) => s + f.total, 0);
            const pctWeighted = featAttrTotal
                ? Math.round(feats.reduce((s, f) => s + f.pct * f.total, 0) / featAttrTotal)
                : Math.round(feats.reduce((s, f) => s + f.pct, 0) / (feats.length || 1));
            const goLives = feats.map(f => f.goLiveMs).filter(x => x != null);
            return {
                name,
                features: feats,
                featureCount: feats.length,
                attrCount: featAttrTotal,
                pct: pctWeighted,
                blocked: feats.reduce((s, f) => s + f.blocked, 0),
                awaiting: feats.reduce((s, f) => s + f.awaiting, 0),
                ready: feats.reduce((s, f) => s + f.ready, 0),
                delivered: feats.filter(f => f.health === 'delivered').length,
                atRisk: feats.filter(f => f.health === 'at-risk' || f.health === 'blocked').length,
                onTrack: feats.filter(f => f.health === 'on-track').length,
                nextGoLiveMs: goLives.length ? Math.min(...goLives) : null,
            };
        }).sort((a, b) => (a.name === 'Ungrouped' ? 1 : b.name === 'Ungrouped' ? -1 : a.name.localeCompare(b.name)));

        // ── Overall phase distribution (every attribute sits in one phase) ──
        const phaseCounts = {};
        PHASE_GROUPS.forEach(p => (phaseCounts[p] = 0));
        attrs.forEach(a => {
            if (a.phase && phaseCounts[a.phase] != null) phaseCounts[a.phase] += 1;
        });

        // ── KPIs ──
        const maturityAvg = attrs.length
            ? attrs.reduce((s, a) => s + a.maturity, 0) / attrs.length
            : 0;
        const deliveredFeatures = Object.values(byFeature).filter(v => v.total && v.pct >= 100).length;
        const kpis = {
            active: attrs.filter(a => a.isActive).length,
            awaitingReview: attrs.filter(a => a.isAwaitingReview).length,
            blocked: attrs.filter(a => a.isBlocked).length,
            readyToPush: attrs.filter(a => a.isReadyToPush).length,
            deliveredFeatures,
            overallPct: Math.round(maturityAvg * 100),
        };

        // ── Handshakes, newest first ──
        const handshakeList = (handshakeRecords || [])
            .map(r => ({
                id: r.id,
                record: r,
                feature: str(r, handshakes.fields.feature),
                attribute: str(r, handshakes.fields.attribute),
                stage: str(r, handshakes.fields.stage),
                fromTeam: str(r, handshakes.fields.fromTeam),
                toTeam: str(r, handshakes.fields.toTeam),
                action: str(r, handshakes.fields.action),
                decisionMaker: str(r, handshakes.fields.decisionMaker),
                timestamp: str(r, handshakes.fields.timestamp),
                comments: str(r, handshakes.fields.comments),
                cycleNumber: str(r, handshakes.fields.cycleNumber),
            }))
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

        return {
            ready,
            missing,
            coreMissingTables,
            tablesRaw: {attributes: attributes.table, handshakes: handshakes.table},
            fieldsRaw: {attributes: attributes.fields, handshakes: handshakes.fields},
            stagesByCode,
            teamNames,
            usersByTeam,
            features: featureList,
            featureOrder,
            initiatives,
            byInitiative,
            attrs,
            byFeature,
            phaseCounts,
            kpis,
            handshakes: handshakeList,
            loading: ready && attributeRecords === null,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamRecords, featureRecords, attributeRecords, stageRecords, handshakeRecords]);
}

// Attributes whose work currently sits with this team.
export function attrsForTeam(attrs, teamName) {
    return attrs.filter(a => a.assignedTeamName === teamName);
}
// Attributes pending this team's approval.
export function pendingApprovalsForTeam(attrs, teamName) {
    return attrs.filter(a => a.approverTeamName === teamName && a.approvalStatus === APPROVAL.pending);
}

// Build an attribute's ordered stage path as Stage objects (for promote/next).
export function pathStages(model, attr) {
    return attributePath({sourcingType: attr.sourcingType, requiresGateway: attr.requiresGateway})
        .map(code => model.stagesByCode[code])
        .filter(Boolean);
}
