import React from 'react';
import {colors, spacing, typography} from '../theme';

export default function Card({title, rightSlot, children, style}) {
    return (
        <div
            style={{
                background: colors.white,
                border: `${spacing.borderWidth}px solid ${colors.border}`,
                borderRadius: spacing.cardRadius,
                padding: spacing.cardPadding,
                fontFamily: typography.family,
                minWidth: 0,
                ...style,
            }}
        >
            {(title || rightSlot) && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 16,
                    }}
                >
                    {title && (
                        <h2
                            style={{
                                margin: 0,
                                fontSize: typography.h2.size,
                                fontWeight: typography.h2.weight,
                                color: colors.textPrimary,
                            }}
                        >
                            {title}
                        </h2>
                    )}
                    {rightSlot}
                </div>
            )}
            {children}
        </div>
    );
}
