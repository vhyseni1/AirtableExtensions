// ─── Field contract ──────────────────────────────────────────────────────────
// Binding surface between this extension and the live Airtable base. Every
// literal must match the base VERBATIM (punctuation included). Change the base,
// change it here — never let them drift. The setup banner (components.js) lists
// any mismatch at runtime.
//
// Model (5 tables, Attributes-centric):
//   Teams       — teams AND their users (multi-collaborator field)
//   Features    — grouped per Initiative (a field)
//   Attributes  — the WORK ITEM: one row per attribute, carrying its Current
//                 Stage (link→Stages) + status/assignee/dates. No Stage Tasks.
//   Stages      — thin reference ladder: order, phase, responsible/approver team
//   Handshakes  — audit log of every promote / accept / return

export const TABLES = {
    teams: 'Teams',
    entities: 'Entities',
    initiatives: 'Initiatives',
    features: 'Features',
    attributes: 'Attributes',
    stages: 'Stages',
    handshakes: 'Handshakes',
};

export const FIELDS = {
    teams: {
        name: 'Team Name',
        users: 'Users', // multiple collaborators
        domain: 'Domain',
        tool: 'Tool / Environment',
        email: 'Email',
    },
    entities: {
        name: 'Entity Name',
        code: 'Legal Entity Code',
        region: 'Region',
    },
    initiatives: {
        name: 'Initiative Name',
        entity: 'Entity', // link → Entities
        sponsor: 'Sponsor',
        status: 'Status',
    },
    features: {
        name: 'Feature Name',
        initiative: 'Initiative', // link → Initiatives (name resolved via the link)
        owningTeam: 'Owning Team',
        status: 'Status',
        priority: 'Priority',
        goLive: 'Target Go-Live Date',
        kdo: 'Business Outcome / KDO Description',
    },
    // The work item. Current Stage is a LINK to Stages (one source of truth for
    // a stage's code/phase/teams). Workflow fields live here (no Stage Tasks).
    attributes: {
        attributeId: 'Attribute ID',
        businessName: 'Business Name',
        technicalName: 'Technical Name',
        fsdm: 'FSDM Mapping',
        feature: 'Feature',
        sourcingType: 'Sourcing Type',
        isReferenceData: 'Is Reference Data',
        requiresGateway: 'Requires Gateway Derivation',
        currentStage: 'Current Stage', // link → Stages
        status: 'Status',
        assignee: 'Assignee', // collaborator
        assignedTeam: 'Assigned Team',
        approverTeam: 'Approver Team',
        approvalStatus: 'Approval Status',
        acceptanceCriteria: 'Acceptance Criteria', // JSON-in-long-text
        acceptanceMet: 'Acceptance Met?',
        environment: 'Environment',
        startedDate: 'Started Date',
        completedDate: 'Completed Date',
        dueDate: 'Due Date',
        blockedReason: 'Blocked Reason',
        comments: 'Comments / Handoff Notes',
        cycleNumber: 'Cycle Number',
        // Self-referential links (Attributes → Attributes). Optional — absent
        // fields read as empty. "Addressed By" = other attributes that resolve
        // this one; "Forks Into" = downstream attributes this one spawns.
        addressedBy: 'Addressed By',
        forksInto: 'Forks Into',
    },
    stages: {
        name: 'Stage Name',
        code: 'Stage Code',
        order: 'Order',
        phaseGroup: 'Phase Group',
        responsibleTeam: 'Responsible Team',
        approverTeam: 'Approver Team',
    },
    handshakes: {
        handshakeId: 'Handshake ID',
        attribute: 'Attribute',
        feature: 'Feature',
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

// ─── Phase groups (canonical left→right order) + colors ───────────────────────
export const PHASE_GROUPS = [
    'Requirements',
    'Modelling',
    'Transformation',
    'Sourcing',
    'Sub-ledger',
    'Calculate',
    'Report',
];

// Validated categorical palette (dataviz six checks: lightness band, chroma
// floor, adjacent-pair CVD, contrast). Amber↔orange sits in the CVD floor band,
// which is legal because phase colors are always paired with direct labels and
// fills keep a 2px surface gap.
export const PHASE_COLORS = {
    Requirements: '#2a78d6',
    Modelling: '#4a3aa7',
    Transformation: '#0d9488',
    Sourcing: '#008300',
    'Sub-ledger': '#eb6834',
    Calculate: '#c28a00',
    Report: '#e34948',
};

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

// ─── Stage path / sourcing branch ─────────────────────────────────────────────
// Business rule (logic, not data): an attribute traverses exactly ONE 5x stage,
// chosen by its Sourcing Type. Maps to the Stages.Stage Code reference values.
export const SOURCING_BRANCH = {
    'Feed-agnostic': '5a',
    'Feed-specific (MOR)': '5b-MOR',
    'Feed-specific (MIDAS)': '5b-MIDAS',
    'Feed-specific (Other)': '5b-Other',
    'Reference Data': '5c',
};

export const SOURCING_CODES = ['5a', '5b-MOR', '5b-MIDAS', '5b-Other', '5c'];

export const ACTIVE_STATUSES = [
    STATUS.inProgress,
    STATUS.blocked,
    STATUS.submitted,
    STATUS.approved,
    STATUS.returned,
];

// Ordered list of stage codes this attribute travels:
//   1 → 2 → 3 → [4 if Requires Gateway] → <one 5x branch> → [6..10 unless Reference Data]
export function attributePath({sourcingType, requiresGateway}) {
    const codes = ['1', '2', '3'];
    if (requiresGateway) codes.push('4');
    const branch = SOURCING_BRANCH[sourcingType] || '5a';
    codes.push(branch);
    if (branch !== '5c') codes.push('6', '7', '8', '9', '10');
    return codes;
}

export function nextStageCode(attr, currentCode) {
    const path = attributePath(attr);
    const i = path.indexOf(currentCode);
    if (i === -1 || i === path.length - 1) return null;
    return path[i + 1];
}

export function prevStageCode(attr, currentCode) {
    const path = attributePath(attr);
    const i = path.indexOf(currentCode);
    if (i <= 0) return null;
    return path[i - 1];
}

// Maturity fraction 0..1 = how far along its own path the attribute has reached.
export function maturityFraction(attr, currentCode) {
    const path = attributePath(attr);
    const i = path.indexOf(currentCode);
    if (i === -1 || path.length <= 1) return 0;
    return i / (path.length - 1);
}
