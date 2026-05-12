import React from 'react';
import Card from './Card';
import {colors, typography, dimensionColors} from '../theme';

export default function DimensionBars({byDimension}) {
    const max = Math.max(1, ...byDimension.map(d => d.count));

    return (
        <Card title="Exceptions by DQ dimension">
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                {byDimension.map(({dimension, count}) => {
                    const widthPct = (count / max) * 100;
                    const fill = dimensionColors[dimension] || colors.rocheGrey;
                    return (
                        <div
                            key={dimension}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                fontFamily: typography.family,
                            }}
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
