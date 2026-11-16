import {useMemo} from 'react';
import {
    affiliateSlices,
    buildMatrix,
    deltaBetweenRuns,
    frictionList,
    gapsList,
    headlineMetrics,
    listPersonas,
    listRoles,
    listRuns,
    pressureByPersona,
    topComponentsBySeverity,
    type AffiliateSlice,
    type ComponentRollup,
    type HeadlineMetrics,
    type MatrixAgg,
    type PersonaRollup,
} from '../utils/aggregations';
import {type Impact} from '../utils/schema';

export interface DashboardAggregations {
    headline: HeadlineMetrics;
    matrix: MatrixAgg;
    topComponents: ComponentRollup[];
    gaps: Impact[];
    pressure: PersonaRollup[];
    friction: Impact[];
    affiliateSlices: AffiliateSlice[];
    runs: string[];
    roles: string[];
    personas: string[];
    /** Distinct affiliate values present in the data (data-driven, not hard-coded). */
    affiliates: string[];
    /** Distinct Business_Archetype values present in the data. */
    archetypes: string[];
    delta: ReturnType<typeof deltaBetweenRuns> | null;
}

function distinct(values: Iterable<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const t = v.trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    }
    return out.sort((a, b) => a.localeCompare(b));
}

export function useAggregations(filtered: Impact[], all: Impact[]): DashboardAggregations {
    return useMemo<DashboardAggregations>(() => {
        const runs = listRuns(all);
        const roles = listRoles(all);
        const personas = listPersonas(all);
        const affiliates = distinct(all.map(r => r.affiliate ?? '').filter(Boolean));
        const archetypes = distinct(all.flatMap(r => r.businessArchetypes));
        let delta: ReturnType<typeof deltaBetweenRuns> | null = null;
        if (runs.length >= 2) {
            const currentRun = runs[0];
            const previousRun = runs[1];
            if (currentRun && previousRun) {
                const cur = all.filter(r => r.sourceRun === currentRun);
                const prev = all.filter(r => r.sourceRun === previousRun);
                delta = deltaBetweenRuns(cur, prev);
            }
        }
        return {
            headline: headlineMetrics(filtered),
            matrix: buildMatrix(filtered),
            topComponents: topComponentsBySeverity(filtered, 5),
            gaps: gapsList(filtered),
            pressure: pressureByPersona(filtered),
            friction: frictionList(filtered),
            affiliateSlices: affiliateSlices(filtered),
            runs,
            roles,
            personas,
            affiliates,
            archetypes,
            delta,
        };
    }, [filtered, all]);
}
