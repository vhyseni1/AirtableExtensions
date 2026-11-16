import {CellRenderer} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';

const RADIUS = {card: 16, inner: 12, pill: 980};
const SHADOW = {
    card: '0 1px 2px rgba(2,35,102,0.04), 0 8px 24px -12px rgba(2,35,102,0.16)',
    raised: '0 1px 2px rgba(2,35,102,0.06), 0 1px 1px rgba(2,35,102,0.04)',
};

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

type StatusFilter = 'Pending' | 'Reviewed' | 'Discarded' | 'All';

interface Props {
    records: Impact[];
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fields: ReadonlyArray<AirtableField>;
    onOpen: (id: string) => void;
    onImport?: () => void;
}

const LABEL_OVERRIDES: Record<string, string> = {'Persona (from Role)': 'Archetype', Persona: 'Archetype'};
const prettyLabel = (raw: string): string => LABEL_OVERRIDES[raw] ?? raw.replace(/_/g, ' ');

/** Native Airtable list columns are wider for long text. */
function colWidth(type: string, name: string): number {
    if (name.toLowerCase() === 'id') return 72;
    if (type === 'multilineText' || type === 'richText') return 300;
    if (type === 'multipleSelects' || type === 'multipleRecordLinks' || type === 'multipleCollaborators') return 190;
    if (type === 'singleLineText') return 190;
    return 150;
}

