import {useEffect, useMemo, useState} from 'react';
import {tokens} from '../styles/tokens';
import {type DashboardAggregations} from '../hooks/useAggregations';

interface Beat {
    zone: string;
    headline: string;
}

function buildBeats(agg: DashboardAggregations): Beat[] {
    const m = agg.headline;
    const topComp = agg.topComponents[0];
    const hottestPersona = agg.pressure[0];

    const heatLine = topComp
        ? `${topComp.component} is the heat center — ${topComp.total} impacts, ${topComp.high} at high severity.`
        : 'No dominant heat center yet.';
    const gapLine =
        m.gapsOpen > 0
            ? `${m.gapsOpen} gap${m.gapsOpen === 1 ? '' : 's'} unowned, unreviewed, or unfunded.`
            : 'Every gap has a reviewer note.';
    const pressureLine = hottestPersona
        ? `${hottestPersona.persona}s show ${hottestPersona.count} pressure flag${hottestPersona.count === 1 ? '' : 's'}.`
        : 'No persona pressure recorded.';
    const frictionLine =
        m.frictionPoints > 0
            ? `${m.frictionPoints} friction point${m.frictionPoints === 1 ? '' : 's'} between named parties.`
            : 'Healthy alignment — no friction recorded.';

    return [
        {
            zone: 'Headline',
            headline: `${m.totalImpacts} reviewed impacts in scope. ${m.highSeverity} at high severity.`,
        },
        {zone: 'Where the heat is', headline: heatLine},
        {zone: "What's breaking", headline: gapLine},
        {zone: "Who's under pressure", headline: pressureLine},
        {zone: 'Where alignment fails', headline: frictionLine},
    ];
}

interface Props {
    aggregations: DashboardAggregations;
    onClose: () => void;
}

const BEAT_MS = 3500;

export function NarrativeMode({aggregations, onClose}: Props) {
    const beats = useMemo(() => buildBeats(aggregations), [aggregations]);
    const [idx, setIdx] = useState(0);

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
                position: 'absolute',
                inset: 0,
                background: 'rgba(26,24,20,0.86)',
                backdropFilter: 'blur(6px)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: tokens.space.xxl,
                color: tokens.colors.bg,
                cursor: 'pointer',
            }}
        >
            <span
                className="cia-eyebrow"
                style={{color: tokens.colors.bgAlt, opacity: 0.7, marginBottom: tokens.space.lg}}
            >
                Beat {idx + 1} of {beats.length} · {beat.zone}
            </span>
            <h2
                style={{
                    margin: 0,
                    fontFamily: tokens.fonts.serif,
                    fontSize: 'clamp(28px, 4vw, 48px)',
                    fontWeight: 600,
                    lineHeight: 1.2,
                    letterSpacing: '-0.02em',
                    maxWidth: 880,
                    textAlign: 'center',
                }}
            >
                {beat.headline}
            </h2>
            <div
                style={{
                    display: 'flex',
                    gap: 6,
                    marginTop: tokens.space.xxl,
                }}
            >
                {beats.map((_, i) => (
                    <span
                        key={i}
                        style={{
                            width: i === idx ? 28 : 6,
                            height: 4,
                            borderRadius: 2,
                            background: i === idx ? tokens.colors.bg : tokens.colors.textFaint,
                            transition: 'width 200ms ease',
                        }}
                    />
                ))}
            </div>
            <span
                style={{
                    position: 'absolute',
                    bottom: tokens.space.xl,
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: tokens.colors.textFaint,
                }}
            >
                Click anywhere · Esc to exit · ← → to navigate
            </span>
        </div>
    );
}
