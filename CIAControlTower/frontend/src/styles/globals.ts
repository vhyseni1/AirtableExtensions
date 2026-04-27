import {tokens} from './tokens';

const css = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; }

html, body, #root {
    margin: 0;
    padding: 0;
    height: 100%;
    background: ${tokens.colors.bg};
    color: ${tokens.colors.text};
    font-family: ${tokens.fonts.sans};
    font-size: 13px;
    line-height: 1.4;
    font-feature-settings: "tnum" 1, "ss01" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

button {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
}

button:focus-visible {
    outline: 2px solid ${tokens.colors.accent};
    outline-offset: 2px;
}

.cia-num {
    font-feature-settings: "tnum" 1;
    font-variant-numeric: tabular-nums;
}

.cia-serif {
    font-family: ${tokens.fonts.serif};
}

.cia-eyebrow {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${tokens.colors.textMuted};
    font-weight: 600;
}

.cia-rule {
    border: 0;
    border-top: 1px solid ${tokens.colors.rule};
    margin: 0;
}

@keyframes cia-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
}

@keyframes cia-skeleton {
    0% { background-position: -200px 0; }
    100% { background-position: calc(200px + 100%) 0; }
}

.cia-skeleton {
    background: linear-gradient(90deg, ${tokens.colors.bgAlt} 0%, ${tokens.colors.ruleSoft} 50%, ${tokens.colors.bgAlt} 100%);
    background-size: 200px 100%;
    background-repeat: no-repeat;
    animation: cia-skeleton 1.4s ease-in-out infinite;
    border-radius: ${tokens.radius.sm};
}

.cia-pulse {
    animation: cia-pulse 1.6s ease-in-out infinite;
}

.cia-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.cia-scroll::-webkit-scrollbar-thumb { background: ${tokens.colors.rule}; border-radius: 4px; }
.cia-scroll::-webkit-scrollbar-track { background: transparent; }

@media print {
    @page { size: A3 landscape; margin: 14mm; }
    html, body, #root { background: #fff !important; }
    .cia-pulse { animation: none !important; }
    .cia-skeleton { background: ${tokens.colors.bgAlt} !important; animation: none !important; }
    button { box-shadow: none !important; }
    .cia-no-print { display: none !important; }
}
`;

export function injectGlobalStyles(): void {
    if (typeof document === 'undefined') return;
    const id = 'cia-global-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}
