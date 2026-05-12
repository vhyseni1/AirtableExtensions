import React, {useState} from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import Card from './Card';
import {colors, typography} from '../theme';

function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function buildSubText(row) {
    const parts = [];
    if (row.Field) parts.push(`Field: ${row.Field}`);
    if (row.Expected !== undefined && row.Expected !== '') parts.push(`Expected ${row.Expected}`);
    if (row.Actual !== undefined && row.Actual !== '') parts.push(`Got ${row.Actual}`);
    return truncate(parts.join('  ·  '), 80);
}

function Row({row, onExpandRecord}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                background: colors.bgAlt,
                borderLeft: `3px solid ${colors.rocheRed}`,
                borderRadius: 4,
                padding: '8px 10px',
                fontFamily: typography.family,
                gap: 12,
            }}
        >
            <div
                style={{
                    width: 80,
                    fontSize: 11,
                    color: colors.textTertiary,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                onClick={() => onExpandRecord(row.Record_ID)}
                title="Open record in Airtable"
            >
                {row.Record_ID || '—'}
            </div>
            <div style={{flex: 1, minWidth: 0}}>
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {row.Rule_Name || '—'}
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: colors.textTertiary,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {buildSubText(row)}
                </div>
            </div>
            <div
                style={{
                    width: 110,
                    fontSize: 12,
                    color: colors.textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {row.Owner_RRP || '—'}
            </div>
            <div
                style={{
                    width: 90,
                    fontSize: 12,
                    color: colors.textTertiary,
                    textAlign: 'right',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
            >
                {row.Rule_ID || '—'}
            </div>
        </div>
    );
}

export default function ExceptionList({
    recentHighSeverity,
    allHighSeverity,
    activeRrp,
    onClearRrp,
    eppRecords,
}) {
    const [showAll, setShowAll] = useState(false);

    function handleExpandRecord(recordId) {
        if (!eppRecords || !recordId) return;
        try {
            const match = eppRecords.find(
                r => r && r.getCellValueAsString('Worker_ID') === String(recordId),
            );
            if (match) expandRecord(match);
        } catch (e) {
            // expandRecord may not be available in all interface contexts;
            // silently ignore if it isn't.
        }
    }

    const total = allHighSeverity ? allHighSeverity.length : 0;

    const rightSlot = (
        <button
            type="button"
            onClick={() => setShowAll(true)}
            disabled={total === 0}
            style={{
                background: 'transparent',
                border: 'none',
                color: total === 0 ? colors.textTertiary : colors.rocheBlue,
                fontFamily: typography.family,
                fontSize: 12,
                cursor: total === 0 ? 'default' : 'pointer',
                padding: 0,
            }}
        >
            View all {total} →
        </button>
    );

    return (
        <Card title="Recent exceptions  ·  high severity" rightSlot={rightSlot}>
            {activeRrp && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 12,
                        fontFamily: typography.family,
                        fontSize: 12,
                    }}
                >
                    <span style={{color: colors.textSecondary}}>
                        Filtered by RRP:
                    </span>
                    <span
                        style={{
                            background: colors.rocheBlueLight,
                            color: colors.rocheBlue,
                            padding: '2px 10px',
                            borderRadius: 10,
                            fontWeight: 500,
                        }}
                    >
                        {activeRrp}
                    </span>
                    <button
                        type="button"
                        onClick={onClearRrp}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: colors.rocheBlue,
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: 0,
                        }}
                    >
                        Clear filter
                    </button>
                </div>
            )}

            {recentHighSeverity.length === 0 ? (
                <div
                    style={{
                        fontFamily: typography.family,
                        fontSize: 13,
                        color: colors.textTertiary,
                        padding: '12px 0',
                    }}
                >
                    No high-severity exceptions in the current view.
                </div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                    {recentHighSeverity.map((row, i) => (
                        <Row key={row._recordId || i} row={row} onExpandRecord={handleExpandRecord} />
                    ))}
                </div>
            )}

            {showAll && (
                <div
                    onClick={() => setShowAll(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: colors.white,
                            borderRadius: 4,
                            width: 'min(90vw, 800px)',
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: 24,
                            fontFamily: typography.family,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 12,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: typography.h2.size,
                                    fontWeight: typography.h2.weight,
                                    color: colors.textPrimary,
                                }}
                            >
                                All high-severity exceptions ({total})
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAll(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    fontSize: 18,
                                    color: colors.textSecondary,
                                    cursor: 'pointer',
                                    padding: 4,
                                    lineHeight: 1,
                                }}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                overflowY: 'auto',
                                flex: 1,
                            }}
                        >
                            {allHighSeverity.map((row, i) => (
                                <Row key={row._recordId || i} row={row} onExpandRecord={handleExpandRecord} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
