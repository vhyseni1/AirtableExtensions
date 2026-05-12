import React from 'react';
import {colors, spacing, typography, scoreColor} from '../theme';

function Card({label, value, valueColor, subLabel, subColor}) {
    return (
        <div
            style={{
                flex: 1,
                background: colors.white,
                border: `${spacing.borderWidth}px solid ${colors.border}`,
                borderRadius: spacing.cardRadius,
                padding: spacing.cardPadding,
                fontFamily: typography.family,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 0,
            }}
        >
            <div style={{fontSize: typography.small.size, color: colors.textTertiary}}>
                {label}
            </div>
            <div
                style={{
                    fontSize: typography.metric.size,
                    fontWeight: typography.metric.weight,
                    color: valueColor || colors.textPrimary,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>
            <div style={{fontSize: 11, color: subColor || colors.textTertiary}}>
                {subLabel}
            </div>
        </div>
    );
}

export default function KpiStrip({data}) {
    const {
        totalEpp,
        recordsWithExceptions,
        totalExceptions,
        highSeverity,
        compositeScore,
        dimensionCount,
    } = data;

    const exceptionPct = totalEpp > 0
        ? Math.round(recordsWithExceptions / totalEpp * 100)
        : 0;

    return (
        <div style={{display: 'flex', gap: spacing.cardGap}}>
            <Card
                label="Records with exceptions"
                value={`${recordsWithExceptions} / ${totalEpp}`}
                subLabel={`${exceptionPct}% of EW base`}
                subColor={colors.rocheRed}
            />
            <Card
                label="Total exceptions"
                value={totalExceptions}
                subLabel={`across ${dimensionCount} dimension${dimensionCount === 1 ? '' : 's'}`}
                subColor={colors.textTertiary}
            />
            <Card
                label="High severity"
                value={highSeverity}
                valueColor={colors.rocheRed}
                subLabel="CSRD-blocking"
                subColor={colors.rocheRed}
            />
            <Card
                label="Composite DQ score"
                value={compositeScore}
                valueColor={scoreColor(compositeScore)}
                subLabel="Target: ≥ 90"
                subColor={colors.textTertiary}
            />
        </div>
    );
}
