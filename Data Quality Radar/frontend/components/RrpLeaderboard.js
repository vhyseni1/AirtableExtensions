import React, {useState} from 'react';
import Card from './Card';
import {colors, typography, badgeStyle} from '../theme';

function ExceptionBadge({count}) {
    const {bg, text} = badgeStyle(count);
    return (
        <span
            style={{
                display: 'inline-block',
                background: bg,
                color: text,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 10,
                fontFamily: typography.family,
            }}
        >
            {count}
        </span>
    );
}

export default function RrpLeaderboard({rrpLeaderboard, activeRrp, onSelectRrp}) {
    const [hoverIdx, setHoverIdx] = useState(null);

    const rightSlot = (
        <span style={{fontSize: 12, color: colors.textTertiary, fontFamily: typography.family}}>
            Click row to drill down
        </span>
    );

    return (
        <Card title="Top RRPs by open exceptions" rightSlot={rightSlot}>
            {rrpLeaderboard.length === 0 ? (
                <div
                    style={{
                        fontFamily: typography.family,
                        fontSize: 13,
                        color: colors.textTertiary,
                        padding: '12px 0',
                    }}
                >
                    No RRP exceptions in the current view.
                </div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column'}}>
                    {rrpLeaderboard.map((row, i) => {
                        const isActive = activeRrp === row.rrp;
                        const isHover = hoverIdx === i;
                        const baseBg = i % 2 === 0 ? colors.bgAlt : colors.white;
                        const bg = isHover || isActive ? colors.rocheBlueLight : baseBg;
                        return (
                            <div
                                key={row.rrp}
                                onClick={() => onSelectRrp(row.rrp)}
                                onMouseEnter={() => setHoverIdx(i)}
                                onMouseLeave={() => setHoverIdx(null)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    height: 40,
                                    padding: '0 12px',
                                    background: bg,
                                    cursor: 'pointer',
                                    fontFamily: typography.family,
                                    borderLeft: isActive ? `3px solid ${colors.rocheBlue}` : '3px solid transparent',
                                }}
                            >
                                <div
                                    style={{
                                        width: 32,
                                        fontSize: 12,
                                        color: colors.textTertiary,
                                    }}
                                >
                                    {i + 1}
                                </div>
                                <div
                                    style={{
                                        flex: 1,
                                        fontSize: 13,
                                        color: colors.textPrimary,
                                        fontWeight: 500,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {row.rrp}
                                </div>
                                <div
                                    style={{
                                        width: 90,
                                        fontSize: 12,
                                        color: colors.textSecondary,
                                    }}
                                >
                                    {row.org}
                                </div>
                                <div
                                    style={{
                                        width: 70,
                                        fontSize: 12,
                                        color: colors.textSecondary,
                                        textAlign: 'right',
                                    }}
                                >
                                    {row.workerCount}
                                </div>
                                <div
                                    style={{
                                        width: 60,
                                        textAlign: 'right',
                                    }}
                                >
                                    <ExceptionBadge count={row.exceptionCount} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
