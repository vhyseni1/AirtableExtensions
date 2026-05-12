export const colors = {
    rocheBlue: '#0066CC',
    rocheBlueLight: '#E6F1FB',
    rocheRed: '#ED1C24',
    rocheAmber: '#F39200',
    rocheYellow: '#F5B800',
    rocheGreen: '#00A651',
    rocheViolet: '#5B4B9B',
    rocheGrey: '#7F7F7F',
    white: '#FFFFFF',
    black: '#000000',
    bgPage: '#F5F5F5',
    bgAlt: '#FAFAFA',
    border: '#E5E5E5',
    textPrimary: '#000000',
    textSecondary: '#595959',
    textTertiary: '#8C8C8C',
    severityHigh: {bg: '#FCEBEB', text: '#791F1F'},
    severityMed: {bg: '#FAEEDA', text: '#633806'},
    severityLow: {bg: '#F5F5F5', text: '#595959'},
};

export const dimensionColors = {
    Accuracy: colors.rocheRed,
    Consistency: colors.rocheAmber,
    Completeness: colors.rocheYellow,
    Referential: colors.rocheBlue,
    Validity: colors.rocheViolet,
    Uniqueness: colors.rocheGreen,
};

export const spacing = {
    cardPadding: 20,
    cardGap: 16,
    containerPadding: 24,
    cardRadius: 4,
    borderWidth: 1,
};

export const typography = {
    h1: {size: 22, weight: 500},
    h2: {size: 18, weight: 500},
    h3: {size: 14, weight: 500},
    body: {size: 14, weight: 400, lineHeight: 1.5},
    small: {size: 12, weight: 400},
    metric: {size: 28, weight: 500},
    family: '-apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

export function thresholdColor(pct) {
    if (pct >= 95) return colors.rocheGreen;
    if (pct >= 85) return colors.rocheAmber;
    return colors.rocheRed;
}

export function scoreColor(score) {
    if (score >= 90) return colors.rocheGreen;
    if (score >= 70) return colors.rocheAmber;
    return colors.rocheRed;
}

export function badgeStyle(count) {
    if (count >= 20) return colors.severityHigh;
    if (count >= 10) return colors.severityMed;
    return colors.severityLow;
}
