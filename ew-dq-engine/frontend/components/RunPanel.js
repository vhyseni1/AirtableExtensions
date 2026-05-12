import React from 'react';

const styles = {
    wrap: {marginBottom: 16},
    btn: {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        padding: '10px 18px',
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    btnDisabled: {opacity: 0.6, cursor: 'not-allowed'},
    progressWrap: {marginTop: 12},
    progressText: {marginBottom: 6, fontSize: 13, color: '#374151'},
    progressTrack: {
        width: '100%',
        height: 8,
        background: '#e5e7eb',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        background: '#2563eb',
        transition: 'width 120ms linear',
    },
    summary: {
        marginTop: 16,
        padding: 12,
        border: '2px solid #d1d5db',
        borderRadius: 6,
    },
    summaryH: {fontSize: 14, fontWeight: 600, margin: '0 0 8px 0'},
    summarySection: {marginTop: 8},
    summaryLabel: {fontWeight: 600, margin: '0 0 4px 0'},
    summaryLine: {margin: 0, fontSize: 13},
};

export default function RunPanel({running, progress, summary, onRun}) {
    const label = running ? 'Running…' : summary ? 'Run again' : 'Run checks';
    const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <div style={styles.wrap}>
            <button
                style={{...styles.btn, ...(running ? styles.btnDisabled : {})}}
                disabled={running}
                onClick={onRun}
            >
                {label}
            </button>

            {running && progress && (
                <div style={styles.progressWrap}>
                    <div style={styles.progressText}>
                        Rule {progress.current} of {progress.total}: {progress.ruleId} — {progress.ruleName}
                    </div>
                    <div style={styles.progressTrack}>
                        <div style={{...styles.progressFill, width: `${pct}%`}} />
                    </div>
                </div>
            )}

            {summary && !running && (
                <div style={styles.summary}>
                    <h2 style={styles.summaryH}>Summary</h2>
                    <p style={styles.summaryLine}>
                        Total exceptions: <strong>{summary.total}</strong>
                    </p>
                    <p style={styles.summaryLine}>
                        Duration: {summary.duration.toFixed(1)}s
                    </p>

                    <div style={styles.summarySection}>
                        <p style={styles.summaryLabel}>By severity</p>
                        {Object.entries(summary.severity).map(([k, v]) => (
                            <p key={k} style={styles.summaryLine}>{k}: {v}</p>
                        ))}
                    </div>

                    <div style={styles.summarySection}>
                        <p style={styles.summaryLabel}>By dimension</p>
                        {Object.entries(summary.dimension).map(([k, v]) => (
                            <p key={k} style={styles.summaryLine}>{k}: {v}</p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
