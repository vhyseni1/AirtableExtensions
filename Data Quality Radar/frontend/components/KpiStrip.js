import React from 'react';
import {colors, spacing, typography, scoreColor} from '../theme';

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

function Card({label, value, valueColor, subLabel, subColor, onClick}) {
    const interactive = typeof onClick === 'function';
    return (
        <div
            onClick={interactive ? onClick : undefined}
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
                cursor: interactive ? 'pointer' : 'default',
                transition: 'border-color 120ms ease',
            }}
            onMouseEnter={e => {
                if (interactive) e.currentTarget.style.borderColor = colors.rocheBlue;
            }}
            onMouseLeave={e => {
                if (interactive) e.currentTarget.style.borderColor = colors.border;
            }}
            title={interactive ? 'Click to drill into underlying records' : undefined}
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

export default function KpiStrip({data, onDrillDown}) {
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
                onClick={() => onDrillDown(
                    'EPP records with exceptions',
                    r => safeGet(r, 'Source_Table') === 'EPP',
                )}
            />
            <Card
                label="Total exceptions"
                value={totalExceptions}
                subLabel={`across ${dimensionCount} dimension${dimensionCount === 1 ? '' : 's'}`}
                subColor={colors.textTertiary}
                onClick={() => onDrillDown('All exceptions', () => true)}
            />
            <Card
                label="High severity"
                value={highSeverity}
                valueColor={colors.rocheRed}
                subLabel="CSRD-blocking"
                subColor={colors.rocheRed}
                onClick={() => onDrillDown(
                    'High-severity exceptions',
                    r => safeGet(r, 'Severity') === 'High',
                )}
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
