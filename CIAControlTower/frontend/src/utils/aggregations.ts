import {
    type ChangeImpact,
    type Impact,
    type Persona,
    type Tag,
    CHANGE_IMPACT_WEIGHT,
} from './schema';

export interface CellAgg {
    records: Impact[];
    count: number;
    sevSum: number;
    sevCount: number;
    avgSev: number;
    dominantTag: Tag | null;
}

export interface MatrixAgg {
    components: string[];
    /** Y-axis labels, ordered by descending row total. Currently sourced from Role. */
    rows: string[];
    cells: Map<string, Map<string, CellAgg>>;
    componentTotals: Map<string, number>;
    rowTotals: Map<string, number>;
    maxCellCount: number;
}

export function emptyCell(): CellAgg {
    return {records: [], count: 0, sevSum: 0, sevCount: 0, avgSev: 0, dominantTag: null};
}

export function buildMatrix(records: Impact[]): MatrixAgg {
    const cells = new Map<string, Map<string, CellAgg>>();
    const componentTotals = new Map<string, number>();
    const rowTotals = new Map<string, number>();
    const componentSet = new Set<string>();
    const rowSet = new Set<string>();

    for (const r of records) {
        const c = r.changeComponent?.trim() || '(unspecified)';
        const rowKey = r.role?.trim();
        if (!rowKey) continue;
        componentSet.add(c);
        rowSet.add(rowKey);

        let row = cells.get(c);
        if (!row) {
            row = new Map<string, CellAgg>();
            cells.set(c, row);
        }
        let cell = row.get(rowKey);
        if (!cell) {
            cell = emptyCell();
            row.set(rowKey, cell);
        }
        cell.records.push(r);
        cell.count += 1;
        if (r.changeImpact) {
            cell.sevSum += CHANGE_IMPACT_WEIGHT[r.changeImpact];
            cell.sevCount += 1;
        }
        componentTotals.set(c, (componentTotals.get(c) ?? 0) + 1);
        rowTotals.set(rowKey, (rowTotals.get(rowKey) ?? 0) + 1);
    }

    let maxCellCount = 0;
    for (const row of cells.values()) {
        for (const cell of row.values()) {
            cell.avgSev = cell.sevCount > 0 ? cell.sevSum / cell.sevCount : 0;
            cell.dominantTag = pickDominantTag(cell.records);
            if (cell.count > maxCellCount) maxCellCount = cell.count;
        }
    }

    const components = [...componentSet].sort((a, b) => {
        const da = componentTotals.get(b) ?? 0;
        const db = componentTotals.get(a) ?? 0;
        return da - db || a.localeCompare(b);
    });
    const rows = [...rowSet].sort((a, b) => {
        const da = rowTotals.get(b) ?? 0;
        const db = rowTotals.get(a) ?? 0;
        return da - db || a.localeCompare(b);
    });

    return {
        components,
        rows,
        cells,
        componentTotals,
        rowTotals,
        maxCellCount,
    };
}

/** Re-export for components that still consume the persona-typed pressure rollup. */
export type {Persona};

function pickDominantTag(records: Impact[]): Tag | null {
    const counts = new Map<Tag, number>();
    for (const r of records) {
        for (const t of r.tags) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }
    let best: Tag | null = null;
    let bestN = 0;
    for (const [t, n] of counts) {
        if (n > bestN) {
            best = t;
            bestN = n;
        }
    }
    return best;
}

export interface ComponentRollup {
    component: string;
    total: number;
    high: number;
    medium: number;
    low: number;
    records: Impact[];
}

export function topComponentsBySeverity(records: Impact[], limit = 5): ComponentRollup[] {
    const map = new Map<string, ComponentRollup>();
    for (const r of records) {
        const c = r.changeComponent?.trim() || '(unspecified)';
        let row = map.get(c);
        if (!row) {
            row = {component: c, total: 0, high: 0, medium: 0, low: 0, records: []};
            map.set(c, row);
        }
        row.total += 1;
        row.records.push(r);
        if (r.changeImpact === 'High') row.high += 1;
        else if (r.changeImpact === 'Medium') row.medium += 1;
        else if (r.changeImpact === 'Low') row.low += 1;
    }
    return [...map.values()]
        .sort((a, b) => b.total - a.total || b.high - a.high)
        .slice(0, limit);
}

export interface PersonaRollup {
    persona: Persona;
    count: number;
    avgSev: number;
    records: Impact[];
}

