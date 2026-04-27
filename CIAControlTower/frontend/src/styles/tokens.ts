export const tokens = {
    colors: {
        // Surfaces — extra-light-blue page tint with crisp white panels
        bg: '#F2F6FF',
        bgAlt: '#E6F1FF',
        bgPanel: '#FFFFFF',
        bgDark: '#022366',

        // Text — Roche dark blue for primary, neutral grays for secondary
        text: '#022366',
        textMuted: '#4A5878',
        textFaint: '#8895AD',

        // Brand accents — Roche Blue
        accent: '#0B41CD',
        accentDeep: '#022366',
        accentSoft: '#1482FA',
        accentTint: '#BDE3FF',

        // Severity — Roche traffic-light status palette
        sevHigh: '#FF1F26',
        sevMed: '#FFD60C',
        sevLow: '#00B458',

        // Tags — Roche accent palette
        tagHeatmap: '#FF7D29',     // Orange
        tagPressure: '#C40000',    // Dark Red
        tagGap: '#ED4A0D',         // Dark Orange (distinct from sevMed yellow)
        tagFriction: '#BC36F0',    // Dark Purple

        // Rules — Roche extra-light-blue tint for hairlines
        rule: '#BDE3FF',
        ruleSoft: '#E6F1FF',
    },
    fonts: {
        // Roche Sans is the corporate typeface for everything (headlines + body).
        // It is proprietary and only available on Roche corporate machines; on
        // non-Roche machines the stack falls back to Helvetica/Arial cleanly.
        serif: '"Roche Sans", "Roche Serif", Helvetica, Arial, sans-serif',
        sans: '"Roche Sans", Helvetica, Arial, system-ui, sans-serif',
        mono: '"Roche Sans Mono", "JetBrains Mono", "IBM Plex Mono", "SF Mono", Menlo, monospace',
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
        panel: '0 1px 0 rgba(2,35,102,0.04), 0 1px 3px rgba(2,35,102,0.06)',
        lift: '0 2px 8px rgba(2,35,102,0.10)',
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
