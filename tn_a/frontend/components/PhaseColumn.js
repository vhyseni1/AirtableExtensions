import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { TOKENS, PHASE_COLORS } from '../utils/colors'
import ModuleCard from './ModuleCard'

export default function PhaseColumn({ phase, modules, weeks, hours, pct, flashing, onOpenModule }) {
  const { setNodeRef, isOver } = useDroppable({ id: `phase:${phase}` })
  const accent = PHASE_COLORS[phase] || TOKENS.navy
  const ids = modules.map((m) => m.moduleId)

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
      }}
    >
      {/* Track header */}
      <div
        className={flashing ? 'phase-flash' : ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: accent,
          color: '#fff',
        }}
      >
        <span className="font-serif-head" style={{ fontSize: 16, fontWeight: 600 }}>
          {phase}
        </span>
        {weeks && (
          <span style={{ fontSize: 11.5, opacity: 0.82 }}>{weeks}</span>
        )}
        <div style={{ flex: 1 }} />
        <span className="font-mono-num" style={{ fontSize: 13, fontWeight: 700 }}>
          {hours}h
        </span>
        <span style={{ fontSize: 11.5, opacity: 0.82 }}>
          {modules.length} module{modules.length !== 1 ? 's' : ''}
        </span>
        <span className="font-mono-num" style={{ fontSize: 11.5, opacity: 0.82 }}>
          {pct}%
        </span>
      </div>

      {/* Drop area */}
      <div
        ref={setNodeRef}
        style={{
          minHeight: 168,
          padding: 14,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          background: isOver ? `${accent}0d` : 'transparent',
          boxShadow: isOver ? `inset 0 0 0 2px ${accent}66` : 'none',
          borderRadius: 6,
          transition: 'background 200ms ease, box-shadow 200ms ease',
        }}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          {modules.map((m) => (
            <ModuleCard key={m.moduleId} module={m} onOpen={() => onOpenModule(m)} />
          ))}
        </SortableContext>

        {modules.length === 0 && (
          <div
            style={{
              flex: 1,
              minHeight: 140,
              border: `1.5px dashed ${TOKENS.border}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#b8b8ae',
              fontSize: 13,
              textAlign: 'center',
              padding: 16,
            }}
          >
            No modules in this phase. Drag here to add.
          </div>
        )}
      </div>
    </div>
  )
}
