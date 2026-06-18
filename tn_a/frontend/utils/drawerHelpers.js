import { TAG_COLORS, TOKENS } from './colors'

export function parseTags(value) {
  if (!value) return []
  return String(value)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function tagColorSafe(tag) {
  return TAG_COLORS[tag] || TOKENS.subtle
}
