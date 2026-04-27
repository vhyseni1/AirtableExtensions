import {CellRenderer} from '@airtable/blocks/interface/ui';
import {tokens} from '../styles/tokens';
import {FIELDS, type Impact} from '../utils/schema';
import {EmptyState} from './primitives/EmptyState';
import {Panel} from './primitives/Panel';
import {PullQuote} from './primitives/PullQuote';
import {SeverityBadge} from './primitives/SeverityBadge';
import {TagChip} from './primitives/TagChip';

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
    impact: Impact | null;
    record: AirtableRecord | null;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    onOpen: (id: string) => void;
}

const ARROW_RE = /-->|→|=>/;

function splitAsIsToBe(description: string): {asIs: string; toBe: string} {
    const parts = description.split(ARROW_RE);
    if (parts.length >= 2) {
        const asIs = (parts[0] ?? '').replace(/^AS-IS\s*:?/i, '').trim();
        const toBe = (parts[1] ?? '').replace(/^TO-BE\s*:?/i, '').trim();
        return {asIs, toBe};
    }
    const asIsMatch = description.match(/AS-IS\s*:?\s*([\s\S]*?)(?:TO-BE|$)/i);
    const toBeMatch = description.match(/TO-BE\s*:?\s*([\s\S]*)$/i);
    return {
        asIs: asIsMatch?.[1]?.trim() ?? '',
        toBe: toBeMatch?.[1]?.trim() ?? '',
    };
}

const NATIVE_FIELDS: Array<keyof typeof FIELDS> = [
    'actionRequired',
    'responsible',
    'actionOwner',
    'timeline',
    'dependencies',
    'reviewerNotes',
];

export function SourceTrace({impact, record, fieldsByName, onOpen}: Props) {
    if (!impact) {
        return (
            <Panel eyebrow="Zone 04" title="Source trace" subtitle="Evidence behind the headline">
                <EmptyState line="Select an impact above to inspect its source." />
            </Panel>
        );
    }
    const {asIs, toBe} = splitAsIsToBe(impact.description);

    return (
        <Panel
            eyebrow="Zone 04"
            title="Source trace"
            subtitle={`Impact #${impact.rowId ?? '—'} · ${impact.persona ?? '—'} · ${impact.component || 'Unspecified'}`}
            actions={
                <button
                    type="button"
                    onClick={() => onOpen(impact.id)}
                    style={{
                        padding: '6px 12px',
                        background: tokens.colors.accent,
                        color: '#fff',
                        borderRadius: tokens.radius.sm,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}
                >
                    Open & edit record →
                </button>
            }
        >
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 4fr)',
                    gap: tokens.space.xl,
                }}
            >
                <div>
                    <PullQuote
                        quote={impact.sourceQuote}
                        attribution={impact.sourceDoc || undefined}
                    />
                    <div
                        style={{
                            marginTop: tokens.space.lg,
                            display: 'flex',
                            gap: tokens.space.sm,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}
                    >
                        <SeverityBadge severity={impact.severity} size="md" />
                        <ConfidenceBadge confidence={impact.confidence} />
                        {impact.tags.map(t => (
                            <TagChip key={t} tag={t} />
                        ))}
                    </div>
                    <div style={{marginTop: tokens.space.xl}}>
                        <FlowAsIsToBe asIs={asIs} toBe={toBe} />
                    </div>
                </div>

                <div>
                    <SectionHeading title="Record fields" subtitle="Native Airtable rendering — click below to edit" />
                    {record ? (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '120px 1fr',
                                rowGap: tokens.space.sm,
                                columnGap: tokens.space.md,
                                background: tokens.colors.bgPanel,
                                border: `1px solid ${tokens.colors.rule}`,
                                borderRadius: tokens.radius.sm,
                                padding: tokens.space.md,
                            }}
                        >
                            {NATIVE_FIELDS.map(key => {
                                const fieldName = FIELDS[key];
                                const field = fieldsByName.get(fieldName);
                                if (!field) return null;
                                return (
                                    <FieldPair key={fieldName} label={field.name}>
                                        <CellRenderer record={record} field={field} shouldWrap />
                                    </FieldPair>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState line="Native fields unavailable for this record." />
                    )}
                </div>
            </div>
        </Panel>
    );
}

function SectionHeading({title, subtitle}: {title: string; subtitle: string}) {
    return (
        <div style={{display: 'flex', alignItems: 'baseline', gap: tokens.space.md, marginBottom: tokens.space.sm}}>
            <h4
                style={{
                    margin: 0,
                    fontFamily: tokens.fonts.serif,
                    fontSize: 13,
                    fontWeight: 600,
                    color: tokens.colors.text,
                }}
            >
                {title}
            </h4>
            <span style={{fontSize: 10, color: tokens.colors.textMuted, letterSpacing: '0.04em'}}>{subtitle}</span>
        </div>
    );
}

function FieldPair({label, children}: {label: string; children: React.ReactNode}) {
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
            <div style={{minWidth: 0, fontSize: 12, color: tokens.colors.text}}>{children}</div>
        </>
    );
}

function ConfidenceBadge({confidence}: {confidence: string | null}) {
    const c = (confidence ?? '').toLowerCase();
    const dim =
        c === 'high'
            ? tokens.colors.sevLow
            : c === 'medium'
                ? tokens.colors.sevMed
                : c === 'low'
                    ? tokens.colors.sevHigh
                    : tokens.colors.textFaint;
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: dim,
                border: `1px solid ${dim}40`,
                borderRadius: tokens.radius.sm,
                background: `${dim}10`,
            }}
        >
            <span>Confidence</span>
            <span style={{color: dim, fontWeight: 700}}>{confidence ?? '—'}</span>
        </span>
    );
}

function FlowAsIsToBe({asIs, toBe}: {asIs: string; toBe: string}) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <FlowStep eyebrow="As-is" body={asIs || 'Not captured.'} accent={tokens.colors.sevHigh} />
            <Arrow />
            <FlowStep eyebrow="To-be" body={toBe || 'Not captured.'} accent={tokens.colors.sevLow} />
        </div>
    );
}

function FlowStep({eyebrow, body, accent}: {eyebrow: string; body: string; accent: string}) {
    return (
        <div
            style={{
                borderLeft: `3px solid ${accent}`,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: `${accent}06`,
                borderRadius: `0 ${tokens.radius.sm} ${tokens.radius.sm} 0`,
            }}
        >
            <span className="cia-eyebrow" style={{color: accent, letterSpacing: '0.12em'}}>
                {eyebrow}
            </span>
            <div style={{fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: tokens.colors.text}}>{body}</div>
        </div>
    );
}

function Arrow() {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                color: tokens.colors.textMuted,
                fontSize: 16,
                lineHeight: 1,
            }}
        >
            ↓
        </div>
    );
}
