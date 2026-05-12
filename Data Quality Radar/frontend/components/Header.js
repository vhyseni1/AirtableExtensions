import React from 'react';
import {colors, typography} from '../theme';

function formatTimestamp(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (e) {
        return iso;
    }
}

export default function Header({lastRefresh, onRefresh}) {
    return (
        <div
            style={{
                background: colors.white,
                borderBottom: `2px solid ${colors.rocheBlue}`,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                fontFamily: typography.family,
                color: colors.textPrimary,
            }}
        >
            <div style={{display: 'flex', alignItems: 'center'}}>
                <span style={{fontSize: 18, fontWeight: 500, color: colors.rocheBlue}}>Roche</span>
                <span
                    style={{
                        width: 1, height: 22,
                        background: colors.border,
                        margin: '0 16px',
                    }}
                />
                <span style={{fontSize: 14, fontWeight: 400, color: colors.textSecondary}}>
                    External Workforce  ·  Data quality
                </span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <span style={{fontSize: 12, color: colors.textTertiary}}>
                    Last refresh: {formatTimestamp(lastRefresh)}
                </span>
                <button
                    type="button"
                    onClick={onRefresh}
                    title="Refresh"
                    style={{
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderRadius: 4,
                        width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        color: colors.textSecondary,
                        padding: 0,
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}
