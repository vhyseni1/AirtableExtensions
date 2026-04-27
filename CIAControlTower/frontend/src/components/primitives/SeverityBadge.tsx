import {sevColor, tokens} from '../../styles/tokens';
import {type Severity} from '../../utils/schema';

interface Props {
    severity: Severity | null;
    size?: 'sm' | 'md';
}

export function SeverityBadge({severity, size = 'sm'}: Props) {
    const color = sevColor(severity);
    const label = severity ?? '—';
    const padV = size === 'md' ? '3px' : '2px';
    const padH = size === 'md' ? '8px' : '6px';
    const fontSize = size === 'md' ? 11 : 10;
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: `${padV} ${padH}`,
                borderRadius: tokens.radius.sm,
                background: `${color}14`,
                color,
                fontSize,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: `1px solid ${color}33`,
                fontFamily: tokens.fonts.sans,
                whiteSpace: 'nowrap',
            }}
        >
            <span
                style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                }}
            />
            {label}
        </span>
    );
}
