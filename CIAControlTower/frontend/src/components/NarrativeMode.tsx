import {useEffect, useMemo, useState} from 'react';
import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';
import {
    AnimatedBars,
    AnimatedDonut,
    AnimatedGauge,
    AnimatedStackedBars,
    type BarItem,
    type DonutSegment,
    type StackedBarItem,
} from './primitives/NarrativeVisuals';

interface Metric {
    value: string;
    sublabel: string;
    accent?: string;
}

interface Beat {
    zone: string;
    kicker: string;
    headline: string;
    metrics: Metric[];
    accent: string;
    glyph: string;
    /** Narrative-specific visual for this beat. Rendered above the metrics/headline block. */
    visual?: React.ReactNode;
}

const HEAT = '#FF7D29';
const GAP = '#ED4A0D';
const PRESSURE = '#C40000';
const FRICTION = '#BC36F0';
const BLUE = '#0B41CD';
const SEV_HIGH = '#FF1F26';
const SEV_MED = '#FFD60C';
const SEV_LOW = '#00B458';

function buildBeats(agg: DashboardAggregations): Beat[] {
    const m = agg.headline;
    const topComps = agg.topComponents.slice(0, 5);
    const topPressure = agg.pressure.slice(0, 4);

    const severitySegments: DonutSegment[] = [
        {value: m.highSeverity, label: 'High', color: SEV_HIGH},
        {value: m.mediumSeverity, label: 'Medium', color: SEV_MED},
        {value: m.lowSeverity, label: 'Low', color: SEV_LOW},
    ];

    const componentStacks: StackedBarItem[] = topComps.map(c => ({
        label: c.component,
        segments: [
            {value: c.high, color: SEV_HIGH, label: 'High'},
            {value: c.medium, color: SEV_MED, label: 'Medium'},
            {value: c.low, color: SEV_LOW, label: 'Low'},
        ],
    }));

    const pressureBars: BarItem[] = topPressure.map(p => ({
        label: p.persona,
        value: p.count,
        color: PRESSURE,
    }));

    return [
        {
            zone: 'Headline',
            kicker: 'At a glance',
            headline: 'The change landscape this run.',
            metrics: [
                {value: String(m.totalImpacts), sublabel: 'reviewed impacts'},
                {value: String(m.highSeverity), sublabel: 'high impact', accent: SEV_HIGH},
                {value: `${m.avgConfidencePct}%`, sublabel: 'high confidence', accent: SEV_LOW},
            ],
            accent: BLUE,
            glyph: '⬤',
            visual: (
                <AnimatedDonut
                    segments={severitySegments}
                    centerValue={m.totalImpacts}
                    centerLabel="impacts"
                    size={260}
                    thickness={34}
                />
            ),
        },
        {
            zone: 'Where the heat is',
            kicker: 'Heat center',
            headline: topComps[0]
                ? `${topComps[0].component} carries the load.`
                : 'No dominant heat center yet.',
            metrics: topComps[0]
                ? [
                    {value: String(topComps[0].total), sublabel: 'total impacts', accent: HEAT},
                    {value: String(topComps[0].high), sublabel: 'high impact', accent: SEV_HIGH},
                ]
                : [],
            accent: HEAT,
            glyph: '◆',
            visual:
                componentStacks.length > 0 ? (
                    <AnimatedStackedBars
                        items={componentStacks}
                        width={520}
                        height={220}
                        legend={[
                            {color: SEV_HIGH, label: 'High'},
                            {color: SEV_MED, label: 'Medium'},
                            {color: SEV_LOW, label: 'Low'},
                        ]}
                    />
                ) : null,
        },
        {
            zone: "What's breaking",
            kicker: 'Open gaps',
            headline:
                m.gapsOpen > 0
                    ? 'Gaps are still waiting for owners.'
                    : 'Every gap has follow-up. Audit-clean.',
            metrics: [
                {value: String(m.gapsOpen), sublabel: 'gaps open', accent: GAP},
                {
                    value: String(Math.max(0, m.totalImpacts - m.gapsOpen)),
                    sublabel: 'addressed',
                    accent: SEV_LOW,
                },
            ],
            accent: GAP,
            glyph: '▸',
            visual: (
                <AnimatedGauge
                    value={m.gapsOpen}
                    total={Math.max(1, m.totalImpacts)}
                    color={GAP}
                    label="gaps open"
                    size={240}
                    thickness={28}
                />
            ),
        },
        {
            zone: "Who's under pressure",
            kicker: 'Load signal',
            headline: topPressure[0]
                ? `${topPressure[0].persona} archetype is most stretched.`
                : 'Sustainable load — no pressure recorded.',
            metrics: topPressure[0]
                ? [
                    {value: String(topPressure[0].count), sublabel: 'pressure flags', accent: PRESSURE},
                    {value: String(m.pressureFlags), sublabel: 'total across archetypes'},
                ]
                : [{value: '0', sublabel: 'pressure flags', accent: SEV_LOW}],
            accent: PRESSURE,
            glyph: '●',
            visual:
                pressureBars.length > 0 ? (
                    <AnimatedBars items={pressureBars} width={380} height={220} />
                ) : null,
        },
        {
            zone: 'Where alignment fails',
            kicker: 'Friction',
            headline:
                m.frictionPoints > 0
                    ? 'Named parties disagree.'
                    : 'Healthy alignment — no friction recorded.',
            metrics: [
                {value: String(m.frictionPoints), sublabel: 'friction points', accent: FRICTION},
            ],
            accent: FRICTION,
            glyph: '⟑',
        },
    ];
}

