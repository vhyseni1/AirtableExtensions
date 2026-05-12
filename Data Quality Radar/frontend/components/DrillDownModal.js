import React, {useEffect} from 'react';
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

function findEppRecord(eppRecords, recordId) {
    if (!eppRecords || !recordId) return null;
    const key = String(recordId);
    return eppRecords.find(r => r && safeGet(r, 'Worker_ID') === key) || null;
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
    const chip = severityChip(severity);

    function handleOpen() {
        const epp = findEppRecord(eppRecords, recordId);
        if (epp) {
            expandRecord(epp);
        } else if (record) {
            // Fallback to expanding the exception record itself.
            expandRecord(record);
        }
    }

    return (
        <div
            onClick={handleOpen}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '12px 14px',
                background: colors.bgAlt,
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: typography.family,
                border: `1px solid ${colors.border}`,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = colors.rocheBlueLight;
                e.currentTarget.style.borderColor = colors.rocheBlue;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = colors.bgAlt;
                e.currentTarget.style.borderColor = colors.border;
            }}
            title="Open worker record"
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <span
                    style={{
                        background: chip.bg,
                        color: chip.text,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 10,
                        minWidth: 56,
                        textAlign: 'center',
                    }}
                >
                    {severity || '—'}
                </span>
                <span
                    style={{
                        fontFamily: 'ui-monospace, monospace',
                        color: colors.textTertiary,
                        fontSize: 12,
                    }}
                >
                    {ruleId}
                </span>
                <span
                    style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 500,
                        color: colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {ruleName}
                </span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                <span
                    style={{
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 11,
                        color: colors.textSecondary,
                        background: colors.white,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 3,
                        padding: '1px 6px',
                    }}
                >
                    {recordId || '—'}
                </span>
                {ownerRrp && (
                    <span style={{fontSize: 11, color: colors.textTertiary}}>
                        RRP: {ownerRrp}
                    </span>
                )}
            </div>
            {(field || expected || actual) && (
                <div style={{fontSize: 11, color: colors.textTertiary}}>
                    {field && <span>Field: {field}</span>}
                    {field && (expected || actual) && <span>  ·  </span>}
                    {expected && <span>Expected {expected}</span>}
                    {expected && actual && <span>  ·  </span>}
                    {actual && <span>Got {actual}</span>}
                </div>
            )}
        </div>
    );
}

export default function DrillDownModal({title, records, eppRecords, onClose}) {
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.25)',
                zIndex: 100,
                display: 'flex',
                justifyContent: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: colors.white,
                    width: 'min(520px, 92vw)',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
                    fontFamily: typography.family,
                    animation: 'dq-drawer-in 180ms ease-out',
                }}
            >
                <style>{`
                    @keyframes dq-drawer-in {
                        from { transform: translateX(40px); opacity: 0; }
                        to   { transform: translateX(0);    opacity: 1; }
                    }
                `}</style>
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0}}>
                        <div
                            style={{
                                fontSize: typography.h2.size,
                                fontWeight: typography.h2.weight,
                                color: colors.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {title}
                        </div>
                        <div style={{fontSize: 12, color: colors.textTertiary}}>
                            {records.length} record{records.length === 1 ? '' : 's'}  ·  click any row to open the worker
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: 22,
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            padding: 4,
                            lineHeight: 1,
                            marginLeft: 12,
                        }}
                    >
                        ×
                    </button>
                </div>
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
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
