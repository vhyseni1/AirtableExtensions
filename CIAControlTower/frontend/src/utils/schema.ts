export const TABLE_NAME = 'Impacts';

export const FIELDS = {
    rowId: 'Row_ID',
    validationStatus: 'Validation_Status',
    sourceRun: 'Source_Run',
    category: 'Category',
    impactLens: 'Impact_Lens',
    affiliateCountry: 'Affiliate_Country',
    persona: 'Persona',
    component: 'Component',
    description: 'Description',
    severity: 'Severity',
    tags: 'Tags',
    confidence: 'Confidence',
    sourceQuote: 'Source_Quote',
    sourceDoc: 'Source_Doc',
    actionRequired: 'Action_Required',
    responsible: 'Responsible',
    actionOwner: 'Action_Owner',
    timeline: 'Timeline',
    dependencies: 'Dependencies',
    notes: 'Notes',
    reviewerNotes: 'Reviewer_Notes',
} as const;

export const REQUIRED_FIELD_LIST: ReadonlyArray<string> = Object.values(FIELDS);

export const PERSONAS = ['PJP', 'HCD', 'HSP', 'GSCL', 'CSR', 'Admin'] as const;
export type Persona = (typeof PERSONAS)[number];

export const CATEGORIES = [
    'Process & Workflow',
    'Technology & Integration',
    'Data Ownership & Integrity',
    'Analytics & Measurements',
    'Role & Responsibility',
    'Skill & Capability',
    'Mindset & Cultural Sentiment',
    'Engagement & Communication',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LENSES = ['Global', 'MWM', 'Affiliate'] as const;
export type Lens = (typeof LENSES)[number];

export const SEVERITIES = ['High', 'Medium', 'Low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ['High', 'Medium', 'Low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const TAGS = ['Heatmap', 'Pressure', 'Gap', 'Friction'] as const;
export type Tag = (typeof TAGS)[number];

export const VALIDATION_STATUSES = ['Pending', 'Reviewed', 'Discarded'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export interface Impact {
    id: string;
    rowId: number | null;
    validationStatus: ValidationStatus | null;
    sourceRun: string;
    category: Category | null;
    lens: Lens | null;
    affiliateCountry: string | null;
    persona: Persona | null;
    component: string;
    description: string;
    severity: Severity | null;
    tags: Tag[];
    confidence: Confidence | null;
    sourceQuote: string;
    sourceDoc: string;
    actionRequired: string;
    responsible: string | null;
    actionOwner: string;
    timeline: string;
    dependencies: string;
    notes: string;
    reviewerNotes: string;
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {High: 3, Medium: 2, Low: 1};