interface Props {
    aggregations: DashboardAggregations;
    onClose: () => void;
}

const BEAT_MS = 5000;

export function NarrativeMode({aggregations, onClose}: Props) {
    const beats = useMemo(() => buildBeats(aggregations), [aggregations]);
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIdx(i => Math.min(beats.length - 1, i + 1));
            if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [beats.length, onClose]);

    useEffect(() => {
        const t = window.setTimeout(() => {
            setIdx(i => {
                if (i + 1 >= beats.length) {
                    onClose();
                    return i;
                }
                return i + 1;
            });
        }, BEAT_MS);
        return () => window.clearTimeout(t);
    }, [idx, beats.length, onClose]);

    const beat = beats[idx];
    if (!beat) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(135deg, ${beat.accent}CC 0%, #022366 90%)`,
                backdropFilter: 'blur(4px)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                padding: `${tokens.space.xl} ${tokens.space.xxl}`,
                color: '#FFFFFF',
                cursor: 'pointer',
                transition: 'background 400ms ease',
                overflow: 'hidden',
            }}
        >
            {/* Instagram-story progress bars */}
            <div
                style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: tokens.space.xl,
                }}
            >
                {beats.map((_, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            height: 3,
                            background: 'rgba(255,255,255,0.28)',
                            borderRadius: 999,
                            overflow: 'hidden',
                        }}
                    >
                        {i < idx ? (
                            <div style={{height: '100%', width: '100%', background: '#FFFFFF'}} />
                        ) : i === idx ? (
                            <div
                                key={`fill-${idx}`}
                                style={{
                                    height: '100%',
                                    width: '100%',
                                    background: '#FFFFFF',
                                    transformOrigin: 'left center',
                                    animation: `cia-story-progress ${BEAT_MS}ms linear forwards`,
                                }}
                            />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    opacity: 0.88,
                }}
            >
                <span>
                    <span style={{fontSize: 18, marginRight: 6, verticalAlign: 'middle'}}>{beat.glyph}</span>
                    {beat.zone}
                </span>
                <span style={{opacity: 0.72}}>
                    {idx + 1} / {beats.length}
                </span>
            </div>

            {/* Center content */}
            <div
                key={`beat-${idx}`}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: tokens.space.lg,
                    textAlign: 'center',
                    minHeight: 0,
                }}
            >
                <span
                    style={{
                        fontSize: 12,
                        letterSpacing: '0.24em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.72)',
                    }}
                >
                    {beat.kicker}
                </span>

                {/* Animated visual + inline metrics */}
                {beat.visual ? <div style={{marginTop: 4}}>{beat.visual}</div> : null}

                {/* Metrics row */}
                {beat.metrics.length > 0 ? (
                    <div
                        style={{
                            display: 'flex',
                            gap: `clamp(${tokens.space.xl}, 5vw, 72px)`,
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            alignItems: 'baseline',
                            marginTop: tokens.space.md,
                        }}
                    >
                        {beat.metrics.map((mm, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: tokens.space.xs,
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: tokens.fonts.serif,
                                        fontSize: 'clamp(32px, 5.5vw, 68px)',
                                        fontWeight: 700,
                                        lineHeight: 0.95,
                                        letterSpacing: '-0.03em',
                                        color: mm.accent ?? '#FFFFFF',
                                        textShadow: '0 1px 24px rgba(0,0,0,0.24)',
                                    }}
                                >
                                    {mm.value}
                                </span>
                                <span
                                    style={{
                                        fontSize: 11,
                                        letterSpacing: '0.16em',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.82)',
                                    }}
                                >
                                    {mm.sublabel}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <h2
                    style={{
                        margin: 0,
                        fontFamily: tokens.fonts.serif,
                        fontSize: 'clamp(20px, 2.6vw, 32px)',
                        fontWeight: 600,
                        lineHeight: 1.25,
                        letterSpacing: '-0.015em',
                        maxWidth: 820,
                        color: 'rgba(255,255,255,0.94)',
                    }}
                >
                    {beat.headline}
                </h2>
            </div>

            {/* Footer */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.72)',
                }}
            >
                <span>Click anywhere to close</span>
                <span>← → navigate · Esc exit</span>
            </div>
        </div>
    );
}
