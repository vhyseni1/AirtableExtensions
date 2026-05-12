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

export default function RunHistoryFooter({
    lastRunTimestamp,
    activeRules,
    totalExceptions,
}) {
    return (
        <div
            style={{
                fontFamily: typography.family,
                fontSize: 11,
                color: colors.textTertiary,
                padding: '8px 4px',
                textAlign: 'left',
            }}
        >
            Last run: {formatTimestamp(lastRunTimestamp)}  ·  Run by: rule engine  ·  {activeRules} rule{activeRules === 1 ? '' : 's'} active  ·  {totalExceptions} exception{totalExceptions === 1 ? '' : 's'} written
        </div>
    );
}
