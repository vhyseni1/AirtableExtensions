import {useCallback, useMemo, useRef, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {Panel} from '../primitives/Panel';

type Phase = 'idle' | 'processing' | 'success';

interface SourceKind {
    key: string;
    label: string;
    icon: string;
    color: string;
}

const KINDS: Record<string, SourceKind> = {
    transcript: {key: 'transcript', label: 'Meeting transcript', icon: '🎙', color: '#0B41CD'},
    flipchart: {key: 'flipchart', label: 'Flip chart', icon: '📋', color: '#FF7D29'},
    notes: {key: 'notes', label: 'Notes', icon: '📝', color: '#00B458'},
    kdi: {key: 'kdi', label: 'KDI', icon: '📊', color: '#C40000'},
    lucid: {key: 'lucid', label: 'Lucid board', icon: '🧩', color: '#BC36F0'},
};

interface SourceItem {
    id: string;
    name: string;
    kind: keyof typeof KINDS;
    sessionDate: string;
    meta: string;
}

/** Mock library of capture artefacts available for processing. */
const LIBRARY: ReadonlyArray<SourceItem> = [
    {id: 's1', name: 'Leadership kickoff — working session', kind: 'transcript', sessionDate: '2026-08-18', meta: '58 min · 6 speakers'},
    {id: 's2', name: 'Current-state pain points (wall)', kind: 'flipchart', sessionDate: '2026-08-18', meta: '4 photos'},
    {id: 's3', name: 'Affiliate readiness workshop', kind: 'transcript', sessionDate: '2026-08-21', meta: '1h 42 min · 11 speakers'},
    {id: 's4', name: 'Process redesign — facilitator notes', kind: 'notes', sessionDate: '2026-08-21', meta: '3 pages'},
    {id: 's5', name: 'KDI baseline extract — Q2', kind: 'kdi', sessionDate: '2026-08-25', meta: '212 rows'},
    {id: 's6', name: 'Operating model future-state', kind: 'lucid', sessionDate: '2026-08-27', meta: '2 frames · 40 cards'},
    {id: 's7', name: 'Role impact deep-dive', kind: 'transcript', sessionDate: '2026-09-01', meta: '55 min · 8 speakers'},
    {id: 's8', name: 'Change network brainstorm', kind: 'flipchart', sessionDate: '2026-09-01', meta: '6 photos'},
    {id: 's9', name: 'Stakeholder interviews — consolidated', kind: 'notes', sessionDate: '2026-09-03', meta: '9 pages'},
    {id: 's10', name: 'Journey map — to-be', kind: 'lucid', sessionDate: '2026-09-04', meta: '1 frame · 63 cards'},
];

function fmtDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, {day: '2-digit', month: 'short', year: 'numeric'});
}

/**
 * Data-intake page. Purely a front-end mock: selecting sources and running
 * "process" never touches Airtable or any backend — it simulates parsing and
 * reports success. Nothing is persisted.
 */
