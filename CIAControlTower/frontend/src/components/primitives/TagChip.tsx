import {tagColor, tokens} from '../../styles/tokens';
import {type Tag} from '../../utils/schema';

interface Props {
    tag: Tag;
    active?: boolean;
    onClick?: () => void;
    size?: 'sm' | 'md';
}

const GLYPH: Record<Tag, string> = {
    Heatmap: '◆',
    Pressure: '●',
    Gap: '▸',
    Friction: '⟑',
};

export function TagChip({tag, active, onClick, size = 'sm'}: Props) {
    const color = tagColor(tag);
    const padV = size === 'md' ? '4px' : '2px';
    const padH = size === 'md' ? '10px' : '6px';
    const fontSize = size === 'md' ? 11 : 10;
    const interactive = !!onClick;
    const pulse = tag === 'Pressure' && active;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!interactive}
            className={pulse ? 'cia-pulse' : undefined}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: `${padV} ${padH}`,
                borderRadius: 999,
                background: active ? color : `${color}10`,
                color: active ? '#fff' : color,
                border: `1px solid ${active ? color : color + '40'}`,
                fontSize,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: tokens.fonts.sans,
                cursor: interactive ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
                transition: 'background 120ms ease, color 120ms ease',
            }}
        >
            <span style={{fontSize: fontSize - 1}}>{GLYPH[tag]}</span>
            {tag}
        </button>
    );
}
