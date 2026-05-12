import React from 'react';
import Card from './Card';
import {colors, typography, thresholdColor} from '../theme';

export default function CompletenessCard({fieldCompleteness}) {
    return (
        <Card title="Field completeness — high priority fields">
            <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                {fieldCompleteness.map(({field, label, completeness}) => {
                    const color = thresholdColor(completeness);
                    return (
                        <div key={field} style={{fontFamily: typography.family}}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                    marginBottom: 6,
                                }}
                            >
                                <span style={{fontSize: 13, color: colors.textSecondary}}>{label}</span>
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: color,
                                    }}
                                >
                                    {completeness.toFixed(1)}%
                                </span>
                            </div>
                            <div
                                style={{
                                    width: '100%',
                                    background: colors.bgPage,
                                    height: 5,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${Math.min(100, completeness)}%`,
                                        height: '100%',
                                        background: color,
                                        transition: 'width 200ms ease-out',
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
