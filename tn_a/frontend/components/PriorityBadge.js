import { priorityColor } from '../utils/colors'

export default function PriorityBadge({ priority, size = 'sm' }) {
  const color = priorityColor(priority)
  const fontSize = size === 'sm' ? 10 : 11
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: size === 'sm' ? '2px 7px' : '3px 9px',
        borderRadius: 4,
        fontSize,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: '#fff',
        background: color,
        whiteSpace: 'nowrap',
      }}
    >
      {priority}
    </span>
  )
}
