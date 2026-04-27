export const tokens = {
    colors: {
        bg: '#FAF8F5',
        bgAlt: '#F2EEE8',
        bgPanel: '#FFFFFF',
        bgDark: '#1A1814',
        text: '#1A1814',
        textMuted: '#5C544A',
        textFaint: '#8A8175',
        accent: '#0A3D62',
        accentSoft: '#1F5A85',
        sevHigh: '#B23A3A',
        sevMed: '#C7882C',
        sevLow: '#5A8C5E',
        tagHeatmap: '#D4592C',
        tagPressure: '#A8324A',
        tagGap: '#C7882C',
        tagFriction: '#5C3A8A',
        rule: '#D8D2C8',
        ruleSoft: '#E8E2D8',
    },
    fonts: {
        serif: '"Playfair Display", "IBM Plex Serif", Georgia, serif',
        sans: 'Inter, "IBM Plex Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        mono: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", Menlo, monospace',
    },
    space: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        xxl: '32px',
    },
    radius: {
        sm: '2px',
        md: '4px',
        lg: '6px',
    },
    shadow: {
        panel: '0 1px 0 rgba(26,24,20,0.04), 0 1px 3px rgba(26,24,20,0.04)',
        lift: '0 2px 8px rgba(26,24,20,0.08)',
    },
} as const;

export type Tokens = typeof tokens;

export const sevColor = (sev: string | null | undefined): string => {
    const s = (sev || '').toLowerCase();
    if (s === 'high') return tokens.colors.sevHigh;
    if (s === 'medium' || s === 'med') return tokens.colors.sevMed;
    if (s === 'low') return tokens.colors.sevLow;
    return tokens.colors.textFaint;
};

export const tagColor = (tag: string): string => {
    const t = tag.toLowerCase();
    if (t === 'heatmap') return tokens.colors.tagHeatmap;
    if (t === 'pressure') return tokens.colors.tagPressure;
    if (t === 'gap') return tokens.colors.tagGap;
    if (t === 'friction') return tokens.colors.tagFriction;
    return tokens.colors.textMuted;
};
