import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from '../primitives/EmptyState';
import {Panel} from '../primitives/Panel';
import {RecordRow} from '../primitives/RecordRow';

interface Props {
    gaps: Impact[];
    onOpen: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId?: string | null;
}

export function GapsPanel({gaps, onOpen, onSelect, selectedId}: Props) {
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
                        maxHeight: 320,
                        overflowY: 'auto',
                        paddingRight: 4,
                    }}
                >
                    {gaps.map(g => (
                        <RecordRow
                            key={g.id}
                            impact={g}
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
