import {CellRenderer} from '@airtable/blocks/interface/ui';
import {tokens} from '../../styles/tokens';
import {FIELDS, type Impact} from '../../utils/schema';

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
    impact: Impact;
    record: AirtableRecord | null;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    onOpen: (id: string) => void;
    onSelect?: (id: string) => void;
    selected?: boolean;
}

const VISIBLE_FIELDS: Array<keyof typeof FIELDS> = [
    'persona',
    'component',
    'severity',
    'tags',
    'confidence',
];

export function NativeRecordRow({impact, record, fieldsByName, onOpen, onSelect, selected}: Props) {
    const handleClick = () => {
        if (onSelect) onSelect(impact.id);
        onOpen(impact.id);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space.sm,
                padding: tokens.space.md,
                background: selected ? `${tokens.colors.accent}08` : tokens.colors.bgPanel,
                border: `1px solid ${selected ? tokens.colors.accent + '40' : tokens.colors.rule}`,
                borderRadius: tokens.radius.sm,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 100ms ease, border-color 100ms ease',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${tokens.colors.accent}06`;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = selected
                    ? `${tokens.colors.accent}08`
                    : tokens.colors.bgPanel;
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: tokens.space.sm,
                }}
            >
                <span
                    style={{
                        fontFamily: tokens.fonts.mono,
                        fontSize: 11,
                        color: tokens.colors.textMuted,
                    }}
                    className="cia-num"
                >
                    #{impact.rowId ?? '—'}
                </span>
                <span
                    style={{
                        fontSize: 11,
                        color: tokens.colors.accent,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}
                >
                    Open record →
                </span>
            </div>

            {record ? (
                <div style={{display: 'grid', gridTemplateColumns: '88px 1fr', columnGap: tokens.space.sm, rowGap: 6}}>
                    {VISIBLE_FIELDS.map(key => {
                        const fieldName = FIELDS[key];
                        const field = fieldsByName.get(fieldName);
                        if (!field) return null;
                        return (
                            <FieldRow key={fieldName} label={field.name}>
                                <CellRenderer record={record} field={field} shouldWrap />
                            </FieldRow>
                        );
                    })}
                    {(() => {
                        const desc = fieldsByName.get(FIELDS.description);
                        if (!desc) return null;
                        return (
                            <FieldRow label={desc.name}>
                                <CellRenderer
                                    record={record}
                                    field={desc}
                                    shouldWrap
                                    cellStyle={{
                                        fontSize: 12,
                                        color: tokens.colors.textMuted,
                                        lineHeight: 1.45,
                                    }}
                                />
                            </FieldRow>
                        );
                    })()}
                </div>
            ) : (
                <div style={{fontSize: 12, color: tokens.colors.textMuted}}>
                    {impact.component || '(no component)'} · {impact.persona ?? '—'}
                </div>
            )}
        </button>
    );
}

function FieldRow({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <>
            <span
                style={{
                    fontSize: 10,
                    color: tokens.colors.textFaint,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    paddingTop: 4,
                }}
            >
                {label}
            </span>
            <div style={{minWidth: 0}}>{children}</div>
        </>
    );
}
