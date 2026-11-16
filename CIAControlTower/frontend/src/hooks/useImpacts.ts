import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {
    ACCESSIBLE_FIELD_CANDIDATES,
    BUSINESS_ARCHETYPES,
    CHANGE_CATEGORIES,
    CHANGE_IMPACTS,
    AFFILIATES,
    CONFIDENCES,
    CREATED_FIELD_CANDIDATES,
    ECL_STREAMS,
    missingCoreFields,
    resolveFields,
    RESPONSIBLES,
    TABLE_NAME,
    TAGS,
    VALIDATION_STATUSES,
    type Affiliate,
    type BusinessArchetype,
    type ChangeCategory,
    type ChangeImpact,
    type Confidence,
    type EclStream,
    type FieldKey,
    type Impact,
    type Responsible,
    type Tag,
    type ValidationStatus,
} from '../utils/schema';

interface AirtableRecord {
    id: string;
    getCellValue(name: string): unknown;
    getCellValueAsString(name: string): string;
}

interface AirtableField {
    id: string;
    name: string;
    type: string;
}

interface AirtableTable {
    name: string;
    id: string;
    fields: ReadonlyArray<AirtableField>;
}

function normalizeOne<T extends string>(raw: string, allow: ReadonlyArray<T>): T | null {
    const v = raw.trim();
    if (!v) return null;
    return (allow as ReadonlyArray<string>).includes(v) ? (v as T) : null;
}

function normalizeMany<T extends string>(raw: string, allow: ReadonlyArray<T>): T[] {
    if (!raw) return [];
    const out: T[] = [];
    for (const part of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        if ((allow as ReadonlyArray<string>).includes(part)) out.push(part as T);
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

/** Resolve the first candidate field name that actually exists in the table. */
function resolveField(present: ReadonlySet<string>, candidates: ReadonlyArray<string>): string | null {
    const lower = new Map<string, string>();
    for (const name of present) lower.set(name.toLowerCase(), name);
    for (const c of candidates) {
        const hit = lower.get(c.toLowerCase());
        if (hit) return hit;
    }
    return null;
}

/** Extract lower-cased id + email keys from a collaborator cell (single or many). */
function collaboratorKeys(value: unknown): string[] {
    const out: string[] = [];
    const push = (c: unknown) => {
        if (c && typeof c === 'object') {
            const o = c as {id?: unknown; email?: unknown};
            if (typeof o.id === 'string') out.push(o.id.toLowerCase());
            if (typeof o.email === 'string') out.push(o.email.toLowerCase());
        }
    };
    if (Array.isArray(value)) value.forEach(push);
    else push(value);
    return out;
}

interface AccessFields {
    created: string | null;
    accessible: string | null;
}

function recordNumberOf(rec: AirtableRecord, idField: string | null, present: ReadonlySet<string>): number | null {
    if (!idField) return null;
    const v = safeRaw(rec, idField, present);
    if (typeof v === 'number') return v;
    const s = safeStr(rec, idField, present);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function buildImpact(
    rec: AirtableRecord,
    present: ReadonlySet<string>,
    access: AccessFields,
    resolved: Record<FieldKey, string | null>,
): Impact {
    const accessKeys: string[] = [];
    if (access.created) accessKeys.push(...collaboratorKeys(safeRaw(rec, access.created, present)));
    if (access.accessible) accessKeys.push(...collaboratorKeys(safeRaw(rec, access.accessible, present)));
    const str = (k: FieldKey): string => (resolved[k] ? safeStr(rec, resolved[k]!, present) : '');
    return {
        id: rec.id,
        recordNumber: recordNumberOf(rec, resolved.id, present),
        validationStatus: normalizeOne<ValidationStatus>(str('validationStatus'), VALIDATION_STATUSES),
        sourceRun: str('sourceRun').trim(),
        businessArchetypes: normalizeMany<BusinessArchetype>(str('businessArchetypes'), BUSINESS_ARCHETYPES),
        affiliate: normalizeOne<Affiliate>(str('affiliate'), AFFILIATES),
        role: str('role').trim(),
        persona: (() => {
            const v = str('persona').trim();
            return v ? v : null;
        })(),
        changeCategory: normalizeOne<ChangeCategory>(str('changeCategory'), CHANGE_CATEGORIES),
        changeComponent: str('changeComponent').trim(),
        descriptionAsIs: str('descriptionAsIs'),
        descriptionToBe: str('descriptionToBe'),
        changeImpact: normalizeOne<ChangeImpact>(str('changeImpact'), CHANGE_IMPACTS),
        confidence: normalizeOne<Confidence>(str('confidence'), CONFIDENCES),
        tags: normalizeMany<Tag>(str('tags'), TAGS),
        sourceQuote: str('sourceQuote'),
        sourceDoc: str('sourceDoc'),
        actionRequired: str('actionRequired'),
        responsible: normalizeOne<Responsible>(str('responsible'), RESPONSIBLES),
        eclStream: normalizeOne<EclStream>(str('eclStream'), ECL_STREAMS),
        actionOwner: str('actionOwner'),
        timeline: str('timeline'),
        dependencies: str('dependencies'),
        notes: str('notes'),
        accessKeys,
    };
}

export interface UseImpactsResult {
    table: AirtableTable | null;
    impacts: Impact[];
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    /** Table fields in their native order (for the Airtable-style review grid). */
    fields: ReadonlyArray<AirtableField>;
    missingFields: string[];
    isReady: boolean;
    /** True when the table has a Created and/or Accessible-by field, so per-user access applies. */
    accessControlled: boolean;
}

export function useImpacts(tableName: string = TABLE_NAME): UseImpactsResult {
    const base = useBase() as unknown as {getTableByNameIfExists(name: string): AirtableTable | null};
    const table = base.getTableByNameIfExists(tableName);

    const presentFieldNames = useMemo(() => {
        if (!table) return new Set<string>();
        return new Set(table.fields.map(f => f.name));
    }, [table]);

    const fieldsByName = useMemo(() => {
        const m = new Map<string, AirtableField>();
        if (!table) return m;
        for (const f of table.fields) m.set(f.name, f);
        return m;
    }, [table]);

    const missingFields = useMemo(
        () => (table ? missingCoreFields(presentFieldNames) : []),
        [table, presentFieldNames],
    );

    const resolved = useMemo<Record<FieldKey, string | null>>(
        () => resolveFields(presentFieldNames),
        [presentFieldNames],
    );

    const accessFields = useMemo<AccessFields>(
        () => ({
            created: resolveField(presentFieldNames, CREATED_FIELD_CANDIDATES),
            accessible: resolveField(presentFieldNames, ACCESSIBLE_FIELD_CANDIDATES),
        }),
        [presentFieldNames],
    );
    const accessControlled = !!(accessFields.created || accessFields.accessible);

    const records = useRecords(
        table as unknown as Parameters<typeof useRecords>[0],
    ) as unknown as AirtableRecord[] | null;

    const impacts = useMemo<Impact[]>(() => {
        if (!table || !records) return [];
        return records.map(rec => buildImpact(rec, presentFieldNames, accessFields, resolved));
    }, [table, records, presentFieldNames, accessFields, resolved]);

    const recordsById = useMemo(() => {
        const m = new Map<string, AirtableRecord>();
        if (!records) return m;
        for (const r of records) m.set(r.id, r);
        return m;
    }, [records]);

    return {
        table,
        impacts,
        recordsById,
        fieldsByName,
        fields: table ? table.fields : [],
        missingFields,
        isReady: !!table && !!records,
        accessControlled,
    };
}
