import {useMemo} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';

const RADIUS = {card: 16, inner: 12, pill: 980};
const SHADOW = {card: '0 1px 2px rgba(2,35,102,0.04), 0 8px 24px -12px rgba(2,35,102,0.16)'};

const REVIEW_GRID_URL = 'https://airtable.com/appNBuEitKHz7OyM7/pagZnlBdjiAQT6W8L';

interface Props {
    records: Impact[];
    onImport?: () => void;
}

/**
 * Review hand-off. The actual editing — inline edits, drag-to-fill, assigning
 * multiple users — happens in the native Airtable grid, which the SDK can't
 * embed. This panel orients the reviewer (live counts) and explains the flow.
 */
export function ReviewView({records, onImport}: Props) {
    const counts = useMemo(() => {
        const c = {Pending: 0, Reviewed: 0, Discarded: 0};
        for (const r of records) {
            if (r.validationStatus === 'Reviewed') c.Reviewed++;
            else if (r.validationStatus === 'Discarded') c.Discarded++;
            else c.Pending++;
        }
        return c;
    }, [records]);

    if (records.length === 0) {
        return (
            <div style={{...card, padding: tokens.space.xxl, textAlign: 'center', maxWidth: 900, margin: '0 auto'}}>
                <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, color: tokens.colors.text}}>
                    Nothing to review yet
                </h2>
                <p style={{margin: '8px auto 16px', maxWidth: 440, fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.6}}>
                    No records are visible to you. Import data first, then review it in the grid.
                </p>
                {onImport ? <button type="button" onClick={onImport} style={primaryBtn}>Import data</button> : null}
            </div>
        );
    }

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md, maxWidth: 900, margin: '0 auto', width: '100%'}}>
            <div style={{...card, padding: `${tokens.space.xl} ${tokens.space.xxl}`}}>
                <span style={eyebrow}>Review</span>
                <h2 style={{margin: '2px 0 0', fontFamily: tokens.fonts.serif, fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', color: tokens.colors.text}}>
                    Validate your data
                </h2>
                <p style={{margin: '6px 0 0', fontSize: 13.5, color: tokens.colors.textMuted, lineHeight: 1.6, maxWidth: 680}}>
                    Review happens in the <strong>Review grid</strong> — Airtable&apos;s native grid, which supports inline editing,
                    drag-to-fill, and assigning multiple users to a cell. Only records set to <strong>Reviewed</strong> appear on the
                    dashboard.
                </p>

                <div style={{display: 'flex', gap: tokens.space.md, flexWrap: 'wrap', alignItems: 'center', marginTop: tokens.space.lg}}>
                    <a href={REVIEW_GRID_URL} target="_blank" rel="noopener noreferrer" style={linkBtn}>
                        Open the Review grid ↗
                    </a>
                    <Stat label="Pending" value={counts.Pending} tone="pending" />
                    <Stat label="Reviewed" value={counts.Reviewed} tone="reviewed" />
                    <Stat label="Discarded" value={counts.Discarded} tone="muted" />
                </div>
            </div>

            <div style={{...card, padding: `${tokens.space.xl} ${tokens.space.xxl}`}}>
                <span style={eyebrow}>How to review</span>
                <ol style={{margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: tokens.colors.textMuted, lineHeight: 1.6}}>
                    <li>
                        Open the <a href={REVIEW_GRID_URL} target="_blank" rel="noopener noreferrer" style={{color: tokens.colors.accent, fontWeight: 600}}>Review grid</a> and work the{' '}
                        <strong>lowest-confidence</strong> rows first.
                    </li>
                    <li>Check each row against its Source Quote and correct anything the model got wrong.</li>
                    <li>
                        Set <strong>Validation Status → Reviewed</strong>. Select the cell and <strong>drag the fill handle</strong> down
                        to mark many rows at once, just like Excel.
                    </li>
                    <li>
                        To share records, add people to <strong>Accessible By</strong> — you can assign <strong>multiple users</strong> to
                        a single cell.
                    </li>
                    <li>Reviewed rows flow into the dashboard automatically.</li>
                </ol>
            </div>
        </div>
    );
}

function Stat({label, value, tone}: {label: string; value: number; tone: 'pending' | 'reviewed' | 'muted'}) {
    const color = {pending: '#C98A00', reviewed: tokens.colors.sevLow, muted: tokens.colors.textFaint}[tone];
    return (
        <div style={{display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 16px', borderRadius: RADIUS.pill, background: tokens.colors.bgAlt}}>
            <span style={{fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 700, color}}>{value}</span>
            <span style={{fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.colors.textMuted, fontWeight: 600}}>{label}</span>
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
const linkBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 18px',
    borderRadius: RADIUS.pill,
    background: tokens.colors.accent,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
    boxShadow: SHADOW.card,
};
