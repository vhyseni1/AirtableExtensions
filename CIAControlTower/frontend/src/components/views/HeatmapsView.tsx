import {tokens} from '../../styles/tokens';
import {CATEGORIES, PERSONAS, type Impact} from '../../utils/schema';
import {MatrixHeatMap} from '../primitives/MatrixHeatMap';
import {Panel} from '../primitives/Panel';

interface Props {
    filtered: Impact[];
    onDrill: (records: Impact[], title: string) => void;
}

const AFFILIATE_ORDER: ReadonlyArray<string> = ['DE', 'UK', 'FR', 'ES', 'IT', 'CA', 'BR', 'Other'];

export function HeatmapsView({filtered, onDrill}: Props) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: tokens.space.md,
            }}
        >
            <Panel
                eyebrow="Matrix · 01"
                title="Component × Persona"
                subtitle="Who feels what — count, color = avg severity"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => r.persona ?? null}
                    colKey={r => (r.component?.trim() ? r.component : null)}
                    rowOrder={PERSONAS}
                    rowLabel="Persona"
                    colLabel="Component"
                    onDrill={onDrill}
                />
            </Panel>

            <Panel
                eyebrow="Matrix · 02"
                title="Persona × Category"
                subtitle="Pillar burden by role"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => r.persona ?? null}
                    colKey={r => r.category ?? null}
                    rowOrder={PERSONAS}
                    colOrder={CATEGORIES}
                    rowLabel="Persona"
                    colLabel="Category"
                    minColWidth={48}
                    onDrill={onDrill}
                />
            </Panel>

            <Panel
                eyebrow="Matrix · 03"
                title="Affiliate × Component"
                subtitle="Geographic concentration of impact"
            >
                <MatrixHeatMap
                    records={filtered}
                    rowKey={r => (r.lens === 'Affiliate' ? r.affiliateCountry : r.lens) ?? null}
                    colKey={r => (r.component?.trim() ? r.component : null)}
                    rowOrder={['Global', 'MWM', ...AFFILIATE_ORDER]}
                    rowLabel="Region"
                    colLabel="Component"
                    onDrill={onDrill}
                />
            </Panel>
        </div>
    );
}
