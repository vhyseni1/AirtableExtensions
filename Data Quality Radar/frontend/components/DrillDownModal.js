import React from 'react';
import {expandRecord} from '@airtable/blocks/interface/ui';
import {colors, typography} from '../theme';

function severityChip(severity) {
    if (severity === 'High') return colors.severityHigh;
    if (severity === 'Medium') return colors.severityMed;
    return colors.severityLow;
}

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

function safeExpand(record) {
    try {
        if (record) expandRecord(record);
    } catch (e) {
        // expandRecord may be unavailable in some interface contexts.
    }
}

function Row({record, eppRecords}) {
    const severity = safeGet(record, 'Severity');
    const ruleId = safeGet(record, 'Rule_ID');
    const ruleName = safeGet(record, 'Rule_Name');
    const recordId = safeGet(record, 'Record_ID');
    const field = safeGet(record, 'Field');
    const expected = safeGet(record, 'Expected');
    const actual = safeGet(record, 'Actual');
    const ownerRrp = safeGet(record, 'Owner_RRP');
    const chipColors = severityChip(severity);

    function openWorker(e) {
        e.stopPropagation();
        if (!eppRecords || !recordId) return;
        const match = eppRecords.find(
            r => r && safeGet(r, 'Worker_ID') === String(recordId),
        );
        if (match) safeExpand(match);
    }

    return (
        <div
            onClick={() => safeExpand(record)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: colors.bgAlt,
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: typography.family,
            }}
            title="Open exception record"
        >
            <span
                style={{
                    background: chipColors.bg,
                    color: chipColors.text,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 10,
                    minWidth: 48,
                    textAlign: 'center',
                }}
            >
                {severity || '—'}
            </span>
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
                    <span style={{fontFamily: 'ui-monospace, monospace', color: colors.textTertiary, marginRight: 8}}>
                        {ruleId}
                    </span>
                    {ruleName}
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
                    {field && <span>Field: {field}  ·  </span>}
                    {expected && <span>Expected {expected}  ·  </span>}
                    {actual && <span>Got {actual}</span>}
                </div>
            </div>
            <button
                type="button"
                onClick={openWorker}
                title="Open worker record"
                style={{
                    background: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 11,
                    color: colors.textSecondary,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                }}
            >
                {recordId || '—'}
            </button>
            <span
                style={{
                    width: 110,
                    fontSize: 12,
                    color: colors.textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                }}
            >
                {ownerRrp || '—'}
            </span>
        </div>
    );
}

export default function DrillDownModal({title, records, eppRecords, onClose}) {
    return (
        <div
            onClick={onClose}
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
                    width: 'min(92vw, 900px)',
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
                        marginBottom: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: typography.h2.size,
                            fontWeight: typography.h2.weight,
                            color: colors.textPrimary,
                        }}
                    >
                        {title}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: 18,
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            padding: 4,
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>
                <div
                    style={{
                        fontSize: 12,
                        color: colors.textTertiary,
                        marginBottom: 12,
                    }}
                >
                    {records.length} record{records.length === 1 ? '' : 's'}.
                    Click a row to open the exception; click the worker ID to open the worker.
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
                    {records.length === 0 ? (
                        <div
                            style={{
                                color: colors.textTertiary,
                                fontSize: 13,
                                padding: '12px 0',
                            }}
                        >
                            No records match this selection.
                        </div>
                    ) : (
                        records.map((r, i) => (
                            <Row
                                key={r.id || i}
                                record={r}
                                eppRecords={eppRecords}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
