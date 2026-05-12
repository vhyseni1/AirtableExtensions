import React, {useState} from 'react';
import {isRuleActive, asNormalizedString} from '../engine/helpers';

const styles = {
    wrap: {marginBottom: 16},
    header: {
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        userSelect: 'none',
    },
    caret: {
        display: 'inline-block',
        width: 16,
        textAlign: 'center',
        marginRight: 4,
        color: '#6b7280',
    },
    h2: {fontSize: 14, fontWeight: 600, margin: 0},
    list: {marginTop: 8, paddingLeft: 8},
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '4px 0',
        borderBottom: '1px solid #f3f4f6',
    },
    label: {marginLeft: 8, flex: 1, fontSize: 13},
    sev: {color: '#6b7280', fontSize: 12, marginLeft: 8},
};

export default function RulesPanel({table, records, disabled}) {
    const [open, setOpen] = useState(false);

    if (!records) return null;

    const activeCount = records.filter(
        r => isRuleActive(r.getCellValue('Active')),
    ).length;

    async function toggle(record, on) {
        const activeField = table.getFieldByNameIfExists('Active');
        let payload;
        if (activeField && activeField.type === 'checkbox') {
            payload = on;
        } else if (activeField && activeField.type === 'singleLineText') {
            payload = on ? 'Yes' : 'No';
        } else {
            payload = {name: on ? 'Yes' : 'No'};
        }
        await table.updateRecordAsync(record, {Active: payload});
    }

    return (
        <div style={styles.wrap}>
            <div style={styles.header} onClick={() => setOpen(!open)}>
                <span style={styles.caret}>{open ? '▾' : '▸'}</span>
                <h2 style={styles.h2}>
                    Active rules ({activeCount}/{records.length})
                </h2>
            </div>

            {open && (
                <div style={styles.list}>
                    {records.map(record => {
                        const id = asNormalizedString(record.getCellValue('Rule_ID'));
                        const name = asNormalizedString(record.getCellValue('Rule_Name'));
                        const severity = asNormalizedString(record.getCellValue('Severity'));
                        const isOn = isRuleActive(record.getCellValue('Active'));
                        return (
                            <div key={record.id} style={styles.row}>
                                <input
                                    type="checkbox"
                                    checked={isOn}
                                    onChange={e => toggle(record, e.target.checked)}
                                    disabled={disabled}
                                />
                                <span style={styles.label}>
                                    <strong>{id}</strong> — {name}
                                </span>
                                <span style={styles.sev}>{severity}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
