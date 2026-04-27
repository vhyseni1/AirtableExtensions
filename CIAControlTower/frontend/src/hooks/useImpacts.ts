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

function safeStr(rec: AirtableRecord, field: string, present: ReadonlySet<string>): string {
    if (!present.has(field)) return '';
    try {
        const s = rec.getCellValueAsString(field);
        return s == null ? '' : s;
    } catch {
        return '';
    }
}

function safeRaw(rec: AirtableRecord, field: string, present: ReadonlySet<string>): unknown {
    if (!present.has(field)) return null;
    try {
        return rec.getCellValue(field);
    } catch {
        return null;
    }
}

function rowIdOf(rec: AirtableRecord, present: ReadonlySet<string>): number | null {
    const v = safeRaw(rec, FIELDS.rowId, present);
    if (typeof v === 'number') return v;
    const s = safeStr(rec, FIELDS.rowId, present);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function buildImpact(rec: AirtableRecord, present: ReadonlySet<string>): Impact {
    return {
        id: rec.id,
        rowId: rowIdOf(rec, present),
        validationStatus: normalizeOne(safeStr(rec, FIELDS.validationStatus, present), VALIDATION_SET),
        sourceRun: safeStr(rec, FIELDS.sourceRun, present).trim(),
        category: normalizeOne(safeStr(rec, FIELDS.category, present), CATEGORY_SET),
        lens: normalizeOne(safeStr(rec, FIELDS.impactLens, present), LENS_SET),
        affiliateCountry: safeStr(rec, FIELDS.affiliateCountry, present).trim() || null,
        persona: normalizeOne(safeStr(rec, FIELDS.persona, present), PERSONA_SET),
        component: safeStr(rec, FIELDS.component, present).trim(),
        description: safeStr(rec, FIELDS.description, present),
        severity: normalizeOne(safeStr(rec, FIELDS.severity, present), SEVERITY_SET),
        tags: normalizeTags(safeStr(rec, FIELDS.tags, present)),
        confidence: normalizeOne(safeStr(rec, FIELDS.confidence, present), CONFIDENCE_SET),
        sourceQuote: safeStr(rec, FIELDS.sourceQuote, present),
        sourceDoc: safeStr(rec, FIELDS.sourceDoc, present),
        actionRequired: safeStr(rec, FIELDS.actionRequired, present),
        responsible: safeStr(rec, FIELDS.responsible, present).trim() || null,
        actionOwner: safeStr(rec, FIELDS.actionOwner, present),
        timeline: safeStr(rec, FIELDS.timeline, present),
        dependencies: safeStr(rec, FIELDS.dependencies, present),
        notes: safeStr(rec, FIELDS.notes, present),
        reviewerNotes: safeStr(rec, FIELDS.reviewerNotes, present),
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

    const presentFieldNames = useMemo(() => {
        if (!table) return new Set<string>();
        return new Set(table.fields.map(f => f.name));
    }, [table]);

    const fieldNames = useMemo(
        () => REQUIRED_FIELD_LIST.filter(name => presentFieldNames.has(name)),
        [presentFieldNames],
    );

    const missingFields = useMemo(
        () => (table ? REQUIRED_FIELD_LIST.filter(n => !presentFieldNames.has(n)) : [...REQUIRED_FIELD_LIST]),
        [table, presentFieldNames],
    );

    const records = useRecords(
        table as unknown as Parameters<typeof useRecords>[0],
        fieldNames.length ? {fields: fieldNames} : undefined,
    ) as unknown as AirtableRecord[] | null;

    const impacts = useMemo<Impact[]>(() => {
        if (!table || !records) return [];
        return records.map(rec => buildImpact(rec, presentFieldNames));
    }, [table, records, presentFieldNames]);

    return {
        table,
        impacts,
        missingFields,
        isReady: !!table && !!records,
    };
}