export function pressureByPersona(records: Impact[]): PersonaRollup[] {
    const pressure = records.filter(r => r.tags.includes('Pressure'));
    const map = new Map<Persona, PersonaRollup>();
    for (const r of pressure) {
        if (!r.persona) continue;
        let row = map.get(r.persona);
        if (!row) {
            row = {persona: r.persona, count: 0, avgSev: 0, records: []};
            map.set(r.persona, row);
        }
        row.records.push(r);
        row.count += 1;
    }
    for (const row of map.values()) {
        const sevs = row.records.map(r => (r.changeImpact ? CHANGE_IMPACT_WEIGHT[r.changeImpact] : 0)).filter(n => n > 0);
        row.avgSev = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
}

export function gapsList(records: Impact[]): Impact[] {
    const sevRank = (s: ChangeImpact | null): number => (s ? CHANGE_IMPACT_WEIGHT[s] : 0);
    const confRank = (c: string | null): number => (c === 'High' ? 3 : c === 'Medium' ? 2 : c === 'Low' ? 1 : 0);
    return records
        .filter(r => r.tags.includes('Gap'))
        .sort((a, b) => sevRank(b.changeImpact) - sevRank(a.changeImpact) || confRank(b.confidence) - confRank(a.confidence));
}

export function frictionList(records: Impact[]): Impact[] {
    return records
        .filter(r => r.tags.includes('Friction'))
        .sort((a, b) => (b.changeImpact === 'High' ? 1 : 0) - (a.changeImpact === 'High' ? 1 : 0));
}

export interface AffiliateSlice {
    label: string;
    total: number;
    byCategory: Map<string, number>;
}

export function affiliateSlices(records: Impact[]): AffiliateSlice[] {
    const map = new Map<string, AffiliateSlice>();
    for (const r of records) {
        if (!r.affiliate) continue;
        const key = r.affiliate;
        let row = map.get(key);
        if (!row) {
            row = {label: key, total: 0, byCategory: new Map()};
            map.set(key, row);
        }
        row.total += 1;
        if (r.changeCategory) {
            row.byCategory.set(r.changeCategory, (row.byCategory.get(r.changeCategory) ?? 0) + 1);
        }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface HeadlineMetrics {
    totalImpacts: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    gapsOpen: number;
    pressureFlags: number;
    frictionPoints: number;
    avgConfidencePct: number;
    lowestConfidenceRecords: Impact[];
}

export function headlineMetrics(records: Impact[]): HeadlineMetrics {
    const reviewed = records.filter(r => r.validationStatus === 'Reviewed');
    const highSeverity = reviewed.filter(r => r.changeImpact === 'High').length;
    const mediumSeverity = reviewed.filter(r => r.changeImpact === 'Medium').length;
    const lowSeverity = reviewed.filter(r => r.changeImpact === 'Low').length;
    const gapsOpen = reviewed.filter(
        r => r.tags.includes('Gap') && !r.actionOwner.trim() && !r.notes.trim(),
    ).length;
    const pressureFlags = reviewed.filter(r => r.tags.includes('Pressure')).length;
    const frictionPoints = reviewed.filter(r => r.tags.includes('Friction')).length;
    const highConf = reviewed.filter(r => r.confidence === 'High').length;
    const avgConfidencePct = reviewed.length ? Math.round((highConf / reviewed.length) * 100) : 0;
    const lowestConfidenceRecords = [...reviewed]
        .filter(r => r.confidence === 'Low' || r.confidence === 'Medium')
        .sort((a, b) => (a.confidence === 'Low' ? -1 : 1) - (b.confidence === 'Low' ? -1 : 1));
    return {
        totalImpacts: reviewed.length,
        highSeverity,
        mediumSeverity,
        lowSeverity,
        gapsOpen,
        pressureFlags,
        frictionPoints,
        avgConfidencePct,
        lowestConfidenceRecords,
    };
}

export function listRuns(records: Impact[]): string[] {
    const set = new Set<string>();
    for (const r of records) {
        if (r.sourceRun) set.add(r.sourceRun);
    }
    return [...set].sort().reverse();
}

export function listRoles(records: Impact[]): string[] {
    const counts = new Map<string, number>();
    for (const r of records) {
        const k = r.role?.trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([k]) => k);
}

export function listPersonas(records: Impact[]): string[] {
    const counts = new Map<string, number>();
    for (const r of records) {
        const k = r.persona?.trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([k]) => k);
}

export function deltaBetweenRuns(
    current: Impact[],
    previous: Impact[],
): {total: number; high: number; gaps: number; pressure: number; friction: number} {
    const cm = headlineMetrics(current);
    const pm = headlineMetrics(previous);
    return {
        total: cm.totalImpacts - pm.totalImpacts,
        high: cm.highSeverity - pm.highSeverity,
        gaps: cm.gapsOpen - pm.gapsOpen,
        pressure: cm.pressureFlags - pm.pressureFlags,
        friction: cm.frictionPoints - pm.frictionPoints,
    };
}
