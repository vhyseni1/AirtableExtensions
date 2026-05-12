import React from 'react';
import Card from './Card';
import {colors, typography, thresholdColor} from '../theme';

const PAIR_RULE_IDS = {
    'EPP ↔ Fieldglass': ['R010', 'R011', 'R012', 'R013', 'R014'],
    'EPP ↔ PO': ['R015', 'R016'],
    'Spend ↔ PO': ['R018'],
};

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

export default function ConsistencyCard({consistencyPairs, onDrillDown}) {
    return (
        <Card title="Cross-system consistency">
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                {consistencyPairs.map(({pair, mismatchCount, ruleCount, matchRate}) => {
                    const color = thresholdColor(matchRate);
                    const ruleIds = PAIR_RULE_IDS[pair] || [];
                    const interactive =
                        mismatchCount > 0
                        && ruleIds.length > 0
                        && typeof onDrillDown === 'function';
                    return (
                        <div
                            key={pair}
                            onClick={interactive ? () => onDrillDown(
                                `Consistency — ${pair}`,
                                r => ruleIds.includes(safeGet(r, 'Rule_ID')),
                            ) : undefined}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: colors.bgPage,
                                padding: '12px 14px',
                                borderRadius: 4,
                                fontFamily: typography.family,
                                cursor: interactive ? 'pointer' : 'default',
                                border: '1px solid transparent',
                                transition: 'border-color 120ms ease',
                            }}
                            onMouseEnter={e => {
                                if (interactive) e.currentTarget.style.borderColor = colors.rocheBlue;
                            }}
                            onMouseLeave={e => {
                                if (interactive) e.currentTarget.style.borderColor = 'transparent';
                            }}
                            title={interactive ? 'Click to view records' : undefined}
                        >
                            <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    {pair}
                                </span>
                                <span style={{fontSize: 11, color: colors.textTertiary}}>
                                    {mismatchCount} mismatch{mismatchCount === 1 ? '' : 'es'} across {ruleCount} rule{ruleCount === 1 ? '' : 's'}
                                </span>
                            </div>
                            <span
                                style={{
                                    fontSize: 22,
                                    fontWeight: 500,
                                    color: color,
                                }}
                            >
                                {matchRate.toFixed(1)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
