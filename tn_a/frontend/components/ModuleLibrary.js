import { useMemo, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { TOKENS, personaColor } from '../utils/colors'
import { uniqueValues } from '../utils/aggregations'
import PriorityBadge from './PriorityBadge'
import PersonaChip from './PersonaChip'

const FILTER_DEFS = [
  { key: 'persona', label: 'Persona', field: 'personas', multi: true },
  { key: 'affiliate', label: 'Affiliate', field: 'affiliates', multi: true },
  { key: 'priority', label: 'Priority', field: 'priority' },
  { key: 'format', label: 'Format', field: 'format' },
  { key: 'sequencing', label: 'Sequencing', field: 'sequencing' },
]

export default function ModuleLibrary({ state }) {
  const { modules, openDrawer, rows } = state

  // Enrich modules with affiliates + format pulled from their rows
  const enriched = useMemo(
    () =>
      modules.map((m) => ({
        ...m,
        affiliates: uniqueValues(m.rows, 'Affiliate'),
        format: m.rows[0]?.Format,
      })),
    [modules],
  )

  const options = useMemo(() => {
    const personas = Array.from(new Set(enriched.flatMap((m) => m.personas))).sort()
    const affiliates = Array.from(new Set(rows.map((r) => r.Affiliate))).sort()
    const priority = ['Critical', 'High', 'Medium', 'Low'].filter((p) =>
      enriched.some((m) => m.priority === p),
    )
    const format = Array.from(new Set(enriched.map((m) => m.format).filter(Boolean))).sort()
    const sequencing = ['Pre-go-live', 'Concurrent', 'Post-go-live'].filter((s) =>
      enriched.some((m) => m.sequencing === s),
    )
    return { persona: personas, affiliate: affiliates, priority, format, sequencing }
  }, [enriched, rows])

  const [filters, setFilters] = useState({
    persona: [],
    affiliate: [],
    priority: [],
    format: [],
    sequencing: [],
  })

  const toggle = (key, value) =>
    setFilters((prev) => {
      const set = new Set(prev[key])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [key]: Array.from(set) }
    })

  const clearAll = () =>
    setFilters({ persona: [], affiliate: [], priority: [], format: [], sequencing: [] })

  const activeCount = Object.values(filters).reduce((a, b) => a + b.length, 0)

  const filtered = useMemo(() => {
    return enriched.filter((m) => {
      if (filters.persona.length && !m.personas.some((p) => filters.persona.includes(p))) return false
      if (filters.affiliate.length && !m.affiliates.some((a) => filters.affiliate.includes(a))) return false
      if (filters.priority.length && !filters.priority.includes(m.priority)) return false
      if (filters.format.length && !filters.format.includes(m.format)) return false
      if (filters.sequencing.length && !filters.sequencing.includes(m.sequencing)) return false
      return true
    })
  }, [enriched, filters])

  const totalHours = filtered.reduce((a, m) => a + (m.totalHours || 0), 0)

  const openModule = (m) => {
    openDrawer({
      type: 'Module',
      title: m.name,
      subtitle: `${m.tnaCount} TNA need${m.tnaCount > 1 ? 's' : ''} · ${m.totalHours}h`,
      accent: personaColor(m.primaryPersona),
      moduleSummary: m,
      rows: m.rows,
    })
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Filter sidebar */}
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: '#fff',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 8,
          padding: 16,
          boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
          position: 'sticky',
          top: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Filter size={16} color={TOKENS.navy} />
          <span className="font-serif-head" style={{ fontSize: 16, color: TOKENS.navy }}>
            Filters
          </span>
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: TOKENS.subtle,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
        {FILTER_DEFS.map((def) => (
          <FilterGroup
            key={def.key}
            label={def.label}
            values={options[def.key]}
            selected={filters[def.key]}
            onToggle={(v) => toggle(def.key, v)}
          />
        ))}
      </aside>

      {/* Grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 className="font-serif-head" style={{ fontSize: 22, margin: 0, color: TOKENS.navy }}>
            Module Library
          </h2>
          <span style={{ fontSize: 13, color: TOKENS.subtle }}>
            {filtered.length} of {enriched.length} modules ·{' '}
            <span className="font-mono-num" style={{ color: TOKENS.navy, fontWeight: 600 }}>
              {totalHours}h
            </span>
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState onClear={clearAll} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {filtered.map((m) => (
              <ModuleGridCard key={m.moduleId} module={m} onClick={() => openModule(m)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterGroup({ label, values, selected, onToggle }) {
  if (!values || values.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: TOKENS.subtle,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {values.map((v) => {
          const active = selected.includes(v)
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 5,
                border: `1px solid ${active ? TOKENS.navy : TOKENS.border}`,
                background: active ? `${TOKENS.navy}0d` : '#fff',
                color: active ? TOKENS.navy : '#444',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                textAlign: 'left',
                transition: 'all 150ms ease',
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 3,
                  border: `1.5px solid ${active ? TOKENS.navy : '#c8c8c0'}`,
                  background: active ? TOKENS.navy : '#fff',
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ModuleGridCard({ module, onClick }) {
  const [hover, setHover] = useState(false)
  const [showRoles, setShowRoles] = useState(false)
  const color = personaColor(module.primaryPersona)
  const roles = module.rolesCovered
  const rolesText = roles.join(', ')

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: '14px 14px 14px 18px',
        boxShadow: hover ? '0 8px 24px rgba(10,61,98,0.14)' : '0 2px 12px rgba(10,61,98,0.06)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'all 200ms ease',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 168,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '8px 0 0 8px', background: color }} />
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <PriorityBadge priority={module.priority} />
      </div>

      <div style={{ paddingRight: 70 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.25 }}>
          {module.name}
        </div>
        <div style={{ fontSize: 12, fontStyle: 'italic', color: TOKENS.subtle, marginTop: 4 }}>
          {module.component}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 10 }}>
        {module.personas.slice(0, 2).map((p) => (
          <PersonaChip key={p} persona={p} />
        ))}
        {module.personas.length > 2 && (
          <span style={{ fontSize: 11, color: TOKENS.subtle, alignSelf: 'center' }}>
            +{module.personas.length - 2}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11.5,
          color: TOKENS.subtle,
          borderTop: `1px solid ${TOKENS.border}`,
          paddingTop: 10,
        }}
      >
        <span className="font-mono-num" style={{ fontWeight: 700, color: TOKENS.navy, fontSize: 13 }}>
          {module.totalHours}h
        </span>
        <span>·</span>
        <span>{module.format}</span>
        <span style={{ flex: 1 }} />
        <span
          title={rolesText}
          onMouseEnter={() => setShowRoles(true)}
          onMouseLeave={() => setShowRoles(false)}
          style={{
            maxWidth: showRoles ? 'none' : 90,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          {roles.length} role{roles.length > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

function EmptyState({ onClear }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px dashed ${TOKENS.border}`,
        borderRadius: 8,
        padding: 48,
        textAlign: 'center',
        color: TOKENS.subtle,
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#333' }}>No modules match these filters</p>
      <p style={{ margin: '6px 0 16px', fontSize: 13 }}>Try removing a filter to widen the results.</p>
      <button
        onClick={onClear}
        style={{
          background: TOKENS.navy,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Clear filters
      </button>
    </div>
  )
}
