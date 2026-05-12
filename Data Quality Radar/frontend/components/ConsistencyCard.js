import React from 'react';
import Card from './Card';
import {colors, typography, thresholdColor} from '../theme';

export default function ConsistencyCard({consistencyPairs}) {
    return (
        <Card title="Cross-system consistency">
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                {consistencyPairs.map(({pair, mismatchCount, ruleCount, matchRate}) => {
                    const color = thresholdColor(matchRate);
                    return (
                        <div
                            key={pair}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: colors.bgPage,
                                padding: '12px 14px',
                                borderRadius: 4,
                                fontFamily: typography.family,
                            }}
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