export function ReviewView({records, recordsById, fields, onOpen, onImport}: Props) {
    const counts = useMemo(() => {
        const c = {Pending: 0, Reviewed: 0, Discarded: 0};
        for (const r of records) {
            if (r.validationStatus === 'Reviewed') c.Reviewed++;
            else if (r.validationStatus === 'Discarded') c.Discarded++;
            else c.Pending++;
        }
        return c;
    }, [records]);

    const [filter, setFilter] = useState<StatusFilter>(counts.Pending > 0 ? 'Pending' : 'All');

    const shown = useMemo(() => {
        const list = filter === 'All' ? records : records.filter(r => (r.validationStatus ?? 'Pending') === filter);
        const rank = (c: Impact['confidence']) => (c === 'Low' ? 0 : c === 'Medium' ? 1 : c === 'High' ? 2 : 3);
        return [...list].sort((a, b) => rank(a.confidence) - rank(b.confidence));
    }, [records, filter]);

    if (records.length === 0) {
        return (
            <div style={{...card, padding: tokens.space.xxl, textAlign: 'center'}}>
                <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, color: tokens.colors.text}}>
                    Nothing to review yet
                </h2>
                <p style={{margin: '8px auto 16px', maxWidth: 440, fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.6}}>
                    No records are visible to you. Import data first, then come back here to validate it.
                </p>
                {onImport ? <button type="button" onClick={onImport} style={primaryBtn}>Import data</button> : null}
            </div>
        );
    }

    const gridTemplate = `44px ${fields.map(f => `${colWidth(f.type, f.name)}px`).join(' ')}`;

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <div style={{...card, padding: `${tokens.space.lg} ${tokens.space.xl}`}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 2, marginBottom: tokens.space.md}}>
                    <span style={eyebrow}>Review</span>
                    <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', color: tokens.colors.text}}>
                        Validate your data
                    </h2>
                    <p style={{margin: '2px 0 0', fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.6, maxWidth: 700}}>
                        Open each record, check it against its source, and set its Validation Status to <strong>Reviewed</strong>. Only
                        reviewed records appear on the dashboard. Lowest-confidence rows are listed first.
                    </p>
                </div>
                <div style={{display: 'flex', gap: tokens.space.sm, flexWrap: 'wrap'}}>
                    <Stat label="Pending" value={counts.Pending} tone="pending" />
                    <Stat label="Reviewed" value={counts.Reviewed} tone="reviewed" />
                    <Stat label="Discarded" value={counts.Discarded} tone="muted" />
                </div>
            </div>

            <Segmented
                options={[
                    {key: 'Pending', label: `Pending (${counts.Pending})`},
                    {key: 'Reviewed', label: `Reviewed (${counts.Reviewed})`},
                    {key: 'Discarded', label: `Discarded (${counts.Discarded})`},
                    {key: 'All', label: `All (${records.length})`},
                ]}
                active={filter}
                onChange={setFilter}
            />

            <div style={{...card, overflow: 'hidden'}}>
                {shown.length === 0 ? (
                    <p style={{margin: 0, padding: tokens.space.xxl, textAlign: 'center', fontSize: 13, color: tokens.colors.textMuted}}>
                        No {filter.toLowerCase()} records.
                    </p>
                ) : (
                    <div className="cia-scroll" style={{overflowX: 'auto'}}>
                        <div style={{minWidth: 'fit-content'}}>
                            {/* Header row */}
                            <div style={{display: 'grid', gridTemplateColumns: gridTemplate, background: tokens.colors.bgAlt, borderBottom: `1px solid ${tokens.colors.rule}`}}>
                                <HeaderCell />
                                {fields.map(f => (
                                    <HeaderCell key={f.id} label={prettyLabel(f.name)} />
                                ))}
                            </div>
                            {/* Data rows */}
                            {shown.map(r => {
                                const rec = recordsById.get(r.id);
                                return (
                                    <div
                                        key={r.id}
                                        onClick={() => onOpen(r.id)}
                                        style={{display: 'grid', gridTemplateColumns: gridTemplate, borderBottom: `1px solid ${tokens.colors.ruleSoft}`, cursor: 'pointer', background: tokens.colors.bgPanel}}
                                        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = tokens.colors.ruleSoft)}
                                        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = tokens.colors.bgPanel)}
                                    >
                                        <div style={{...cellBase, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.colors.textFaint}}>
                                            <span title="Expand record" style={{fontSize: 14}}>⤢</span>
                                        </div>
                                        {fields.map(f => (
                                            <div key={f.id} style={cellBase}>
                                                {rec ? (
                                                    <CellRenderer record={rec} field={f} cellStyle={{fontSize: 12.5}} />
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function HeaderCell({label}: {label?: string}) {
    return (
        <div style={{...cellBase, borderRight: `1px solid ${tokens.colors.ruleSoft}`}}>
            {label ? (
                <span style={{fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.colors.textMuted, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block'}}>
                    {label}
                </span>
            ) : null}
        </div>
    );
}

function Stat({label, value, tone}: {label: string; value: number; tone: 'pending' | 'reviewed' | 'muted'}) {
    const color = {pending: '#C98A00', reviewed: tokens.colors.sevLow, muted: tokens.colors.textFaint}[tone];
    return (
        <div style={{display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 14px', borderRadius: RADIUS.pill, background: tokens.colors.bgAlt}}>
            <span style={{fontFamily: tokens.fonts.serif, fontSize: 18, fontWeight: 700, color}}>{value}</span>
            <span style={{fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.colors.textMuted, fontWeight: 600}}>{label}</span>
        </div>
    );
}

function Segmented({options, active, onChange}: {options: {key: StatusFilter; label: string}[]; active: StatusFilter; onChange: (s: StatusFilter) => void}) {
    return (
        <div style={{display: 'flex', gap: 4, padding: 4, background: tokens.colors.bgAlt, borderRadius: RADIUS.inner, alignSelf: 'flex-start', flexWrap: 'wrap'}}>
            {options.map(o => {
                const on = o.key === active;
                return (
                    <button
                        key={o.key}
                        type="button"
                        onClick={() => onChange(o.key)}
                        style={{padding: '7px 14px', borderRadius: RADIUS.inner - 4, border: 'none', background: on ? tokens.colors.bgPanel : 'transparent', boxShadow: on ? SHADOW.raised : 'none', color: on ? tokens.colors.text : tokens.colors.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer'}}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

const cellBase: React.CSSProperties = {
    padding: '9px 12px',
    minWidth: 0,
    borderRight: `1px solid ${tokens.colors.ruleSoft}`,
    overflow: 'hidden',
};
const card: React.CSSProperties = {
    background: tokens.colors.bgPanel,
    borderRadius: RADIUS.card,
    boxShadow: SHADOW.card,
};
const eyebrow: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colors.textFaint,
    fontWeight: 700,
};
const primaryBtn: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: RADIUS.pill,
    border: 'none',
    background: tokens.colors.accent,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
};
