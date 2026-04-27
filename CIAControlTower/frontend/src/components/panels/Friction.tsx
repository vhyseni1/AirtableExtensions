import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from '../primitives/EmptyState';
import {Panel} from '../primitives/Panel';
import {SeverityBadge} from '../primitives/SeverityBadge';

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
    friction: Impact[];
    recordsById?: ReadonlyMap<string, AirtableRecord>;
    fieldsByName?: ReadonlyMap<string, AirtableField>;
    onOpen: (id: string) => void;
    onSelect: (id: string) => void;
    selectedId?: string | null;
}

interface Parties {
    a: string;
    b: string;
    summary: string;
}

const NAME_RE = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b/g;
const SEPARATOR_RE = /\s+(?:vs\.?|versus|disagree[ds]? with|pushed back on|conflicted? with|countered)\s+/i;
const ROLE_RE = /\b(Global|MWM|Affiliate|PJP|HCD|HSP|GSCL|CSR|Admin|Marketing|Tech(?:nology)?|Procurement|Finance)\b/g;

function extractParties(quote: string, fallbackA = 'Party A', fallbackB = 'Party B'): Parties {
    const text = quote.replace(/\s+/g, ' ').trim();
    if (!text) return {a: fallbackA, b: fallbackB, summary: ''};

    const sepMatch = text.match(SEPARATOR_RE);
    if (sepMatch && sepMatch.index != null) {
        const left = text.slice(0, sepMatch.index).trim();
        const right = text.slice(sepMatch.index + sepMatch[0].length).trim();
        const a = (left.match(NAME_RE)?.slice(-1)[0]) ?? (left.match(ROLE_RE)?.[0]) ?? fallbackA;
        const b = (right.match(NAME_RE)?.[0]) ?? (right.match(ROLE_RE)?.[0]) ?? fallbackB;
        return {a, b, summary: text};
    }

    const names = [...new Set(text.match(NAME_RE) ?? [])];
    const roles = [...new Set(text.match(ROLE_RE) ?? [])];
    const pool = names.length >= 2 ? names : roles;
    const a = pool[0] ?? fallbackA;
    const b = pool[1] ?? fallbackB;
    return {a, b, summary: text};
}

function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function FrictionPanel({friction, onOpen, onSelect, selectedId}: Props) {
    return (
        <Panel
            eyebrow="Panel D"
            title="Where alignment is failing"
            subtitle={`${friction.length} recorded disagreement${friction.length === 1 ? '' : 's'}`}
        >
            {friction.length === 0 ? (
                <EmptyState line="No friction recorded in this run. Healthy alignment." />
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
                    {friction.map(f => {
                        const parties = extractParties(f.sourceQuote || f.description);
                        const selected = selectedId === f.id;
                        return (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => {
                                    onSelect(f.id);
                                    onOpen(f.id);
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: tokens.space.sm,
                                    padding: tokens.space.md,
                                    border: `1px solid ${selected ? tokens.colors.tagFriction + '60' : tokens.colors.ruleSoft}`,
                                    background: selected ? `${tokens.colors.tagFriction}08` : 'transparent',
                                    borderRadius: tokens.radius.sm,
                                    width: '100%',
                                    textAlign: 'left',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = `${tokens.colors.tagFriction}08`;
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = selected
                                        ? `${tokens.colors.tagFriction}08`
                                        : 'transparent';
                                }}
                            >
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto 1fr',
                                        alignItems: 'center',
                                        gap: tokens.space.sm,
                                    }}
                                >
                                    <Party name={parties.a} side="left" />
                                    <span
                                        style={{
                                            fontSize: 14,
                                            color: tokens.colors.tagFriction,
                                            fontWeight: 700,
                                        }}
                                    >
                                        ⟑
                                    </span>
                                    <Party name={parties.b} side="right" />
                                </div>
                                <div
                                    style={{
                                        fontSize: 11.5,
                                        color: tokens.colors.textMuted,
                                        fontFamily: tokens.fonts.serif,
                                        fontStyle: 'italic',
                                        lineHeight: 1.45,
                                    }}
                                >
                                    {truncate(parties.summary, 180)}
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            color: tokens.colors.textFaint,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {f.component || 'Unspecified'} · {f.persona ?? '—'}
                                    </span>
                                    <SeverityBadge severity={f.severity} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}

function Party({name, side}: {name: string; side: 'left' | 'right'}) {
    return (
        <div
            style={{
                fontSize: 12,
                fontWeight: 600,
                color: tokens.colors.text,
                textAlign: side === 'left' ? 'right' : 'left',
                letterSpacing: '0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
            {name}
        </div>
    );
}
