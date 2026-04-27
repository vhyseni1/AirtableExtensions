import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {type Impact} from '../utils/schema';
import {FrictionPanel} from './panels/Friction';
import {GapsPanel} from './panels/Gaps';
import {PressurePanel} from './panels/Pressure';
import {WhereTheHeatIs} from './panels/WhereTheHeatIs';

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

interface Props {
    aggregations: DashboardAggregations;
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    onDrill: (records: Impact[], title: string) => void;
    onOpen: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId: string | null;
}

export function DiagnosticGrid({
    aggregations,
    recordsById,
    fieldsByName,
    onDrill,
    onOpen,
    onSelect,
    selectedId,
}: Props) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: tokens.space.md,
            }}
        >
            <WhereTheHeatIs components={aggregations.topComponents} onDrill={onDrill} />
            <GapsPanel
                gaps={aggregations.gaps}
                recordsById={recordsById}
                fieldsByName={fieldsByName}
                onOpen={onOpen}
                onSelect={onSelect}
                selectedId={selectedId}
            />
            <PressurePanel pressure={aggregations.pressure} onDrill={onDrill} />
            <FrictionPanel
                friction={aggregations.friction}
                recordsById={recordsById}
                fieldsByName={fieldsByName}
                onOpen={onOpen}
                onSelect={onSelect}
                selectedId={selectedId}
            />
        </div>
    );
}
