import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {
    FIELDS,
    REQUIRED_FIELD_LIST,
    TABLE_NAME,
    type Category,
    type Confidence,
    type Impact,
    type Lens,
    type Persona,
    type Severity,
    type Tag,
    type ValidationStatus,
} from '../utils/schema';

const TAG_SET: ReadonlyArray<Tag> = ['Heatmap', 'Pressure', 'Gap', 'Friction'];
const SEVERITY_SET: ReadonlyArray<Severity> = ['High', 'Medium', 'Low'];
const CONFIDENCE_SET: ReadonlyArray<Confidence> = ['High', 'Medium', 'Low'];
const LENS_SET: ReadonlyArray<Lens> = ['Global', 'MWM', 'Affiliate'];
const VALIDATION_SET: ReadonlyArray<ValidationStatus> = ['Pending', 'Reviewed', 'Discarded'];
const PERSONA_SET: ReadonlyArray<Persona> = ['PJP', 'HCD', 'HSP', 'GSCL', 'CSR', 'Admin'];
const CATEGORY_SET: ReadonlyArray<Category> = [
    'Process & Workflow',
    'Technology & Integration',
    'Data Ownership & Integrity',
    'Analytics & Measurements',
    'Role & Responsibility',
    'Skill & Capability',
    'Mindset & Cultural Sentiment',
    'Engagement & Communication',
];

interface AirtableRecord {
    id: string;
    getCellValue(name: string): unknown;
    getCellValueAsString(name: string): string;
}

interface AirtableTable {
    name: string;
    id: string;
    fields: ReadonlyArray<{id: string; name: string}>;
}

function normalizeOne<T extends string>(raw: string, allow: ReadonlyArray<T>): T | null {
    const v = raw.trim();
    if (!v) return null;
    return (allow as ReadonlyArray<string>).includes(v) ? (v as T) : null;
}

function normalizeTags(raw: string): Tag[] {
    if (!raw) return [];
    const parts = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const out: Tag[] = [];
    for (const p of parts) {
        if ((TAG_SET as ReadonlyArray<string>).includes(p)) out.push(p as Tag);
    }
    return out;
}

function rowIdOf(rec: AirtableRecord): number | null {
    const v = rec.getCellValue(FIELDS.rowId);
    if (typeof v === 'number') return v;
    const s = rec.getCellValueAsString(FIELDS.rowId);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function buildImpact(rec: AirtableRecord): Impact {
    return {
        id: rec.id,
        rowId: rowIdOf(rec),
        validationStatus: normalizeOne(rec.getCellValueAsString(FIELDS.validationStatus), VALIDATION_SET),
        sourceRun: rec.getCellValueAsString(FIELDS.sourceRun).trim(),
        category: normalizeOne(rec.getCellValueAsString(FIELDS.category), CATEGORY_SET),
        lens: normalizeOne(rec.getCellValueAsString(FIELDS.impactLens), LENS_SET),
        affiliateCountry: rec.getCellValueAsString(FIELDS.affiliateCountry).trim() || null,
        persona: normalizeOne(rec.getCellValueAsString(FIELDS.persona), PERSONA_SET),
        component: rec.getCellValueAsString(FIELDS.component).trim(),
        description: rec.getCellValueAsString(FIELDS.description),
        severity: normalizeOne(rec.getCellValueAsString(FIELDS.severity), SEVERITY_SET),
        tags: normalizeTags(rec.getCellValueAsString(FIELDS.tags)),
        confidence: normalizeOne(rec.getCellValueAsString(FIELDS.confidence), CONFIDENCE_SET),
        sourceQuote: rec.getCellValueAsString(FIELDS.sourceQuote),
        sourceDoc: rec.getCellValueAsString(FIELDS.sourceDoc),
        actionRequired: rec.getCellValueAsString(FIELDS.actionRequired),
        responsible: rec.getCellValueAsString(FIELDS.responsible).trim() || null,
        actionOwner: rec.getCellValueAsString(FIELDS.actionOwner),
        timeline: rec.getCellValueAsString(FIELDS.timeline),
        dependencies: rec.getCellValueAsString(FIELDS.dependencies),
        notes: rec.getCellValueAsString(FIELDS.notes),
        reviewerNotes: rec.getCellValueAsString(FIELDS.reviewerNotes),
    };
}

export interface UseImpactsResult {
    table: AirtableTable | null;
    impacts: Impact[];
    missingFields: string[];
    isReady: boolean;
}

export function useImpacts(): UseImpactsResult {
    const base = useBase() as unknown as {getTableByNameIfExists(name: string): AirtableTable | null};
    const table = base.getTableByNameIfExists(TABLE_NAME);

    const fieldNames = useMemo(() => {
        if (!table) return [] as string[];
        const present = new Set(table.fields.map(f => f.name));
        return REQUIRED_FIELD_LIST.filter(name => present.has(name));
    }, [table]);

    const missingFields = useMemo(() => {
        if (!table) return [...REQUIRED_FIELD_LIST];
        const present = new Set(table.fields.map(f => f.name));
        return REQUIRED_FIELD_LIST.filter(n => !present.has(n));
    }, [table]);

    const records = useRecords(
        table as unknown as Parameters<typeof useRecords>[0],
        fieldNames.length ? {fields: fieldNames} : undefined,
    ) as unknown as AirtableRecord[] | null;

    const impacts = useMemo<Impact[]>(() => {
        if (!table || !records) return [];
        return records.map(buildImpact);
    }, [table, records]);

    return {
        table,
        impacts,
        missingFields,
        isReady: !!table && !!records,
    };
}
