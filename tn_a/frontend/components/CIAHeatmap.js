import { useState } from 'react'
import { TOKENS, heatColor, personaColor } from '../utils/colors'

export default function CIAHeatmap({ state }) {
  const { heatmap, components, openDrawer } = state
  const { personas, categories, cells, maxIntensity } = heatmap
  const maxComponent = Math.max(...components.map((c) => c.count), 1)

  const openCell = (persona, cat, cell) => {
    if (!cell.count) return
    openDrawer({
      type: 'Heatmap Cell',
      title: `${persona} · ${cat}`,
      subtitle: `${cell.count} impact${cell.count > 1 ? 's' : ''}`,
      accent: personaColor(persona),
      rows: cell.rows,
    })
  }

  const openComponent = (comp) => {
    const rows = state.rows.filter((r) => r.Change_Component === comp.name)
    openDrawer({
      type: 'Component',
      title: comp.name,
      subtitle: `${rows.length} impact${rows.length > 1 ? 's' : ''} across personas`,
      accent: TOKENS.navy,
      rows,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel
        title="CIA Impacts — Persona × Change Category"
        subtitle="Cell intensity reflects weighted severity (Critical 4 · High 3 · Medium 2 · Low 1). Click a cell to inspect the underlying impacts."
      >
        <div style={{ overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `180px repeat(${categories.length}, minmax(86px, 1fr))`,
              gap: 6,
              minWidth: 880,
            }}
          >
            {/* Header row */}
            <div />
            {categories.map((cat) => (
              <div
                key={cat}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.subtle,
                  textAlign: 'center',
                  padding: '0 4px 6px',
                  lineHeight: 1.25,
                  alignSelf: 'end',
                }}
              >
                {cat}
              </div>
            ))}

            {/* Body */}
            {personas.map((persona) => (
              <Row
                key={persona}
                persona={persona}
                categories={categories}
                cells={cells[persona]}
                maxIntensity={maxIntensity}
                onCell={openCell}
              />
            ))}
          </div>
        </div>
        <Legend maxIntensity={maxIntensity} />
      </Panel>

      <Panel
        title="Top Change Components"
        subtitle="Components ranked by number of impacts. Click a bar to inspect."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {components.map((c) => (
            <ComponentBar
              key={c.name}
              comp={c}
              max={maxComponent}
              onClick={() => openComponent(c)}
            />
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Row({ persona, categories, cells, maxIntensity, onCell }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: '#222',
          paddingRight: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: personaColor(persona),
            flexShrink: 0,
          }}
        />
        <span style={{ lineHeight: 1.2 }}>{persona}</span>
      </div>
      {categories.map((cat) => {
        const cell = cells[cat]
        return <Cell key={cat} cell={cell} maxIntensity={maxIntensity} onClick={() => onCell(persona, cat, cell)} />
      })}
    </>
  )
}

function Cell({ cell, maxIntensity, onClick }) {
  const [hover, setHover] = useState(false)
  const t = maxIntensity ? cell.intensity / maxIntensity : 0
  const bg = cell.count ? heatColor(t) : '#FCFCFA'
  const dark = t > 0.55
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={cell.count ? `${cell.count} impacts · severity ${cell.intensity}` : 'No impacts'}
      style={{
        height: 58,
        borderRadius: 6,
        background: bg,
        border: cell.count ? '1px solid rgba(10,61,98,0.12)' : `1px dashed ${TOKENS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: cell.count ? 'pointer' : 'default',
        color: dark ? '#fff' : cell.count ? TOKENS.navy : '#cfcfc8',
        transform: hover && cell.count ? 'scale(1.05)' : 'scale(1)',
        boxShadow: hover && cell.count ? '0 6px 16px rgba(10,61,98,0.18)' : 'none',
        transition: 'all 150ms ease',
        position: 'relative',
        zIndex: hover ? 5 : 1,
      }}
    >
      <span className="font-mono-num" style={{ fontSize: 18, fontWeight: 700 }}>
        {cell.count || ''}
      </span>
    </div>
  )
}

function Legend({ maxIntensity }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
      <span style={{ fontSize: 11, color: TOKENS.subtle }}>Lower severity</span>
      <div
        style={{
          width: 180,
          height: 10,
          borderRadius: 6,
          background: `linear-gradient(90deg, ${heatColor(0.05)}, ${heatColor(1)})`,
          border: '1px solid rgba(10,61,98,0.12)',
        }}
      />
      <span style={{ fontSize: 11, color: TOKENS.subtle }}>Higher severity</span>
      <span className="font-mono-num" style={{ fontSize: 11, color: TOKENS.subtle, marginLeft: 8 }}>
        max {maxIntensity}
      </span>
    </div>
  )
}

function ComponentBar({ comp, max, onClick }) {
  const [hover, setHover] = useState(false)
  const pct = (comp.count / max) * 100
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
    >
      <div
        style={{
          width: 230,
          fontSize: 12.5,
          color: '#333',
          fontWeight: hover ? 600 : 500,
          textAlign: 'right',
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={comp.name}
      >
        {comp.name}
      </div>
      <div style={{ flex: 1, background: '#F1F1EC', borderRadius: 4, height: 22, position: 'relative' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            background: hover ? '#0d4f7d' : TOKENS.navy,
            transition: 'all 200ms ease',
            minWidth: 22,
          }}
        />
      </div>
      <span
        className="font-mono-num"
        style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700, color: TOKENS.navy }}
      >
        {comp.count}
      </span>
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section
      style={{
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: 20,
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
      }}
    >
      <h2 className="font-serif-head" style={{ fontSize: 20, margin: 0, color: TOKENS.navy }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '4px 0 18px', fontSize: 12.5, color: TOKENS.subtle }}>{subtitle}</p>
      )}
      {children}
    </section>
  )
}
