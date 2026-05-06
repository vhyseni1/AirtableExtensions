export const TABLE_NAME = 'Impacts';

export const FIELDS = {
    id: 'ID',
    validationStatus: 'Validation_Status',
    sourceRun: 'Source_Run',
    businessArchetypes: 'Business_Archetypes',
    affiliate: 'Affiliate',
    role: 'Role',
    persona: 'Persona',
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
    reviewerNotes: 'Reviewer_Notes',
} as const;

export const REQUIRED_FIELD_LIST: ReadonlyArray<string> = Object.values(FIELDS);

export const PERSONAS = ['PJP', 'HCD', 'HSP', 'GSCL', 'CSR', 'Admin'] as const;
export type Persona = (typeof PERSONAS)[number];

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
    reviewerNotes: string;
}

export const CHANGE_IMPACT_WEIGHT: Record<ChangeImpact, number> = {High: 3, Medium: 2, Low: 1};
