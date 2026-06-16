// ─── Field contract ──────────────────────────────────────────────────────────
// The binding surface between this extension and the live Airtable base (Build
// Spec §1/§2). Every literal here must match the base VERBATIM — names with
// `?`, `%`, `/` and the long stage strings are exact-match-sensitive. Change the
// base, change it here, never let the two drift.

export const TABLES = {
    teams: 'Teams',
    stages: 'Stages',
    features: 'Features',
    attributes: 'Attributes',
    stageTasks: 'Stage Tasks',
    handshakes: 'Handshakes',
};

// Fields the extension actually reads/writes, grouped by table. Anything not
// listed is ignored. Missing ones are surfaced in the setup banner (data.js).
export const FIELDS = {
    teams: {
        name: 'Team Name',
        teamId: 'Team ID',
        domain: 'Domain',
    },
    stages: {
        name: 'Stage Name',
        code: 'Stage Code',
        order: 'Order',
        phaseGroup: 'Phase Group',
        responsibleTeam: 'Responsible Team',
        approverTeam: 'Approver Team',
    },
    features: {
        name: 'Feature Name',
        featureId: 'Feature ID',
        owningTeam: 'Owning Team',
        status: 'Status',
        priority: 'Priority',
        goLive: 'Target Go-Live Date',
    },
    attributes: {
        attributeId: 'Attribute ID',
        businessName: 'Business Name',
        feature: 'Feature',
        sourcingType: 'Sourcing Type',
        isReferenceData: 'Is Reference Data',
        requiresGateway: 'Requires Gateway Derivation',
    },
    stageTasks: {
        taskId: 'Task ID',
        attribute: 'Attribute',
        feature: 'Feature',
        stage: 'Stage',
        stageCode: 'Stage Code',
        phaseGroup: 'Phase Group',
        assignedTeam: 'Assigned Team',
        assignee: 'Assignee',
        status: 'Status',
        environment: 'Environment',
        acceptanceCriteria: 'Acceptance Criteria',
        acceptanceMet: 'Acceptance Met?',
        approverTeam: 'Approver Team',
        approvalStatus: 'Approval Status',
        comments: 'Comments / Handoff Notes',
        blockedReason: 'Blocked Reason',
        dueDate: 'Due Date',
        cycleNumber: 'Cycle Number',
    },
    handshakes: {
        handshakeId: 'Handshake ID',
        stageTask: 'Stage Task',
        feature: 'Feature',
        attribute: 'Attribute',
        stage: 'Stage',
        fromTeam: 'From Team',
        toTeam: 'To Team',
        action: 'Action',
        decisionMaker: 'Decision Maker',
        timestamp: 'Timestamp',
        comments: 'Comments',
        cycleNumber: 'Cycle Number',
    },
};

// ─── Single-select option strings (exact) ────────────────────────────────────
export const STATUS = {
    notStarted: 'Not Started',
    inProgress: 'In Progress',
    blocked: 'Blocked',
    submitted: 'Submitted for Review',
    approved: 'Approved',
    returned: 'Rejected / Returned',
    done: 'Done',
    cancelled: 'Cancelled / Not Required',
};

export const APPROVAL = {
    notRequired: 'Not Required',
    pending: 'Pending',
    approved: 'Approved',
    returned: 'Returned with Comments',
    escalated: 'Escalated',
};

export const HANDSHAKE_ACTION = {
    submitted: 'Submitted for Review',
    approved: 'Approved',
    returned: 'Rejected / Returned',
};

export const ENVIRONMENTS = ['N/A', 'DEV', 'UAT', 'PROD'];

// ─── Phase groups (canonical left→right order) + colors (§10) ─────────────────
export const PHASE_GROUPS = [
    'Requirements',
    'Modelling',
    'Transformation',
    'Sourcing',
    'Sub-ledger',
    'Calculate',
    'Report',
];

export const PHASE_COLORS = {
    Requirements: '#4f8cff',
    Modelling: '#a371f7',
    Transformation: '#2dd4bf',
    Sourcing: '#34d399',
    'Sub-ledger': '#fb923c',
    Calculate: '#fbbf24',
    Report: '#f87171',
};

// Status colors (schema's status palette not supplied as a file; these are the
// accessible defaults the UI ships with — tweak to match airtable_schema.md).
export const STATUS_COLORS = {
    'Not Started': '#94a3b8',
    'In Progress': '#3b82f6',
    Blocked: '#ef4444',
    'Submitted for Review': '#f59e0b',
    Approved: '#22c55e',
    'Rejected / Returned': '#fb7185',
    Done: '#16a34a',
    'Cancelled / Not Required': '#6b7280',
};

// ─── Stage path / sourcing branch (§1) ────────────────────────────────────────
// An attribute traverses exactly ONE 5x sourcing stage, chosen by Sourcing Type.
export const SOURCING_BRANCH = {
    'Feed-agnostic': '5a',
    'Feed-specific (MOR)': '5b-MOR',
    'Feed-specific (MIDAS)': '5b-MIDAS',
    'Feed-specific (Other)': '5b-Other',
    'Reference Data': '5c',
};

// Codes that count as the sourcing branch slot.
export const SOURCING_CODES = ['5a', '5b-MOR', '5b-MIDAS', '5b-Other', '5c'];

// Statuses considered "active" (in-flight work, not terminal/idle).
export const ACTIVE_STATUSES = [
    STATUS.inProgress,
    STATUS.blocked,
    STATUS.submitted,
    STATUS.approved,
    STATUS.returned,
];

// Build the ordered list of stage codes an attribute travels, given its flags.
// 1 → 2 → 3 → [4 if gateway] → <one 5x branch> → [6..10 unless Reference Data].
export function attributePath({sourcingType, requiresGateway}) {
    const codes = ['1', '2', '3'];
    if (requiresGateway) codes.push('4');
    const branch = SOURCING_BRANCH[sourcingType] || '5a';
    codes.push(branch);
    if (branch !== '5c') codes.push('6', '7', '8', '9', '10');
    return codes;
}

// The stage code that follows `currentCode` in this attribute's path, or null.
export function nextStageCode(attr, currentCode) {
    const path = attributePath(attr);
    const i = path.indexOf(currentCode);
    if (i === -1 || i === path.length - 1) return null;
    return path[i + 1];
}

// The stage code that precedes `currentCode` in this attribute's path, or null.
// Used by the dependency validator (§9) since Upstream Task isn't seeded.
export function prevStageCode(attr, currentCode) {
    const path = attributePath(attr);
    const i = path.indexOf(currentCode);
    if (i <= 0) return null;
    return path[i - 1];
}
