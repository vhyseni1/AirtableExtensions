// Design tokens — mirror the CIA Control Tower palette. Do not invent new colors.

export const TOKENS = {
  navy: '#0A3D62',
  paper: '#FAFAF7',
  card: '#FFFFFF',
  border: '#E5E5E0',
  subtle: '#5D5D5D',
  teal: '#1A8A8F',
  mauve: '#6B3F5E',
}

// One color per Persona (matches the Persona_Color column).
export const PERSONA_COLORS = {
  'Primary Point of Contact': '#0A3D62',
  'Scientific Expert': '#2C5F8D',
  'BI & Analytics': '#1A8A8F',
  Digital: '#8B5A3C',
  Admin: '#A65D3D',
  'Market Access': '#5D4E37',
  Compliance: '#6B3F5E',
}

export const PRIORITY_COLORS = {
  Critical: '#C0392B',
  High: '#E67E22',
  Medium: '#F1C40F',
  Low: '#7F8C8D',
}

// Severity weights used for heatmap intensity.
export const PRIORITY_WEIGHT = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

export const TAG_COLORS = {
  Gap: '#C0392B',
  Heatmap: '#0A3D62',
  Pressure: '#E67E22',
  Friction: '#6B3F5E',
}

// Phase accent colors for the Learning Journey tracks.
export const PHASE_COLORS = {
  'Pre-go-live': '#0A3D62', // navy
  Concurrent: '#1A8A8F', // teal
  'Post-go-live': '#6B3F5E', // mauve
}

export const PHASE_ORDER = ['Pre-go-live', 'Concurrent', 'Post-go-live']

export function personaColor(persona) {
  return PERSONA_COLORS[persona] || TOKENS.navy
}

export function priorityColor(priority) {
  return PRIORITY_COLORS[priority] || TOKENS.subtle
}

export function tagColor(tag) {
  return TAG_COLORS[tag] || TOKENS.subtle
}

// Blend off-white -> navy for heatmap cells. t in [0, 1].
export function heatColor(t) {
  const from = [250, 250, 247] // #FAFAF7
  const to = [10, 61, 98] // #0A3D62
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
