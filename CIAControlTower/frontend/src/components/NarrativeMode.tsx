import {useEffect, useMemo, useState} from 'react';
import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';

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
}

const HEAT = '#FF7D29';
const GAP = '#ED4A0D';
const PRESSURE = '#C40000';
const FRICTION = '#BC36F0';
const BLUE = '#0B41CD';

function buildBeats(agg: DashboardAggregations): Beat[] {
    const m = agg.headline;
    const topComp = agg.topComponents[0];
    const hottestArchetype = agg.pressure[0];

    return [
        {
            zone: 'Headline',
            kicker: 'At a glance',
            headline: 'The change landscape this run.',
            metrics: [
                {value: String(m.totalImpacts), sublabel: 'reviewed impacts'},
                {value: String(m.highSeverity), sublabel: 'at high impact', accent: '#FF1F26'},
                {value: `${m.avgConfidencePct}%`, sublabel: 'high confidence', accent: '#00B458'},
            ],
            accent: BLUE,
            glyph: '⬤',
        },
        {
            zone: 'Where the heat is',
            kicker: 'Heat center',
            headline: topComp ? topComp.component : 'No dominant heat center yet.',
            metrics: topComp
                ? [
                    {value: String(topComp.total), sublabel: 'total impacts', accent: HEAT},
                    {value: String(topComp.high), sublabel: 'high impact', accent: '#FF1F26'},
                ]
                : [],
            accent: HEAT,
            glyph: '◆',
        },
        {
            zone: "What's breaking",
            kicker: 'Open gaps',
            headline:
                m.gapsOpen > 0
                    ? 'Gaps are still waiting for owners.'
                    : 'Every gap has a follow-up. Audit-clean.',
            metrics: [
                {value: String(m.gapsOpen), sublabel: 'gaps open', accent: GAP},
                {value: String(m.totalImpacts - m.gapsOpen), sublabel: 'addressed', accent: '#00B458'},
            ],
            accent: GAP,
            glyph: '▸',
        },
        {
            zone: "Who's under pressure",
            kicker: 'Load signal',
            headline: hottestArchetype
                ? `${hottestArchetype.persona} archetype is most stretched.`
                : 'Sustainable load — no pressure recorded.',
            metrics: hottestArchetype
                ? [
                    {value: String(hottestArchetype.count), sublabel: 'pressure flags', accent: PRESSURE},
                    {value: String(m.pressureFlags), sublabel: 'total across archetypes'},
                ]
                : [{value: '0', sublabel: 'pressure flags', accent: '#00B458'}],
            accent: PRESSURE,
            glyph: '●',
        },
        {
            zone: 'Where alignment fails',
            kicker: 'Friction',
            headline:
                m.frictionPoints > 0
                    ? 'Named parties disagree.'
                    : 'Healthy alignment — no friction recorded.',
            metrics: [{value: String(m.frictionPoints), sublabel: 'friction points', accent: FRICTION}],
            accent: FRICTION,
            glyph: '⟑',
        },
    ];
}

interface Props {
    aggregations: DashboardAggregations;
    onClose: () => void;
}

const BEAT_MS = 4200;

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

            {/* Header: beat counter + zone */}
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
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: tokens.space.xl,
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

                {/* Big metrics row */}
                {beat.metrics.length > 0 ? (
                    <div
                        style={{
                            display: 'flex',
                            gap: `clamp(${tokens.space.xl}, 6vw, 96px)`,
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            alignItems: 'baseline',
                        }}
                    >
                        {beat.metrics.map((m, i) => (
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
                                        fontSize: 'clamp(56px, 10vw, 120px)',
                                        fontWeight: 700,
                                        lineHeight: 0.95,
                                        letterSpacing: '-0.03em',
                                        color: m.accent ?? '#FFFFFF',
                                        textShadow: '0 1px 24px rgba(0,0,0,0.24)',
                                    }}
                                >
                                    {m.value}
                                </span>
                                <span
                                    style={{
                                        fontSize: 12,
                                        letterSpacing: '0.16em',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.82)',
                                    }}
                                >
                                    {m.sublabel}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <h2
                    style={{
                        margin: 0,
                        fontFamily: tokens.fonts.serif,
                        fontSize: 'clamp(24px, 3.2vw, 40px)',
                        fontWeight: 600,
                        lineHeight: 1.25,
                        letterSpacing: '-0.015em',
                        maxWidth: 880,
                    }}
                >
                    {beat.headline}
                </h2>
            </div>

            {/* Footer hint */}
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
