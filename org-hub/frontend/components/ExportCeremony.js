// The works-council export overlay: a page counter that ticks up while the
// pack is assembled, then a confetti finish.
//
// This is a DEMO affordance. It counts the org-chart pages the deck model
// actually produces — the number is real — but the "saved to Drive" step is
// staged: nothing is uploaded anywhere. The copy says so, and `demo` is a
// required prop rather than a default, so wiring a real destination later means
// the compiler points at every call site.

import {useEffect, useRef, useState} from 'react';
import Confetti from './Confetti';

const PHASES = [
    {key: 'collecting', label: 'Collecting consultation scope'},
    {key: 'rendering', label: 'Rendering org charts'},
    {key: 'packaging', label: 'Assembling works council pack'},
    {key: 'saving', label: 'Saving to shared drive'},
];

export default function ExportCeremony({open, totalPages, countries, driveLocation, demo, onClose}) {
    const [phase, setPhase] = useState(0);
    const [count, setCount] = useState(0);
    const [done, setDone] = useState(false);
    const timers = useRef([]);

    useEffect(() => {
        if (!open) return undefined;

        setPhase(0);
        setCount(0);
        setDone(false);

        const reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            setPhase(PHASES.length - 1);
            setCount(totalPages);
            setDone(true);
            return undefined;
        }

        const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
        const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));

        // The counter is the centrepiece, so it gets most of the wall clock.
        // Pages tick at a fixed cadence, floored so a small deck still reads as
        // a count rather than a single jump.
        const perPage = Math.max(28, Math.min(90, 2200 / Math.max(1, totalPages)));

        at(500, () => setPhase(1));
        for (let i = 1; i <= totalPages; i++) {
            at(500 + i * perPage, () => setCount(i));
        }
        const renderEnd = 500 + totalPages * perPage;
        at(renderEnd + 250, () => setPhase(2));
        at(renderEnd + 1100, () => setPhase(3));
        at(renderEnd + 1900, () => { setPhase(PHASES.length); setDone(true); });

        return clear;
    }, [open, totalPages]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    if (!open) return null;

    const pct = totalPages ? Math.round((count / totalPages) * 100) : 0;

    return (
        <div className="ceremony-overlay" role="dialog" aria-modal="true" aria-live="polite">
            <div className={`ceremony${done ? ' is-done' : ''}`}>
                <Confetti fire={done} />

                {!done ? (
                    <>
                        <div className="ceremony-eyebrow">Works council pack</div>
                        <div className="ceremony-counter">
                            <span className="ceremony-count">{count}</span>
                            <span className="ceremony-of">/ {totalPages}</span>
                        </div>
                        <div className="ceremony-caption">org chart pages generated</div>

                        <div className="ceremony-progress">
                            <span className="ceremony-progress-fill" style={{width: `${pct}%`}} />
                        </div>

                        <ul className="ceremony-phases">
                            {PHASES.map((p, i) => (
                                <li
                                    key={p.key}
                                    className={i < phase ? 'done' : i === phase ? 'active' : ''}
                                >
                                    <span className="ceremony-tick">
                                        {i < phase ? '✓' : i === phase ? <i className="ceremony-spin" /> : ''}
                                    </span>
                                    {p.label}
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <div className="ceremony-done">
                        <div className="ceremony-badge">✓</div>
                        <h2 className="ceremony-title">Your org charts are saved</h2>
                        <p className="ceremony-body">
                            <strong>{totalPages}</strong> org chart page{totalPages !== 1 ? 's' : ''}
                            {countries ? <> covering <strong>{countries}</strong> countries</> : null}
                            {' '}have been packaged and saved to our Drive.
                        </p>
                        <div className="ceremony-drive">
                            <span className="ceremony-drive-icon">▲</span>
                            <span className="ceremony-drive-path">{driveLocation}</span>
                        </div>
                        {demo && (
                            <p className="ceremony-demo">
                                Demo — the pack is not actually uploaded. The page count is real.
                            </p>
                        )}
                        <button className="btn btn-primary" onClick={onClose}>Done</button>
                    </div>
                )}

                {!done && (
                    <button className="ceremony-cancel" onClick={onClose}>Cancel</button>
                )}
            </div>
        </div>
    );
}
