// A small canvas confetti burst.
//
// Hand-rolled rather than pulled from npm: it is ~70 lines, and a dependency
// would be a third of the bundle for one flourish. Physics is deliberately
// crude — gravity, drag, spin — because at 2.5 seconds nobody is inspecting it.

import {useEffect, useRef} from 'react';

const COLORS = ['#2a78d6', '#0ca30c', '#eda100', '#d03b3b', '#e87ba4', '#4a3aa7'];

function makePieces(width, height, count) {
    const pieces = [];
    // Two cannons angled inward from the lower corners, which reads better in a
    // wide panel than a single central fountain.
    const origins = [
        {x: width * 0.18, y: height * 0.75, angle: -Math.PI / 3},
        {x: width * 0.82, y: height * 0.75, angle: -Math.PI * 2 / 3},
    ];
    origins.forEach(origin => {
        for (let i = 0; i < count / 2; i++) {
            const spread = (Math.random() - 0.5) * 0.9;
            const speed = 9 + Math.random() * 9;
            pieces.push({
                x: origin.x,
                y: origin.y,
                vx: Math.cos(origin.angle + spread) * speed,
                vy: Math.sin(origin.angle + spread) * speed,
                w: 5 + Math.random() * 6,
                h: 3 + Math.random() * 5,
                spin: (Math.random() - 0.5) * 0.35,
                rot: Math.random() * Math.PI,
                color: COLORS[(Math.random() * COLORS.length) | 0],
                life: 1,
            });
        }
    });
    return pieces;
}

export default function Confetti({fire, pieces = 160}) {
    const canvasRef = useRef(null);
    const rafRef = useRef(0);

    useEffect(() => {
        if (!fire) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return undefined;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const {clientWidth: w, clientHeight: h} = canvas;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        let bits = makePieces(w, h, pieces);

        const frame = () => {
            ctx.clearRect(0, 0, w, h);
            let alive = false;
            bits.forEach(p => {
                p.vy += 0.32;          // gravity
                p.vx *= 0.99;          // drag
                p.vy *= 0.99;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.spin;
                p.life -= 0.008;
                if (p.life <= 0 || p.y > h + 20) return;
                alive = true;
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });
            if (alive) rafRef.current = requestAnimationFrame(frame);
        };
        rafRef.current = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(rafRef.current);
            bits = [];
        };
    }, [fire, pieces]);

    return <canvas className="confetti-canvas" ref={canvasRef} aria-hidden="true" />;
}
