import {useMemo} from 'react';
import {type Impact, type Persona, type Severity, type Tag} from '../utils/schema';

export type LensFilter = 'All' | 'Global' | 'MWM' | 'Affiliate';
export type SeverityFilter = 'All' | Severity;

export interface FilterState {
    sourceRun: string | 'All';
    lens: LensFilter;
    personas: Persona[];
    tags: Tag[];
    severity: SeverityFilter;
}

export const DEFAULT_FILTER: FilterState = {
    sourceRun: 'All',
    lens: 'All',
    personas: [],
    tags: [],
    severity: 'All',
};

export function applyFilters(records: Impact[], f: FilterState): Impact[] {
    return records.filter(r => {
        if (r.validationStatus !== 'Reviewed') return false;
        if (f.sourceRun !== 'All' && r.sourceRun !== f.sourceRun) return false;
        if (f.lens !== 'All' && r.lens !== f.lens) return false;
        if (f.severity !== 'All' && r.severity !== f.severity) return false;
        if (f.personas.length && (!r.persona || !f.personas.includes(r.persona))) return false;
        if (f.tags.length && !f.tags.every(t => r.tags.includes(t))) return false;
        return true;
    });
}

export function useFilteredImpacts(records: Impact[], filter: FilterState): Impact[] {
    return useMemo(() => applyFilters(records, filter), [records, filter]);
}
