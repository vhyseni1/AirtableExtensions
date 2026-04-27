import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {SeverityBadge} from './SeverityBadge';
import {TagChip} from './TagChip';

interface Props {
    impact: Impact;
    onOpen: (id: string) => void;
    onSelect?: (id: string) => void;
    selected?: boolean;
    showTags?: boolean;
}

function truncate(s: string, n: number): string {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function RecordRow({impact, onOpen, onSelect, selected, showTags = true}: Props) {
    const handleClick = () => {
        if (onSelect) onSelect(impact.id);
        onOpen(impact.id);
    };
    return (
        <button
            type="button"
            onClick={handleClick}
            style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr auto',
                alignItems: 'center',
                gap: tokens.space.md,
                padding: `${tokens.space.sm} ${tokens.space.md}`,
                background: selected ? `${tokens.colors.accent}08` : 'transparent',
                border: `1px solid ${selected ? tokens.colors.accent + '40' : tokens.colors.ruleSoft}`,
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
                    : 'transparent';
            }}
        >
            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                <span
                    className="cia-num"
                    style={{
                        fontFamily: tokens.fonts.mono,
                        fontSize: 11,
                        color: tokens.colors.textMuted,
                    }}
                >
                    #{impact.rowId ?? '—'}
                </span>
                <span
                    style={{
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        color: tokens.colors.textFaint,
                        textTransform: 'uppercase',
                        fontWeight: 600,
                    }}
                >
                    {impact.persona ?? '—'}
                </span>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0}}>
                <div
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: tokens.colors.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {impact.component || '(no component)'}
                </div>
                <div
                    style={{
                        fontSize: 12,
                        color: tokens.colors.textMuted,
                        lineHeight: 1.35,
                    }}
                >
                    {truncate(impact.description, 140)}
                </div>
                {showTags && impact.tags.length ? (
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2}}>
                        {impact.tags.map(t => (
                            <TagChip key={t} tag={t} />
                        ))}
                    </div>
                ) : null}
            </div>
            <SeverityBadge severity={impact.severity} />
        </button>
    );
}
