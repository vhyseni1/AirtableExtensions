import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from '../primitives/EmptyState';
import {NativeRecordRow} from '../primitives/NativeRecordRow';
import {Panel} from '../primitives/Panel';

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
    gaps: Impact[];
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    onOpen: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId?: string | null;
}

export function GapsPanel({gaps, recordsById, fieldsByName, onOpen, onSelect, selectedId}: Props) {
    return (
        <Panel
            eyebrow="Panel B"
            title="What's breaking"
            subtitle={`${gaps.length} unowned, unfunded, or undecided`}
        >
            {gaps.length === 0 ? (
                <EmptyState line="No gaps in scope. Every impact has an owner or budget signal." />
            ) : (
                <div
                    className="cia-scroll"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: tokens.space.sm,
                        maxHeight: 360,
                        overflowY: 'auto',
                        paddingRight: 4,
                    }}
                >
                    {gaps.map(g => (
                        <NativeRecordRow
                            key={g.id}
                            impact={g}
                            record={recordsById.get(g.id) ?? null}
                            fieldsByName={fieldsByName}
                            onOpen={onOpen}
                            onSelect={onSelect}
                            selected={selectedId === g.id}
                        />
                    ))}
                </div>
            )}
        </Panel>
    );
}
