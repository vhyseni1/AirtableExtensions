import { personaColor } from '../utils/colors.js'

export default function PersonaChip({ persona, size = 'sm' }) {
  const color = personaColor(persona)
  const pad = size === 'sm' ? '2px 8px' : '4px 10px'
  const fontSize = size === 'sm' ? 11 : 12
  return (
    <span
      title={persona}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: pad,
        borderRadius: 4,
        fontSize,
        fontWeight: 600,
        color,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{persona}</span>
    </span>
  )
}
