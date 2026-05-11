import {sevColor, tagColor, tokens} from '../../styles/tokens';
import {AFFILIATES, CHANGE_CATEGORIES, CHANGE_IMPACTS, type Impact} from '../../utils/schema';
import {Panel} from '../primitives/Panel';
import {SankeyChart, type SankeyDimension} from '../primitives/SankeyChart';

interface Props {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}

export function FlowsView({filtered, onDrill}: Props) {
    const affiliate: SankeyDimension = {
        label: 'Affiliate',
        extract: r => r.affiliate ?? null,
        order: AFFILIATES,
    };
    const categoryCol: SankeyDimension = {
        label: 'Change_Category',
        extract: r => r.changeCategory ?? null,
        order: CHANGE_CATEGORIES,
    };
    const impactCol: SankeyDimension = {
        label: 'Change_Impact',
        extract: r => r.changeImpact ?? null,
        order: CHANGE_IMPACTS,
        colorOf: v => sevColor(v),
    };

    const role: SankeyDimension = {
        label: 'Role',
        extract: r => (r.role?.trim() ? r.role : null),
    };
    const tagCol: SankeyDimension = {
        label: 'Tag',
        extract: r => r.tags[0] ?? null,
        order: ['Heatmap', 'Pressure', 'Gap', 'Friction'],
        colorOf: v => tagColor(v),
    };

    const tagFlattened = flattenByTag(filtered);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space.md,
            }}
        >
            <Panel
                eyebrow="Flow · 01"
                title="Affiliate → Change_Category → Change_Impact"
                subtitle="Where the heat is, regionally — bands colored by impact severity"
            >
                <SankeyChart
                    records={filtered}
                    columns={[affiliate, categoryCol, impactCol]}
                    onDrill={onDrill}
                    bandColorSource="target"
                    height={420}
                />
            </Panel>

            <Panel
                eyebrow="Flow · 02"
                title="Role → Change_Category → Tag"
                subtitle="Who's exposed to what kind of issue — bands colored by tag"
            >
                <SankeyChart
                    records={tagFlattened}
                    columns={[role, categoryCol, tagCol]}
                    onDrill={(records, title) => onDrill(dedupeById(records), title)}
                    bandColorSource="target"
                    height={480}
                />
            </Panel>
        </div>
    );
}

function flattenByTag(records: Impact[]): Impact[] {
    const out: Impact[] = [];
    for (const r of records) {
        if (r.tags.length === 0) continue;
        for (const t of r.tags) {
            out.push({...r, tags: [t]});
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
