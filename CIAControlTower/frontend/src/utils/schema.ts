export const TABLE_NAME = 'Impacts';

export const FIELDS = {
    id: 'ID',
    validationStatus: 'Validation_Status',
    sourceRun: 'Source_Run',
    businessArchetypes: 'Business_Archetypes',
    affiliate: 'Affiliate',
    role: 'Role',
    persona: 'Persona (from Role)',
    changeCategory: 'Change_Category',
    changeComponent: 'Change_Component',
    descriptionAsIs: 'Description_As-Is',
    descriptionToBe: 'Description_To-Be',
    changeImpact: 'Change_Impact',
    confidence: 'Confidence',
    tags: 'Tags',
    sourceQuote: 'Source_Quote',
    sourceDoc: 'Source_Doc',
    actionRequired: 'Action_Required',
    responsible: 'Responsible',
    eclStream: 'ECL_Stream',
    actionOwner: 'Action_Owner',
    timeline: 'Timeline',
    dependencies: 'Dependencies',
    notes: 'Notes',
} as const;

export const REQUIRED_FIELD_LIST: ReadonlyArray<string> = Object.values(FIELDS);

export type FieldKey = keyof typeof FIELDS;

/**
 * Accepted column names per logical field, newest canonical first. Lets the
 * extension read both the current framework output and older bases:
 *  - Workstream (new) / ECL_Stream (old)
 *  - Role is plain text now; Persona is optional (older bases had the lookup)
 */
export const FIELD_CANDIDATES: Record<FieldKey, ReadonlyArray<string>> = {
    id: ['ID'],
    validationStatus: ['Validation_Status'],
    sourceRun: ['Source_Run'],
    businessArchetypes: ['Business_Archetypes'],
    affiliate: ['Affiliate'],
    role: ['Role'],
    persona: ['Persona (from Role)', 'Persona'],
    changeCategory: ['Change_Category'],
    changeComponent: ['Change_Component'],
    descriptionAsIs: ['Description_As-Is'],
    descriptionToBe: ['Description_To-Be'],
    changeImpact: ['Change_Impact'],
    confidence: ['Confidence'],
    tags: ['Tags'],
    sourceQuote: ['Source_Quote'],
    sourceDoc: ['Source_Doc'],
    actionRequired: ['Action_Required'],
    responsible: ['Responsible'],
    eclStream: ['Workstream', 'ECL_Stream'],
    actionOwner: ['Action_Owner'],
    timeline: ['Timeline'],
    dependencies: ['Dependencies'],
    notes: ['Notes'],
};

/** Minimal set the dashboard genuinely needs. Everything else is optional. */
export const CORE_FIELD_KEYS: ReadonlyArray<FieldKey> = [
    'validationStatus',
    'affiliate',
    'role',
    'changeCategory',
    'changeComponent',
    'changeImpact',
    'confidence',
    'tags',
    'businessArchetypes',
];

/** First present candidate name for a field, or null if none exists. */
export function resolveFieldName(present: ReadonlySet<string>, candidates: ReadonlyArray<string>): string | null {
    const lower = new Map<string, string>();
    for (const n of present) lower.set(n.toLowerCase(), n);
    for (const c of candidates) {
        const hit = lower.get(c.toLowerCase());
        if (hit) return hit;
    }
    return null;
}

/** Resolve every logical field to the actual column name in this table. */
export function resolveFields(present: ReadonlySet<string>): Record<FieldKey, string | null> {
    const out = {} as Record<FieldKey, string | null>;
    (Object.keys(FIELD_CANDIDATES) as FieldKey[]).forEach(k => {
        out[k] = resolveFieldName(present, FIELD_CANDIDATES[k]);
    });
    return out;
}

/** Canonical names of the core fields missing from this table. */
export function missingCoreFields(present: ReadonlySet<string>): string[] {
    return CORE_FIELD_KEYS.filter(k => !resolveFieldName(present, FIELD_CANDIDATES[k])).map(k => FIELD_CANDIDATES[k][0]!);
}

