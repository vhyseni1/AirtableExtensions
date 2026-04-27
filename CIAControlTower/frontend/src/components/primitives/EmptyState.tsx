import {tokens} from '../../styles/tokens';

interface Props {
    line: string;
}

export function EmptyState({line}: Props) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: 80,
                padding: tokens.space.lg,
                fontFamily: tokens.fonts.serif,
                fontStyle: 'italic',
                fontSize: 14,
                color: tokens.colors.textMuted,
                textAlign: 'center',
            }}
        >
            {line}
        </div>
    );
}
