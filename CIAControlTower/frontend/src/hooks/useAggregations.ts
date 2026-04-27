import {useMemo} from 'react';
import {
    buildMatrix,
    deltaBetweenRuns,
    frictionList,
    gapsList,
    headlineMetrics,
    lensSlices,
    listRuns,
    pressureByPersona,
    topComponentsBySeverity,
    type ComponentRollup,
    type HeadlineMetrics,
    type LensSlice,
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
    lenses: LensSlice[];
    runs: string[];
    delta: ReturnType<typeof deltaBetweenRuns> | null;
}

export function useAggregations(filtered: Impact[], all: Impact[]): DashboardAggregations {
    return useMemo<DashboardAggregations>(() => {
        const runs = listRuns(all);
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
            lenses: lensSlices(filtered),
            runs,
            delta,
        };
    }, [filtered, all]);
}
