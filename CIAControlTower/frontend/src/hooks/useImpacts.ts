import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {useMemo} from 'react';
import {
    BUSINESS_ARCHETYPES,
    CHANGE_CATEGORIES,
    CHANGE_IMPACTS,
    AFFILIATES,
    CONFIDENCES,
    ECL_STREAMS,
    FIELDS,
    PERSONAS,
    REQUIRED_FIELD_LIST,
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
    type Impact,
    type Persona,
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

function recordNumberOf(rec: AirtableRecord, present: ReadonlySet<string>): number | null {
    const v = safeRaw(rec, FIELDS.id, present);
    if (typeof v === 'number') return v;
    const s = safeStr(rec, FIELDS.id, present);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function buildImpact(rec: AirtableRecord, present: ReadonlySet<string>): Impact {
    return {
        id: rec.id,
        recordNumber: recordNumberOf(rec, present),
        validationStatus: normalizeOne<ValidationStatus>(safeStr(rec, FIELDS.validationStatus, present), VALIDATION_STATUSES),
        sourceRun: safeStr(rec, FIELDS.sourceRun, present).trim(),
        businessArchetypes: normalizeMany<BusinessArchetype>(safeStr(rec, FIELDS.businessArchetypes, present), BUSINESS_ARCHETYPES),
        affiliate: normalizeOne<Affiliate>(safeStr(rec, FIELDS.affiliate, present), AFFILIATES),
        role: safeStr(rec, FIELDS.role, present).trim(),
        persona: normalizeOne<Persona>(safeStr(rec, FIELDS.persona, present), PERSONAS),
        changeCategory: normalizeOne<ChangeCategory>(safeStr(rec, FIELDS.changeCategory, present), CHANGE_CATEGORIES),
        changeComponent: safeStr(rec, FIELDS.changeComponent, present).trim(),
        descriptionAsIs: safeStr(rec, FIELDS.descriptionAsIs, present),
        descriptionToBe: safeStr(rec, FIELDS.descriptionToBe, present),
        changeImpact: normalizeOne<ChangeImpact>(safeStr(rec, FIELDS.changeImpact, present), CHANGE_IMPACTS),
        confidence: normalizeOne<Confidence>(safeStr(rec, FIELDS.confidence, present), CONFIDENCES),
        tags: normalizeMany<Tag>(safeStr(rec, FIELDS.tags, present), TAGS),
        sourceQuote: safeStr(rec, FIELDS.sourceQuote, present),
        sourceDoc: safeStr(rec, FIELDS.sourceDoc, present),
        actionRequired: safeStr(rec, FIELDS.actionRequired, present),
        responsible: normalizeOne<Responsible>(safeStr(rec, FIELDS.responsible, present), RESPONSIBLES),
        eclStream: normalizeOne<EclStream>(safeStr(rec, FIELDS.eclStream, present), ECL_STREAMS),
        actionOwner: safeStr(rec, FIELDS.actionOwner, present),
        timeline: safeStr(rec, FIELDS.timeline, present),
        dependencies: safeStr(rec, FIELDS.dependencies, present),
        notes: safeStr(rec, FIELDS.notes, present),
    };
}

export interface UseImpactsResult {
    table: AirtableTable | null;
    impacts: Impact[];
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    missingFields: string[];
    isReady: boolean;
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
        () => (table ? REQUIRED_FIELD_LIST.filter(n => !presentFieldNames.has(n)) : [...REQUIRED_FIELD_LIST]),
        [table, presentFieldNames],
    );

    const records = useRecords(
        table as unknown as Parameters<typeof useRecords>[0],
    ) as unknown as AirtableRecord[] | null;

    const impacts = useMemo<Impact[]>(() => {
        if (!table || !records) return [];
        return records.map(rec => buildImpact(rec, presentFieldNames));
    }, [table, records, presentFieldNames]);

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
        missingFields,
        isReady: !!table && !!records,
    };
}
