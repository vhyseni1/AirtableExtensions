import {useEffect, useRef, useState} from 'react';

/**
 * Ease-out cubic — starts fast, decelerates to the target. Used for the
 * "settle" motion of every narrative visual so nothing feels linear.
 */
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

/** Drive a 0 → 1 value over durMs, easing out. Restarts on every mount. */
function useAnimatedProgress(durMs: number): number {
    const [p, setP] = useState(0);
    const raf = useRef<number | null>(null);
    useEffect(() => {
        const start = performance.now();
        const tick = (now: number) => {
            const elapsed = now - start;
            const pct = Math.min(1, elapsed / durMs);
            setP(easeOutCubic(pct));
            if (pct < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => {
            if (raf.current != null) cancelAnimationFrame(raf.current);
        };
    }, [durMs]);
    return p;
}

/** Count up from 0 to `value` over durMs. Formatted with a formatter. */
export function AnimatedNumber({
    value,
    durMs = 1000,
    format,
}: {
    value: number;
    durMs?: number;
    format?: (n: number) => string;
}) {
    const t = useAnimatedProgress(durMs);
    const current = Math.round(value * t);
    return <span className="cia-num">{format ? format(current) : String(current)}</span>;
}

export interface DonutSegment {
    value: number;
    label?: string;
    color: string;
}

/**
 * Animated donut chart. Segments sweep clockwise from 12 o'clock, growing
 * from 0 to their share of the total. Optional center label + centered
 * counting number.
 */
export function AnimatedDonut({
    segments,
    size = 240,
    thickness = 30,
    centerValue,
    centerLabel,
    durMs = 1400,
}: {
    segments: DonutSegment[];
    size?: number;
    thickness?: number;
    centerValue?: number | string;
    centerLabel?: string;
    durMs?: number;
}) {
    const t = useAnimatedProgress(durMs);
    const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
    const cx = size / 2;
    const cy = size / 2;
    const r = (size - thickness) / 2;
    const circumference = 2 * Math.PI * r;

    let cumulative = 0;
    const arcs = segments.map((s, i) => {
        const startFrac = cumulative / total;
        cumulative += s.value;
        const endFrac = cumulative / total;
        const segFrac = (endFrac - startFrac) * t;
        const rotation = startFrac * 360 - 90;
        const dash = segFrac * circumference;
        return {
            key: i,
            rotation,
            dash,
            color: s.color,
        };
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display: 'block'}}>
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={thickness}
            />
            {arcs.map(a => (
                <circle
                    key={a.key}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${a.dash} ${circumference}`}
                    strokeLinecap="butt"
                    transform={`rotate(${a.rotation} ${cx} ${cy})`}
                    style={{filter: `drop-shadow(0 2px 4px ${a.color}55)`}}
                />
            ))}
            {typeof centerValue === 'number' ? (
                <text
                    x={cx}
                    y={cy}
                    dy="0.06em"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={size / 4.2}
                    fontWeight={700}
                    fill="#FFFFFF"
                    fontFamily="Roche Sans, Playfair Display, Georgia, serif"
                >
                    {Math.round(centerValue * t)}
                </text>
            ) : centerValue ? (
                <text
                    x={cx}
                    y={cy}
                    dy="0.06em"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={size / 5.5}
                    fontWeight={700}
                    fill="#FFFFFF"
                >
                    {centerValue}
                </text>
            ) : null}
            {centerLabel ? (
                <text
                    x={cx}
                    y={cy + size / 5.5}
                    textAnchor="middle"
                    fontSize={size / 22}
                    fill="rgba(255,255,255,0.72)"
                    letterSpacing="0.14em"
                    fontWeight={600}
                >
                    {centerLabel.toUpperCase()}
                </text>
            ) : null}
        </svg>
    );
}

export interface FlywheelSpoke {
    label: string;
    value: number;
    color?: string;
}

/**
 * "Flywheel" radial bar chart — spokes fan out from a hub. Each spoke's
 * length is proportional to its value. Spokes bloom out one after another
 * with a slight rotation from center. The whole wheel also does a subtle
 * rotate-in as it settles.
 */
export function AnimatedFlywheel({
    spokes,
    size = 260,
    innerRadius = 42,
    centerLabel,
    palette = ['#FF7D29', '#FFD60C', '#FF1F26', '#BC36F0', '#1482FA', '#00B458'],
    durMs = 1600,
}: {
    spokes: FlywheelSpoke[];
    size?: number;
    innerRadius?: number;
    centerLabel?: string;
    palette?: string[];
    durMs?: number;
}) {
    const t = useAnimatedProgress(durMs);
    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = size / 2 - 12;
    const maxLength = maxRadius - innerRadius;
    const maxValue = Math.max(1, ...spokes.map(s => s.value));
    const n = spokes.length;

    // slight wheel rotation as it settles for that flywheel feel
    const wheelRotate = -6 + t * 6;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{display: 'block', transition: 'transform 200ms ease'}}
        >
            <g transform={`rotate(${wheelRotate} ${cx} ${cy})`}>
                {/* Faint concentric rings for depth */}
                {[0.5, 0.75, 1].map((f, i) => (
                    <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r={innerRadius + maxLength * f}
                        fill="none"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={1}
                        strokeDasharray="2 4"
                    />
                ))}

                {/* Hub */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={innerRadius}
                    fill="rgba(255,255,255,0.10)"
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1}
                />

                {spokes.map((s, i) => {
                    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
                    // stagger: each spoke starts a bit later
                    const localT = Math.max(0, Math.min(1, (t - i * 0.06) / (1 - i * 0.04)));
                    const eased = easeOutCubic(localT);
                    const length = (s.value / maxValue) * maxLength * eased;
                    const barWidth = Math.max(10, size / (n * 3));
                    const x1 = cx + Math.cos(angle) * innerRadius;
                    const y1 = cy + Math.sin(angle) * innerRadius;
                    const x2 = cx + Math.cos(angle) * (innerRadius + length);
                    const y2 = cy + Math.sin(angle) * (innerRadius + length);
                    const color = s.color ?? palette[i % palette.length] ?? '#FFFFFF';

                    return (
                        <g key={i}>
                            <line
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke={color}
                                strokeWidth={barWidth}
                                strokeLinecap="round"
                                style={{
                                    filter: `drop-shadow(0 2px 4px ${color}77)`,
                                    opacity: 0.5 + 0.5 * eased,
                                }}
                            />
                            {/* Value pill at the tip once spoke has settled */}
                            {eased > 0.85 ? (
                                <g
                                    transform={`rotate(${-wheelRotate} ${x2} ${y2})`}
                                    style={{opacity: (eased - 0.85) / 0.15}}
                                >
                                    <text
                                        x={x2 + Math.cos(angle) * 10}
                                        y={y2 + Math.sin(angle) * 10}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={11}
                                        fontWeight={700}
                                        fill="#FFFFFF"
                                        fontFamily="Roche Sans Mono, JetBrains Mono, monospace"
                                    >
                                        {s.value}
                                    </text>
                                </g>
                            ) : null}
                        </g>
                    );
                })}
            </g>
            {centerLabel ? (
                <text
                    x={cx}
                    y={cy}
                    dy="0.06em"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="rgba(255,255,255,0.82)"
                    letterSpacing="0.14em"
                    fontWeight={700}
                >
                    {centerLabel.toUpperCase()}
                </text>
            ) : null}
        </svg>
    );
}

export interface BarItem {
    label: string;
    value: number;
    color: string;
}

export interface StackedSegment {
    value: number;
    color: string;
    label?: string;
}

export interface StackedBarItem {
    label: string;
    segments: StackedSegment[];
}

export interface LegendItem {
    color: string;
    label: string;
}

/**
 * Horizontal stacked bars — each row has multiple segments that fill left to
 * right with a staggered start. Useful for a top-N breakdown where each item
 * has a categorical mix (e.g., components split by High/Medium/Low severity).
 * Total value per row is rendered as a pill on the right once the bar settles.
 */
export function AnimatedStackedBars({
    items,
    height = 220,
    width = 480,
    durMs = 1300,
    legend,
}: {
    items: StackedBarItem[];
    height?: number;
    width?: number;
    durMs?: number;
    legend?: LegendItem[];
}) {
    const t = useAnimatedProgress(durMs);
    const n = items.length;
    if (n === 0) return null;

    const totals = items.map(it => it.segments.reduce((a, s) => a + s.value, 0));
    const maxTotal = Math.max(1, ...totals);

    const legendHeight = legend && legend.length > 0 ? 22 : 0;
    const rowsHeight = height - legendHeight;
    const rowHeight = rowsHeight / n;
    const barHeight = Math.max(14, rowHeight - 12);
    const labelWidth = Math.min(160, width * 0.4);
    const trackX = labelWidth + 8;
    const trackWidth = width - trackX - 44;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display: 'block'}}>
            {items.map((item, i) => {
                const localT = Math.max(0, Math.min(1, (t - i * 0.08) / (1 - i * 0.05)));
                const eased = easeOutCubic(localT);
                const rowY = i * rowHeight + (rowHeight - barHeight) / 2;
                const total = totals[i] ?? 0;
                const filledTotalW = (total / maxTotal) * trackWidth * eased;

                let cursor = 0;
                return (
                    <g key={i}>
                        <text
                            x={labelWidth}
                            y={rowY + barHeight / 2 + 4}
                            textAnchor="end"
                            fontSize={11}
                            fontWeight={600}
                            fill="rgba(255,255,255,0.9)"
                        >
                            {item.label.length > 26 ? item.label.slice(0, 25) + '…' : item.label}
                        </text>
                        <rect
                            x={trackX}
                            y={rowY}
                            width={trackWidth}
                            height={barHeight}
                            fill="rgba(255,255,255,0.10)"
                        />
                        {item.segments.map((seg, si) => {
                            if (total === 0 || seg.value === 0) return null;
                            const segW = (seg.value / total) * filledTotalW;
                            const x = trackX + cursor;
                            cursor += segW;
                            return (
                                <rect
                                    key={si}
                                    x={x}
                                    y={rowY}
                                    width={Math.max(0, segW)}
                                    height={barHeight}
                                    fill={seg.color}
                                    style={{
                                        filter: `drop-shadow(0 1px 2px ${seg.color}66)`,
                                    }}
                                />
                            );
                        })}
                        {eased > 0.7 ? (
                            <text
                                x={trackX + filledTotalW + 6}
                                y={rowY + barHeight / 2 + 4}
                                fontSize={12}
                                fontWeight={700}
                                fontFamily="Roche Sans Mono, JetBrains Mono, monospace"
                                fill="#FFFFFF"
                                style={{opacity: (eased - 0.7) / 0.3}}
                            >
                                {total}
                            </text>
                        ) : null}
                    </g>
                );
            })}

            {legend && legend.length > 0 ? (
                <g transform={`translate(0, ${rowsHeight})`}>
                    {legend.map((item, i) => {
                        const spacing = width / legend.length;
                        return (
                            <g key={i} transform={`translate(${i * spacing + 8}, 10)`}>
                                <rect x={0} y={-6} width={10} height={10} rx={2} fill={item.color} />
                                <text
                                    x={16}
                                    y={2}
                                    fontSize={10}
                                    fontWeight={600}
                                    fill="rgba(255,255,255,0.82)"
                                    letterSpacing="0.1em"
                                >
                                    {item.label.toUpperCase()}
                                </text>
                            </g>
                        );
                    })}
                </g>
            ) : null}
        </svg>
    );
}

/**
 * Horizontal bars, each row filling from left with a staggered start.
 * Value pill appears at the right end as each bar settles.
 */
export function AnimatedBars({
    items,
    height = 220,
    width = 320,
    durMs = 1300,
}: {
    items: BarItem[];
    height?: number;
    width?: number;
    durMs?: number;
}) {
    const t = useAnimatedProgress(durMs);
    const n = items.length;
    if (n === 0) return null;
    const maxValue = Math.max(1, ...items.map(i => i.value));
    const rowHeight = height / n;
    const barHeight = Math.max(14, rowHeight - 10);
    const labelWidth = Math.min(140, width * 0.5);
    const trackX = labelWidth + 6;
    const trackWidth = width - trackX - 40;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display: 'block'}}>
            {items.map((item, i) => {
                const localT = Math.max(0, Math.min(1, (t - i * 0.08) / (1 - i * 0.05)));
                const eased = easeOutCubic(localT);
                const barW = (item.value / maxValue) * trackWidth * eased;
                const y = i * rowHeight + (rowHeight - barHeight) / 2;
                return (
                    <g key={i}>
                        <text
                            x={labelWidth}
                            y={y + barHeight / 2 + 4}
                            textAnchor="end"
                            fontSize={11}
                            fontWeight={600}
                            fill="rgba(255,255,255,0.9)"
                        >
                            {item.label.length > 22 ? item.label.slice(0, 21) + '…' : item.label}
                        </text>
                        <rect
                            x={trackX}
                            y={y}
                            width={trackWidth}
                            height={barHeight}
                            rx={barHeight / 2}
                            fill="rgba(255,255,255,0.10)"
                        />
                        <rect
                            x={trackX}
                            y={y}
                            width={Math.max(2, barW)}
                            height={barHeight}
                            rx={barHeight / 2}
                            fill={item.color}
                            style={{filter: `drop-shadow(0 2px 4px ${item.color}77)`}}
                        />
                        {eased > 0.7 ? (
                            <text
                                x={trackX + barW + 6}
                                y={y + barHeight / 2 + 4}
                                fontSize={12}
                                fontWeight={700}
                                fontFamily="Roche Sans Mono, JetBrains Mono, monospace"
                                fill="#FFFFFF"
                                style={{opacity: (eased - 0.7) / 0.3}}
                            >
                                {item.value}
                            </text>
                        ) : null}
                    </g>
                );
            })}
        </svg>
    );
}

/**
 * Ring gauge — single-value donut used for percentages or split-of-total.
 * Center number counts up.
 */
export function AnimatedGauge({
    value,
    total,
    size = 220,
    thickness = 24,
    color,
    trackColor = 'rgba(255,255,255,0.14)',
    label,
    durMs = 1400,
}: {
    value: number;
    total: number;
    size?: number;
    thickness?: number;
    color: string;
    trackColor?: string;
    label?: string;
    durMs?: number;
}) {
    const t = useAnimatedProgress(durMs);
    const frac = total > 0 ? Math.min(1, value / total) : 0;
    const cx = size / 2;
    const cy = size / 2;
    const r = (size - thickness) / 2;
    const circumference = 2 * Math.PI * r;
    const dash = frac * circumference * t;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display: 'block'}}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{filter: `drop-shadow(0 2px 6px ${color}55)`}}
            />
            <text
                x={cx}
                y={cy}
                dy="0.06em"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={size / 4}
                fontWeight={700}
                fill="#FFFFFF"
                fontFamily="Roche Sans, Playfair Display, Georgia, serif"
            >
                {Math.round(value * t)}
            </text>
            {label ? (
                <text
                    x={cx}
                    y={cy + size / 5}
                    textAnchor="middle"
                    fontSize={size / 22}
                    fill="rgba(255,255,255,0.72)"
                    letterSpacing="0.14em"
                    fontWeight={600}
                >
                    {label.toUpperCase()}
                </text>
            ) : null}
        </svg>
    );
}
