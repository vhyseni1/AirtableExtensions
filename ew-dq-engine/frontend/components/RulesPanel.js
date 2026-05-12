import React, {useState} from 'react';

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
        r => r.getCellValueAsString('Active') === 'Yes',
    ).length;

    async function toggle(record, on) {
        await table.updateRecordAsync(record, {
            Active: {name: on ? 'Yes' : 'No'},
        });
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
                        const id = record.getCellValueAsString('Rule_ID');
                        const name = record.getCellValueAsString('Rule_Name');
                        const severity = record.getCellValueAsString('Severity');
                        const isOn = record.getCellValueAsString('Active') === 'Yes';
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