export function AddDataView() {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [phase, setPhase] = useState<Phase>('idle');
    const [processingIdx, setProcessingIdx] = useState(0);
    const [processedIds, setProcessedIds] = useState<string[]>([]);
    const timers = useRef<number[]>([]);

    const selectedItems = useMemo(() => LIBRARY.filter(s => selected.has(s.id)), [selected]);

    const toggle = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setPhase('idle');
    }, []);

    const toggleAll = useCallback(() => {
        setSelected(prev => (prev.size === LIBRARY.length ? new Set() : new Set(LIBRARY.map(s => s.id))));
        setPhase('idle');
    }, []);

    const reset = useCallback(() => {
        timers.current.forEach(t => window.clearTimeout(t));
        timers.current = [];
        setSelected(new Set());
        setPhase('idle');
        setProcessingIdx(0);
        setProcessedIds([]);
    }, []);

    const process = useCallback(() => {
        const ids = selectedItems.map(s => s.id);
        if (ids.length === 0) return;
        setProcessedIds(ids);
        setProcessingIdx(0);
        setPhase('processing');
        timers.current.forEach(t => window.clearTimeout(t));
        timers.current = [];
        // Step through each source for a convincing loader — no real parsing.
        const per = 650;
        ids.forEach((_, i) => {
            timers.current.push(window.setTimeout(() => setProcessingIdx(i + 1), per * (i + 1)));
        });
        timers.current.push(window.setTimeout(() => setPhase('success'), per * ids.length + 500));
    }, [selectedItems]);

    const allSelected = selected.size === LIBRARY.length && LIBRARY.length > 0;
    const processingItems = useMemo(
        () => processedIds.map(id => LIBRARY.find(s => s.id === id)).filter((s): s is SourceItem => !!s),
        [processedIds],
    );

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <Panel
                eyebrow="Intake"
                title="Select sources to process"
                subtitle="Meeting transcripts, flip charts, notes, KDI extracts and Lucid boards captured across sessions"
                actions={
                    <button type="button" onClick={toggleAll} style={secondaryBtn} disabled={phase === 'processing'}>
                        {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                }
            >
                {/* Column header */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1.6fr 150px 120px',
                        gap: tokens.space.sm,
                        alignItems: 'center',
                        padding: `${tokens.space.xs} ${tokens.space.sm}`,
                        borderBottom: `1px solid ${tokens.colors.rule}`,
                    }}
                >
                    <span />
                    <span className="cia-eyebrow">Source</span>
                    <span className="cia-eyebrow">Type</span>
                    <span className="cia-eyebrow" style={{textAlign: 'right'}}>Session date</span>
                </div>

                <div style={{display: 'flex', flexDirection: 'column'}}>
                    {LIBRARY.map(item => {
                        const kind = KINDS[item.kind]!;
                        const isSel = selected.has(item.id);
                        return (
                            <label
                                key={item.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 1.6fr 150px 120px',
                                    gap: tokens.space.sm,
                                    alignItems: 'center',
                                    padding: `${tokens.space.sm}`,
                                    borderBottom: `1px solid ${tokens.colors.ruleSoft}`,
                                    background: isSel ? tokens.colors.accentTint : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'background 100ms ease',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={() => toggle(item.id)}
                                    disabled={phase === 'processing'}
                                    style={{width: 16, height: 16, accentColor: tokens.colors.accent, cursor: 'pointer'}}
                                />
                                <span style={{minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1}}>
                                    <span style={{fontSize: 13, fontWeight: 600, color: tokens.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                        {item.name}
                                    </span>
                                    <span style={{fontSize: 11, color: tokens.colors.textFaint, fontFamily: tokens.fonts.mono}}>
                                        {item.meta}
                                    </span>
                                </span>
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: kind.color,
                                    }}
                                >
                                    <span aria-hidden>{kind.icon}</span>
                                    {kind.label}
                                </span>
                                <span style={{fontSize: 12, color: tokens.colors.textMuted, textAlign: 'right', fontFamily: tokens.fonts.mono}}>
                                    {fmtDate(item.sessionDate)}
                                </span>
                            </label>
                        );
                    })}
                </div>

                {/* Footer / action row */}
                {phase === 'success' ? (
                    <div
                        role="status"
                        style={{
                            marginTop: tokens.space.md,
                            display: 'flex',
                            alignItems: 'center',
                            gap: tokens.space.sm,
                            padding: tokens.space.md,
                            background: '#E7F8EF',
                            border: `1px solid ${tokens.colors.sevLow}`,
                            borderRadius: tokens.radius.md,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: tokens.colors.sevLow,
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                flexShrink: 0,
                            }}
                        >
                            ✓
                        </span>
                        <div style={{flex: 1, minWidth: 0}}>
                            <div style={{fontSize: 13, fontWeight: 700, color: '#046B38'}}>
                                Data successfully parsed
                            </div>
                            <div style={{fontSize: 11, color: '#2E7D52'}}>
                                {processingItems.length} source{processingItems.length === 1 ? '' : 's'} processed · entities extracted and mapped to the control tower
                            </div>
                        </div>
                        <button type="button" onClick={reset} style={secondaryBtn}>
                            Process more
                        </button>
                    </div>
                ) : phase === 'processing' ? (
                    <div
                        style={{
                            marginTop: tokens.space.md,
                            padding: tokens.space.md,
                            background: tokens.colors.bgAlt,
                            border: `1px solid ${tokens.colors.rule}`,
                            borderRadius: tokens.radius.md,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: tokens.space.sm,
                        }}
                    >
                        <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.sm}}>
                            <span
                                className="cia-spin"
                                aria-hidden
                                style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    border: `2px solid ${tokens.colors.accentTint}`,
                                    borderTopColor: tokens.colors.accent,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{fontSize: 13, fontWeight: 700, color: tokens.colors.text}}>
                                Processing data…
                            </span>
                            <span style={{fontSize: 12, color: tokens.colors.textMuted, marginLeft: 'auto', fontFamily: tokens.fonts.mono}}>
                                {Math.min(processingIdx, processingItems.length)} / {processingItems.length}
                            </span>
                        </div>
                        <div
                            style={{
                                height: 6,
                                borderRadius: 3,
                                background: tokens.colors.ruleSoft,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    height: '100%',
                                    width: `${processingItems.length ? (processingIdx / processingItems.length) * 100 : 0}%`,
                                    background: `linear-gradient(90deg, ${tokens.colors.accent}, ${tokens.colors.accentSoft})`,
                                    borderRadius: 3,
                                    transition: 'width 450ms ease',
                                }}
                            />
                        </div>
                        <div style={{fontSize: 11, color: tokens.colors.textMuted, fontFamily: tokens.fonts.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            {processingIdx < processingItems.length
                                ? `Parsing: ${processingItems[processingIdx]?.name ?? ''}`
                                : 'Finalising extraction…'}
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            marginTop: tokens.space.md,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: tokens.space.md,
                            flexWrap: 'wrap',
                        }}
                    >
                        <span style={{fontSize: 12, color: tokens.colors.textMuted}}>
                            {selected.size === 0
                                ? 'No sources selected.'
                                : `${selected.size} source${selected.size === 1 ? '' : 's'} selected for processing`}
                        </span>
                        <button
                            type="button"
                            onClick={process}
                            disabled={selected.size === 0}
                            style={{
                                ...primaryBtn,
                                opacity: selected.size === 0 ? 0.5 : 1,
                                cursor: selected.size === 0 ? 'default' : 'pointer',
                            }}
                        >
                            Process selected →
                        </button>
                    </div>
                )}
            </Panel>

            <Panel eyebrow="Demo" title="How intake works" subtitle="What happens when you process sources">
                <ol style={{margin: 0, paddingLeft: 18, color: tokens.colors.textMuted, fontSize: 13, lineHeight: 1.7}}>
                    <li>Pick the captured artefacts from the session library above.</li>
                    <li>
                        <strong style={{color: tokens.colors.text}}>Process</strong> transcribes, OCRs and parses each
                        source, extracting impacts, roles and tags.
                    </li>
                    <li>Parsed entities flow into the control tower and refresh every view.</li>
                </ol>
                <p
                    style={{
                        marginTop: tokens.space.md,
                        marginBottom: 0,
                        fontSize: 11,
                        color: tokens.colors.textFaint,
                        fontStyle: 'italic',
                    }}
                >
                    Preview build — processing is simulated and nothing is written to the base.
                </p>
            </Panel>
        </div>
    );
}

const primaryBtn: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: 'none',
    borderRadius: tokens.radius.sm,
    background: tokens.colors.accent,
    color: '#FFFFFF',
};

const secondaryBtn: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    background: tokens.colors.bgPanel,
    color: tokens.colors.text,
    cursor: 'pointer',
};
