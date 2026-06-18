import { useMemo, useState, useRef, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { RotateCcw, Lock, ChevronDown, Clock, CalendarDays, Layers } from 'lucide-react'
import { TOKENS, PHASE_ORDER, PHASE_COLORS, personaColor } from '../utils/colors'
import PhaseColumn from './PhaseColumn'
import { ModuleCardView } from './ModuleCard'

export default function LearningJourneySequencer({ state }) {
  const {
    journeyOpts,
    journeyKey,
    selectJourney,
    currentJourney,
    currentSequence,
    moveModule,
    resetSequence,
    isDirty,
    openDrawer,
  } = state

  const [activeId, setActiveId] = useState(null)
  const [flashPhase, setFlashPhase] = useState(null)
  const [toast, setToast] = useState(null)
  const flashTimer = useRef(null)
  const toastTimer = useRef(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const moduleById = useMemo(() => {
    const map = {}
    if (currentJourney) for (const m of currentJourney.modules) map[m.moduleId] = m
    return map
  }, [currentJourney])

  const phaseWeeks = useMemo(() => {
    const w = {}
    if (currentJourney) {
      for (const m of currentJourney.modules) {
        if (!w[m.phase]) w[m.phase] = m.rows[0]?.Journey_Phase_Weeks
      }
    }
    return w
  }, [currentJourney])

  useEffect(() => {
    return () => {
      clearTimeout(flashTimer.current)
      clearTimeout(toastTimer.current)
    }
  }, [])

  if (!currentJourney) {
    return <div style={{ color: TOKENS.subtle }}>No journey data available.</div>
  }

  const findPhase = (moduleId) =>
    PHASE_ORDER.find((p) => currentSequence[p].includes(moduleId))

  const phaseModules = (phase) =>
    currentSequence[phase].map((id) => moduleById[id]).filter(Boolean)

  const phaseHours = (phase) =>
    phaseModules(phase).reduce((a, m) => a + (m.hours || 0), 0)

  const totalHours = currentJourney.totalHours || PHASE_ORDER.reduce((a, p) => a + phaseHours(p), 0)

  const triggerFlash = (phase) => {
    setFlashPhase(phase)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashPhase(null), 720)
  }

  const onDragStart = (e) => setActiveId(e.active.id)

  const onDragOver = (e) => {
    const { active, over } = e
    if (!over) return
    const activeId = active.id
    const overId = over.id
    const fromPhase = findPhase(activeId)
    let toPhase = String(overId).startsWith('phase:') ? String(overId).slice(6) : findPhase(overId)
    if (!fromPhase || !toPhase) return
    if (fromPhase === toPhase) return // within-phase handled on drag end
    let index = currentSequence[toPhase].length
    if (!String(overId).startsWith('phase:')) {
      const i = currentSequence[toPhase].indexOf(overId)
      if (i !== -1) index = i
    }
    moveModule(activeId, fromPhase, toPhase, index)
  }

  const onDragEnd = (e) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const activeId = active.id
    const overId = over.id
    const fromPhase = findPhase(activeId)
    let toPhase = String(overId).startsWith('phase:') ? String(overId).slice(6) : findPhase(overId)
    if (!toPhase) toPhase = fromPhase
    if (fromPhase === toPhase) {
      const arr = currentSequence[toPhase]
      const oldIndex = arr.indexOf(activeId)
      let newIndex = String(overId).startsWith('phase:') ? arr.length - 1 : arr.indexOf(overId)
      if (newIndex < 0) newIndex = arr.length - 1
      if (oldIndex !== newIndex) {
        const reordered = arrayMove(arr, oldIndex, newIndex)
        moveModule(activeId, toPhase, toPhase, reordered.indexOf(activeId))
      }
    }
    triggerFlash(toPhase)
  }

  const onOpenModule = (m) => {
    openDrawer({
      type: 'Module',
      title: m.name,
      subtitle: `${m.tnaCount} TNA need${m.tnaCount > 1 ? 's' : ''} · ${m.hours}h`,
      accent: personaColor(m.persona),
      moduleSummary: {
        ...m,
        totalHours: m.hours,
        rolesCovered: m.rows[0]?.Module_Roles_Covered
          ? m.rows[0].Module_Roles_Covered.split('|').map((s) => s.trim())
          : [],
        personas: Array.from(new Set(m.rows.map((r) => r.Persona))),
        sequencing: m.phase,
        prerequisites: m.rows[0]?.Module_Prerequisites,
      },
      rows: m.rows,
    })
  }

  const lock = () => {
    setToast(`Sequence locked for ${currentJourney.persona}. In production this would write back to Airtable.`)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3600)
  }

  const activeModule = activeId ? moduleById[activeId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: '#fff',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 8,
          padding: '12px 16px',
          boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: TOKENS.subtle }}>
            Learning Journey
          </span>
          <JourneySelect options={journeyOpts} value={journeyKey} onChange={selectJourney} />
        </div>

        <div style={{ flex: 1 }} />

        <KpiStrip
          items={[
            { icon: Clock, label: 'Total hours', value: `${totalHours}h` },
            { icon: CalendarDays, label: 'Timeline', value: `${currentJourney.timelineWeeks} wks` },
            { icon: Layers, label: 'Modules', value: currentJourney.modulesCount },
          ]}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={resetSequence}
            disabled={!isDirty}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${TOKENS.border}`,
              background: '#fff',
              color: isDirty ? TOKENS.navy : '#bbb',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <RotateCcw size={14} /> Reset Sequence
          </button>
          <button
            onClick={lock}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: TOKENS.navy,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Lock size={14} /> Lock Sequence
          </button>
        </div>
      </div>

      {/* Canvas */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {PHASE_ORDER.map((phase) => {
            const mods = phaseModules(phase)
            const hours = phaseHours(phase)
            const pct = totalHours ? Math.round((hours / totalHours) * 100) : 0
            return (
              <PhaseColumn
                key={phase}
                phase={phase}
                modules={mods}
                weeks={phaseWeeks[phase]}
                hours={hours}
                pct={pct}
                flashing={flashPhase === phase}
                onOpenModule={onOpenModule}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeModule ? <ModuleCardView module={activeModule} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* Phase summary bar */}
      <PhaseSummary
        phases={PHASE_ORDER.map((phase) => ({
          phase,
          hours: phaseHours(phase),
          count: phaseModules(phase).length,
          pct: totalHours ? Math.round((phaseHours(phase) / totalHours) * 100) : 0,
        }))}
        total={totalHours}
      />

      {toast && (
        <div
          className="toast-in"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: TOKENS.navy,
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(10,61,98,0.3)',
            fontSize: 13,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 520,
          }}
        >
          <Lock size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

function JourneySelect({ options, value, onChange }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: '#fff',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 6,
          padding: '8px 34px 8px 12px',
          fontSize: 14,
          fontWeight: 600,
          color: TOKENS.navy,
          cursor: 'pointer',
          fontFamily: 'inherit',
          minWidth: 280,
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        color={TOKENS.subtle}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      />
    </div>
  )
}

function KpiStrip({ items }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#FAFAF7',
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 6,
          }}
        >
          <Icon size={15} color={TOKENS.navy} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span className="font-mono-num" style={{ fontSize: 15, fontWeight: 700, color: TOKENS.navy }}>
              {value}
            </span>
            <span style={{ fontSize: 10, color: TOKENS.subtle }}>{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function PhaseSummary({ phases, total }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: 16,
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: TOKENS.subtle, marginBottom: 10 }}>
        Phase distribution · {total}h total
      </div>
      <div style={{ display: 'flex', width: '100%', height: 26, borderRadius: 6, overflow: 'hidden', border: `1px solid ${TOKENS.border}` }}>
        {phases.map((p) =>
          p.hours > 0 ? (
            <div
              key={p.phase}
              title={`${p.phase}: ${p.hours}h (${p.pct}%)`}
              style={{
                width: `${p.pct}%`,
                background: PHASE_COLORS[p.phase],
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'width 250ms ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {p.pct >= 8 ? `${p.hours}h` : ''}
            </div>
          ) : null,
        )}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
        {phases.map((p) => (
          <div key={p.phase} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: PHASE_COLORS[p.phase] }} />
            <span style={{ fontSize: 12.5, color: '#333', fontWeight: 600 }}>{p.phase}</span>
            <span className="font-mono-num" style={{ fontSize: 12, color: TOKENS.subtle }}>
              {p.hours}h · {p.count} mod · {p.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
