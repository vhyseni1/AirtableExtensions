import React, {useState} from 'react';

const styles = {
    wrap: {},
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
    body: {
        marginTop: 8,
        padding: 10,
        background: '#f3f4f6',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        maxHeight: 320,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
    },
    empty: {color: '#6b7280', margin: 0},
    line: {margin: 0},
};

export default function LogPanel({lines}) {
    const [open, setOpen] = useState(false);

    return (
        <div style={styles.wrap}>
            <div style={styles.header} onClick={() => setOpen(!open)}>
                <span style={styles.caret}>{open ? '▾' : '▸'}</span>
                <h2 style={styles.h2}>Log ({lines.length})</h2>
            </div>

            {open && (
                <div style={styles.body}>
                    {lines.length === 0 ? (
                        <p style={styles.empty}>No log entries yet.</p>
                    ) : (
                        lines.map((line, i) => (
                            <p key={i} style={styles.line}>{line}</p>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
