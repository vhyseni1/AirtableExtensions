import {useMemo, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {sevColor} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';

const RADIUS = {card: 16, inner: 12, pill: 980};
const SHADOW = {
    card: '0 1px 2px rgba(2,35,102,0.04), 0 8px 24px -12px rgba(2,35,102,0.16)',
    raised: '0 1px 2px rgba(2,35,102,0.06), 0 1px 1px rgba(2,35,102,0.04)',
};

type StatusFilter = 'Pending' | 'Reviewed' | 'Discarded' | 'All';

interface Props {
    records: Impact[];
    onOpen: (id: string) => void;
    onImport?: () => void;
}

export function ReviewView({records, onOpen, onImport}: Props) {
    const counts = useMemo(() => {
        const c = {Pending: 0, Reviewed: 0, Discarded: 0, Unset: 0};
        for (const r of records) {
            if (r.validationStatus === 'Pending') c.Pending++;
            else if (r.validationStatus === 'Reviewed') c.Reviewed++;
            else if (r.validationStatus === 'Discarded') c.Discarded++;
            else c.Unset++;
        }
        return c;
    }, [records]);

    const [filter, setFilter] = useState<StatusFilter>(counts.Pending > 0 ? 'Pending' : 'All');

    const shown = useMemo(() => {
        const list = filter === 'All' ? records : records.filter(r => (r.validationStatus ?? 'Pending') === filter);
        // Lowest confidence first within the view, so the riskiest get reviewed first.
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

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <div style={{...card, padding: `${tokens.space.lg} ${tokens.space.xl}`}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 2, marginBottom: tokens.space.md}}>
                    <span style={eyebrow}>Review</span>
                    <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', color: tokens.colors.text}}>
                        Validate your data
                    </h2>
                    <p style={{margin: '2px 0 0', fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.6, maxWidth: 680}}>
                        Open each record, check it against its source, and set its Validation Status to{' '}
                        <strong>Reviewed</strong>. Only reviewed records appear on the dashboard. Start with the lowest-confidence rows.
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

            <div style={card}>
                {shown.length === 0 ? (
                    <p style={{margin: 0, padding: tokens.space.xxl, textAlign: 'center', fontSize: 13, color: tokens.colors.textMuted}}>
                        No {filter.toLowerCase()} records.
                    </p>
                ) : (
                    <div>
                        {shown.map((r, i) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => onOpen(r.id)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '54px 1fr auto',
                                    alignItems: 'center',
                                    gap: tokens.space.md,
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: `${tokens.space.md} ${tokens.space.lg}`,
                                    background: 'transparent',
                                    border: 'none',
                                    borderTop: i === 0 ? 'none' : `1px solid ${tokens.colors.ruleSoft}`,
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{fontFamily: tokens.fonts.mono, fontSize: 12, color: tokens.colors.textFaint}}>
                                    {r.recordNumber != null ? `#${r.recordNumber}` : '—'}
                                </span>
                                <span style={{minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2}}>
                                    <span style={{fontSize: 13.5, fontWeight: 600, color: tokens.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                        {r.role || r.changeComponent || 'Untitled'}
                                    </span>
                                    <span style={{fontSize: 12, color: tokens.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                        {[r.changeCategory, r.affiliate].filter(Boolean).join(' · ') || '—'}
                                    </span>
                                </span>
                                <span style={{display: 'flex', alignItems: 'center', gap: tokens.space.sm, flexShrink: 0}}>
                                    {r.changeImpact ? <Pill text={r.changeImpact} color={sevColor(r.changeImpact)} /> : null}
                                    {r.confidence ? <span style={{fontSize: 11, color: tokens.colors.textFaint, fontFamily: tokens.fonts.mono}}>{r.confidence} conf.</span> : null}
                                    <StatusPill status={r.validationStatus ?? 'Pending'} />
                                    <span aria-hidden style={{color: tokens.colors.textFaint, fontSize: 16}}>›</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({label, value, tone}: {label: string; value: number; tone: 'pending' | 'reviewed' | 'muted'}) {
    const color = {pending: '#C98A00', reviewed: tokens.colors.sevLow, muted: tokens.colors.textFaint}[tone];
    return (
        <div style={{display: 'flex', alignItems: 'baseline', gap: 8, padding: `6px 14px`, borderRadius: RADIUS.pill, background: tokens.colors.bgAlt}}>
            <span style={{fontFamily: tokens.fonts.serif, fontSize: 18, fontWeight: 700, color}}>{value}</span>
            <span style={{fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.colors.textMuted, fontWeight: 600}}>{label}</span>
        </div>
    );
}

function Pill({text, color}: {text: string; color: string}) {
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: tokens.colors.text}}>
            <span aria-hidden style={{width: 8, height: 8, borderRadius: '50%', background: color}} />
            {text}
        </span>
    );
}

function StatusPill({status}: {status: string}) {
    const map: Record<string, {bg: string; color: string}> = {
        Pending: {bg: '#FFF4D6', color: '#8A5B00'},
        Reviewed: {bg: '#E7F8EF', color: '#046B38'},
        Discarded: {bg: tokens.colors.bgAlt, color: tokens.colors.textFaint},
    };
    const s = map[status] ?? map.Pending!;
    return (
        <span style={{padding: '3px 10px', borderRadius: RADIUS.pill, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase'}}>
            {status}
        </span>
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
                        style={{
                            padding: '7px 14px',
                            borderRadius: RADIUS.inner - 4,
                            border: 'none',
                            background: on ? tokens.colors.bgPanel : 'transparent',
                            boxShadow: on ? SHADOW.raised : 'none',
                            color: on ? tokens.colors.text : tokens.colors.textMuted,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

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
