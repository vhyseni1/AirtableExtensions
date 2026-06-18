import { useState } from 'react'
import { X, Quote, ChevronDown, ChevronRight } from 'lucide-react'
import { TOKENS, personaColor } from '../utils/colors'
import { parseTags, tagColorSafe } from '../utils/drawerHelpers'
import PersonaChip from './PersonaChip'
import PriorityBadge from './PriorityBadge'

export default function DetailDrawer({ state }) {
  const { drawer, closeDrawer } = state
  if (!drawer) return null

  const accent = drawer.accent || TOKENS.navy
  const rows = drawer.rows || []

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10,61,98,0.18)',
          zIndex: 50,
          animation: 'fadeIn 200ms ease',
        }}
      />
      {/* Panel */}
      <aside
        className="drawer-in"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: '92vw',
          background: '#fff',
          zIndex: 51,
          boxShadow: '-12px 0 40px rgba(10,61,98,0.20)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ height: 4, background: accent, flexShrink: 0 }} />
        {/* Header */}
        <div
          style={{
            padding: '18px 20px 16px',
            borderBottom: `1px solid ${TOKENS.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: accent,
                }}
              >
                {drawer.type}
              </div>
              <h2
                className="font-serif-head"
                style={{ fontSize: 22, margin: '4px 0 0', color: TOKENS.navy, lineHeight: 1.2 }}
              >
                {drawer.title}
              </h2>
              {drawer.subtitle && (
                <div style={{ fontSize: 12.5, color: TOKENS.subtle, marginTop: 4 }}>
                  {drawer.subtitle}
                </div>
              )}
            </div>
            <button
              onClick={closeDrawer}
              style={{
                border: 'none',
                background: '#F1F1EC',
                borderRadius: 6,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                color: TOKENS.subtle,
              }}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {drawer.moduleSummary && <ModuleSummary module={drawer.moduleSummary} />}

          <SectionLabel>
            Lineage · {rows.length} {rows.length === 1 ? 'record' : 'records'}
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((row, i) => (
              <LineageCard key={row.Row_ID || i} row={row} defaultOpen={rows.length <= 2} />
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}

function ModuleSummary({ module }) {
  return (
    <div
      style={{
        background: '#FAFAF7',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <PriorityBadge priority={module.priority} />
        <Chip>{module.totalHours}h total</Chip>
        <Chip>{module.deliveryMethod}</Chip>
        <Chip>{module.sequencing}</Chip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {module.personas.map((p) => (
          <PersonaChip key={p} persona={p} />
        ))}
      </div>
      {module.rolesCovered?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: TOKENS.subtle }}>
          <strong style={{ color: '#333' }}>Roles covered:</strong> {module.rolesCovered.join(', ')}
        </div>
      )}
      {module.prerequisites && (
        <div style={{ marginTop: 4, fontSize: 12, color: TOKENS.subtle }}>
          <strong style={{ color: '#333' }}>Prerequisites:</strong> {module.prerequisites}
        </div>
      )}
    </div>
  )
}

function LineageCard({ row, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const tags = parseTags(row.Tags)
  const color = row.Persona_Color || personaColor(row.Persona)

  return (
    <div
      style={{
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: '#fff',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={16} color={TOKENS.subtle} /> : <ChevronRight size={16} color={TOKENS.subtle} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.25 }}>
            {row.Module_Name}
          </div>
          <div style={{ fontSize: 11, color: TOKENS.subtle, marginTop: 2 }}>
            {row.Change_Category} · {row.Role}
          </div>
        </div>
        <PriorityBadge priority={row.Priority} />
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', background: '#fff' }}>
          {/* Source quote */}
          <div
            style={{
              borderLeft: `3px solid ${color}`,
              background: '#FAFAF7',
              padding: '8px 12px',
              margin: '4px 0 12px',
              borderRadius: '0 6px 6px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Quote size={13} color={color} />
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color, textTransform: 'uppercase' }}>
                Verbatim source
              </span>
            </div>
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: 13, color: '#333', lineHeight: 1.5 }}>
              “{row.Source_Quote}”
            </p>
            <div style={{ fontSize: 10.5, color: TOKENS.subtle, marginTop: 6 }}>
              {row.Source_Run} · confidence {row.CIA_Confidence}
            </div>
          </div>

          {/* Lineage levels */}
          <LineageLevel step="CIA Impact" id={row.Impact_ID}>
            <KV label="As-is" value={row.Description_As_Is} />
            <KV label="To-be" value={row.Description_To_Be} />
            <KV label="Change impact" value={row.Change_Impact} />
            <KV label="Component" value={row.Change_Component} />
          </LineageLevel>

          <LineageLevel step="Training Need" id={row.TNA_ID}>
            <KV label="Competency" value={row.Competency_Required} />
            <KV label="Proficiency" value={`${row.Current_Proficiency} → ${row.Target_Proficiency} (gap ${row.Proficiency_Gap})`} />
            <KV label="Training" value={`${row.Training_Type} · ${row.Format}`} />
            <KV label="Estimated hours" value={`${row.Estimated_Hours}h`} mono />
            <KV label="Sequencing" value={row.Sequencing} />
          </LineageLevel>

          <LineageLevel step="Journey" id={row.Journey_ID}>
            <KV label="Phase" value={`${row.Journey_Phase} (${row.Journey_Phase_Weeks})`} />
            <KV label="Persona" value={row.Journey_Persona} />
            <KV label="Affiliate" value={row.Journey_Affiliate} />
          </LineageLevel>

          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {tags.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: tagColorSafe(t),
                    background: `${tagColorSafe(t)}14`,
                    border: `1px solid ${tagColorSafe(t)}33`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LineageLevel({ step, id, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: TOKENS.navy,
          }}
        >
          {step}
        </span>
        <span className="font-mono-num" style={{ fontSize: 10.5, color: TOKENS.subtle }}>
          {id}
        </span>
        <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 2 }}>
        {children}
      </div>
    </div>
  )
}

function KV({ label, value, mono }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.45 }}>
      <span style={{ color: TOKENS.subtle, minWidth: 96, flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'font-mono-num' : ''} style={{ color: '#222' }}>
        {value}
      </span>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: TOKENS.subtle,
        margin: '4px 0 12px',
      }}
    >
      {children}
    </div>
  )
}

function Chip({ children }) {
  return (
    <span
      className="font-mono-num"
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        background: '#F1F1EC',
        color: '#333',
        border: `1px solid ${TOKENS.border}`,
      }}
    >
      {children}
    </span>
  )
}
