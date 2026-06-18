import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { TOKENS, personaColor, priorityColor } from '../utils/colors.js'
import PersonaChip from './PersonaChip.jsx'

// Presentational card — also used inside the DragOverlay (overlay = true).
export function ModuleCardView({ module, dragging = false, overlay = false, listeners, attributes, onOpen }) {
  const stripe = priorityColor(module.priority)
  return (
    <div
      {...attributes}
      onClick={() => !dragging && onOpen && onOpen()}
      style={{
        position: 'relative',
        width: 260,
        minHeight: 140,
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: '12px 14px 12px 18px',
        boxShadow: overlay
          ? '0 16px 40px rgba(10,61,98,0.28)'
          : dragging
            ? '0 2px 8px rgba(10,61,98,0.06)'
            : '0 2px 12px rgba(10,61,98,0.08)',
        opacity: dragging && !overlay ? 0.35 : 1,
        transform: overlay ? 'rotate(8deg)' : 'none',
        cursor: onOpen ? 'pointer' : 'grab',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 200ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: '8px 0 0 8px',
          background: stripe,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.25 }}>
            {module.name}
          </div>
          <div style={{ fontSize: 11.5, fontStyle: 'italic', color: TOKENS.subtle, marginTop: 3 }}>
            {module.component}
          </div>
        </div>
        <button
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to re-sequence"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'grab',
            color: '#bdbdb4',
            padding: 2,
            flexShrink: 0,
            touchAction: 'none',
          }}
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span
          className="font-mono-num"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: TOKENS.navy,
            background: '#F1F1EC',
            padding: '2px 7px',
            borderRadius: 4,
          }}
        >
          {module.hours}h
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#444',
            background: '#F1F1EC',
            padding: '2px 7px',
            borderRadius: 4,
          }}
        >
          {module.format}
        </span>
        <PersonaChip persona={module.persona} />
        <span
          title="TNA needs feeding this module"
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: personaColor(module.persona),
            borderRadius: 10,
            padding: '1px 8px',
          }}
        >
          {module.tnaCount} TNA
        </span>
      </div>
    </div>
  )
}

export default function ModuleCard({ module, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.moduleId,
  })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <ModuleCardView
        module={module}
        dragging={isDragging}
        listeners={listeners}
        attributes={attributes}
        onOpen={onOpen}
      />
    </div>
  )
}
