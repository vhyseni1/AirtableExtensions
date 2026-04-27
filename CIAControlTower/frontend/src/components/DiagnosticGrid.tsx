import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {type Impact} from '../utils/schema';
import {FrictionPanel} from './panels/Friction';
import {GapsPanel} from './panels/Gaps';
import {PressurePanel} from './panels/Pressure';
import {WhereTheHeatIs} from './panels/WhereTheHeatIs';

interface Props {
    aggregations: DashboardAggregations;
    onDrill: (records: Impact[], title: string) => void;
    onOpen: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId: string | null;
}

export function DiagnosticGrid({aggregations, onDrill, onOpen, onSelect, selectedId}: Props) {
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
                onOpen={onOpen}
                onSelect={onSelect}
                selectedId={selectedId}
            />
            <PressurePanel pressure={aggregations.pressure} onDrill={onDrill} />
            <FrictionPanel
                friction={aggregations.friction}
                onOpen={onOpen}
                onSelect={onSelect}
                selectedId={selectedId}
            />
        </div>
    );
}
