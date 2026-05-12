import React from 'react';
import Card from './Card';
import {colors, typography, dimensionColors} from '../theme';

function safeGet(record, field) {
    try {
        return record.getCellValueAsString(field);
    } catch (e) {
        return '';
    }
}

export default function DimensionBars({byDimension, onDrillDown}) {
    const max = Math.max(1, ...byDimension.map(d => d.count));

    return (
        <Card title="Exceptions by DQ dimension">
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                {byDimension.map(({dimension, count}) => {
                    const widthPct = (count / max) * 100;
                    const fill = dimensionColors[dimension] || colors.rocheGrey;
                    const interactive = count > 0 && typeof onDrillDown === 'function';
                    return (
                        <div
                            key={dimension}
                            onClick={interactive ? () => onDrillDown(
                                `Exceptions — ${dimension}`,
                                r => safeGet(r, 'DQ_Dimension') === dimension,
                            ) : undefined}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
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
                                    width: 110,
                                    fontSize: 13,
                                    color: colors.textSecondary,
                                }}
                            >
                                {dimension}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    background: colors.bgPage,
                                    height: 18,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${widthPct}%`,
                                        height: '100%',
                                        background: fill,
                                        borderRadius: 2,
                                        transition: 'width 200ms ease-out',
                                    }}
                                />
                            </div>
                            <div
                                style={{
                                    width: 50,
                                    textAlign: 'right',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: colors.textPrimary,
                                }}
                            >
                                {count}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
