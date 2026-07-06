import {tokens} from '../../styles/tokens';
import {
    AFFILIATES,
    BUSINESS_ARCHETYPES,
    CHANGE_CATEGORIES,
    type Impact,
} from '../../utils/schema';
import {MatrixHeatMap} from '../primitives/MatrixHeatMap';
import {Panel} from '../primitives/Panel';
import {CustomHeatmapBuilder} from './CustomHeatmapBuilder';

interface Props {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}

export function HeatmapsView({filtered, onDrill}: Props) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space.md,
            }}
        >
            <Panel
                eyebrow="Matrix · 01"
                title="Change_Component × Archetype"
                subtitle="Who feels what — count, color = avg Change_Impact"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => r.persona ?? null}
                    colKey={r => (r.changeComponent?.trim() ? r.changeComponent : null)}
                    rowLabel="Archetype"
                    colLabel="Change_Component"
                    onDrill={onDrill}
                />
            </Panel>

            <Panel
                eyebrow="Matrix · 02"
                title="Archetype × Change_Category"
                subtitle="Pillar burden by archetype"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => r.persona ?? null}
                    colKey={r => r.changeCategory ?? null}
                    colOrder={CHANGE_CATEGORIES}
                    rowLabel="Archetype"
                    colLabel="Change_Category"
                    minColWidth={64}
                    onDrill={onDrill}
                />
            </Panel>

            <Panel
                eyebrow="Matrix · 03"
                title="Affiliate × Change_Component"
                subtitle="Geographic concentration of impact"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => r.affiliate ?? null}
                    colKey={r => (r.changeComponent?.trim() ? r.changeComponent : null)}
                    rowOrder={AFFILIATES}
                    rowLabel="Affiliate"
                    colLabel="Change_Component"
                    onDrill={onDrill}
                />
            </Panel>

            <Panel
                eyebrow="Matrix · 04"
                title="Business_Archetype × Change_Component"
                subtitle="Which archetypes carry which systemic changes"
            >
                <MatrixHeatMap
                    records={flattenByArchetype(filtered)}
                    rowKey={r => r.role || null}
                    colKey={r => (r.changeComponent?.trim() ? r.changeComponent : null)}
                    rowOrder={BUSINESS_ARCHETYPES}
                    rowLabel="Archetype"
                    colLabel="Change_Component"
                    onDrill={(records, title) => onDrill(dedupeById(records), title)}
                />
            </Panel>

            <CustomHeatmapBuilder filtered={filtered} onDrill={onDrill} />
        </div>
    );
}

function flattenByArchetype(records: Impact[]): Impact[] {
    const out: Impact[] = [];
    for (const r of records) {
        if (r.businessArchetypes.length === 0) continue;
        for (const a of r.businessArchetypes) {
            out.push({...r, role: a});
        }
    }
    return out;
}

function dedupeById(records: Impact[]): Impact[] {
    const seen = new Set<string>();
    const out: Impact[] = [];
    for (const r of records) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
    }
    return out;
}