/**
 * Optional access-control fields. When present in the table the dashboard
 * enforces per-user access: a viewer sees a record only if they created it
 * (Created) or were granted access to it (Accessible by). When NEITHER field
 * exists, no gating is applied and the whole data set is shown. Names are
 * matched case-insensitively against the first candidate that exists.
 */
export const CREATED_FIELD_CANDIDATES: ReadonlyArray<string> = [
    'Created',
    'Created By',
    'Created by',
    'Created_By',
    'Creator',
];
export const ACCESSIBLE_FIELD_CANDIDATES: ReadonlyArray<string> = [
    'Accessible by',
    'Accessible By',
    'Accessible_by',
    'Accessible_By',
    'Accessible',
];

/**
 * Persona values are auto-derived from Role in Airtable; the framework-listed
 * PJP/HCD/HSP/GSCL/CSR/Admin set is a starting reference only. Real bases
 * may surface different lookup values (e.g. "Primary Point of Contact",
 * "BI & Analytics", "Admin"). Treat Persona as free-form string and source
 * the list of values from the actual data.
 */
export type Persona = string;

export const CHANGE_CATEGORIES = [
    'Process & Workflow',
    'Technology & Integration',
    'Data Ownership & Integrity',
    'Analytics & Measurements',
    'Roles & Responsibilities',
    'Skill & Capability',
    'Mindset & Cultural Sentiment',
    'Engagement & Communication',
] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export const AFFILIATES = ['Global', 'DE', 'UK', 'FR', 'ES', 'IT', 'CA', 'BR'] as const;
export type Affiliate = (typeof AFFILIATES)[number];

export const BUSINESS_ARCHETYPES = [
    'i8 First Mover',
    'i7 First Mover',
    'i8',
    'i7',
    'Global Function',
] as const;
export type BusinessArchetype = (typeof BUSINESS_ARCHETYPES)[number];

export const CHANGE_IMPACTS = ['High', 'Medium', 'Low'] as const;
export type ChangeImpact = (typeof CHANGE_IMPACTS)[number];

export const CONFIDENCES = ['High', 'Medium', 'Low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const TAGS = ['Heatmap', 'Pressure', 'Gap', 'Friction'] as const;
export type Tag = (typeof TAGS)[number];

export const VALIDATION_STATUSES = ['Pending', 'Reviewed', 'Discarded'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const RESPONSIBLES = ['ECL Workstream', 'ELEVATE Program', 'Beyond ELEVATE'] as const;
export type Responsible = (typeof RESPONSIBLES)[number];

export const ECL_STREAMS = ['Comms', 'Change', 'Training', 'Other'] as const;
export type EclStream = (typeof ECL_STREAMS)[number];

export interface Impact {
    /** Airtable internal record id (used by expandRecord) */
    id: string;
    /** The user-facing ID column from the table (integer) */
    recordNumber: number | null;
    validationStatus: ValidationStatus | null;
    sourceRun: string;
    businessArchetypes: BusinessArchetype[];
    affiliate: Affiliate | null;
    role: string;
    /** Auto-derived in Airtable from Role */
    persona: Persona | null;
    changeCategory: ChangeCategory | null;
    changeComponent: string;
    descriptionAsIs: string;
    descriptionToBe: string;
    changeImpact: ChangeImpact | null;
    confidence: Confidence | null;
    tags: Tag[];
    sourceQuote: string;
    sourceDoc: string;
    actionRequired: string;
    responsible: Responsible | null;
    eclStream: EclStream | null;
    actionOwner: string;
    timeline: string;
    dependencies: string;
    notes: string;
    /**
     * Lower-cased collaborator ids and emails allowed to view this record —
     * the creator plus anyone in "Accessible by". Empty when the table has no
     * access fields (no gating). Used by the access filter in Dashboard.
     */
    accessKeys: string[];
}

export const CHANGE_IMPACT_WEIGHT: Record<ChangeImpact, number> = {High: 3, Medium: 2, Low: 1};
