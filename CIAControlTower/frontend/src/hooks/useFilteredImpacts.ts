import {useMemo} from 'react';
import {
    type Affiliate,
    type BusinessArchetype,
    type ChangeImpact,
    type Impact,
    type Persona,
    type Tag,
} from '../utils/schema';

export type AffiliateFilter = 'All' | Affiliate;
export type ImpactFilter = 'All' | ChangeImpact;

export interface FilterState {
    /** Empty array means "all runs". */
    sourceRuns: string[];
    affiliate: AffiliateFilter;
    archetypes: BusinessArchetype[];
    personas: Persona[];
    tags: Tag[];
    changeImpact: ImpactFilter;
}

export const DEFAULT_FILTER: FilterState = {
    sourceRuns: [],
    affiliate: 'All',
    archetypes: [],
    personas: [],
    tags: [],
    changeImpact: 'All',
};

export function applyFilters(records: Impact[], f: FilterState): Impact[] {
    return records.filter(r => {
        if (r.validationStatus !== 'Reviewed') return false;
        if (f.sourceRuns.length && !f.sourceRuns.includes(r.sourceRun)) return false;
        if (f.affiliate !== 'All' && r.affiliate !== f.affiliate) return false;
        if (f.changeImpact !== 'All' && r.changeImpact !== f.changeImpact) return false;
        if (f.personas.length && (!r.persona || !f.personas.includes(r.persona))) return false;
        if (f.tags.length && !f.tags.every(t => r.tags.includes(t))) return false;
        if (f.archetypes.length && !r.businessArchetypes.some(a => f.archetypes.includes(a))) return false;
        return true;
    });
}

export function useFilteredImpacts(records: Impact[], filter: FilterState): Impact[] {
    return useMemo(() => applyFilters(records, filter), [records, filter]);
}
