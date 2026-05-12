import React from 'react';
import Card from './Card';
import {colors, typography, thresholdColor} from '../theme';

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

export default function CompletenessCard({fieldCompleteness, onDrillDown}) {
    return (
        <Card title="Field completeness — high priority fields">
            <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                {fieldCompleteness.map(({field, label, completeness, exceptionCount}) => {
                    const color = thresholdColor(completeness);
                    const interactive = exceptionCount > 0 && typeof onDrillDown === 'function';
                    return (
                        <div
                            key={field}
                            onClick={interactive ? () => onDrillDown(
                                `Field — ${label}`,
                                r => safeGet(r, 'Field') === field,
                            ) : undefined}
                            style={{
                                fontFamily: typography.family,
                                cursor: interactive ? 'pointer' : 'default',
                                padding: '4px 6px',
                                margin: '-4px -6px',
                                borderRadius: 4,
                                transition: 'background 120ms ease',
                            }}
                            onMouseEnter={e => {
                                if (interactive) e.currentTarget.style.background = colors.rocheBlueLight;
                            }}
                            onMouseLeave={e => {
                                if (interactive) e.currentTarget.style.background = 'transparent';
                            }}
                            title={interactive ? 'Click to view records' : undefined}
                        >
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
