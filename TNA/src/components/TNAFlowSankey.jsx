import { useMemo, useState } from 'react'
import { TOKENS, personaColor, priorityColor } from '../utils/colors.js'
import { lineageForNode, rowsForNode } from '../utils/aggregations.js'

const COL = {
  leftX: 16,
  leftW: 188,
  midX: 406,
  midW: 188,
  rightX: 792,
  rightW: 196,
  width: 1004,
}

const PAD_TOP = 12
const GAP = 10
const MIN_H = 26

function layoutColumn(nodes, valueKey, height) {
  const total = nodes.reduce((a, n) => a + (n[valueKey] || 0), 0) || 1
  const usable = height - PAD_TOP * 2 - GAP * (nodes.length - 1)
  // Reserve min height for each node, distribute remainder by value.
  const minTotal = MIN_H * nodes.length
  const flex = Math.max(usable - minTotal, 0)
  let y = PAD_TOP
  return nodes.map((n) => {
    const h = MIN_H + flex * ((n[valueKey] || 0) / total)
    const node = { ...n, y, h }
    y += h + GAP
    return node
  })
}

function bezier(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

export default function TNAFlowSankey({ state }) {
  const { sankey, openDrawer, rows } = state
  const [hovered, setHovered] = useState(null)

  const height = Math.max(560, sankey.moduleNodes.length * 30 + 40)

  const cats = useMemo(
    () => layoutColumn(sankey.categoryNodes, 'count', height),
    [sankey, height],
  )
  const personas = useMemo(
    () => layoutColumn(sankey.personaNodes, 'count', height),
    [sankey, height],
  )
  const mods = useMemo(
    () => layoutColumn(sankey.moduleNodes, 'hours', height),
    [sankey, height],
  )

  const posById = useMemo(() => {
    const map = {}
    cats.forEach((n) => (map[n.id] = { ...n, col: 'left' }))
    personas.forEach((n) => (map[n.id] = { ...n, col: 'mid' }))
    mods.forEach((n) => (map[n.id] = { ...n, col: 'right' }))
    return map
  }, [cats, personas, mods])

  const activeSet = useMemo(
    () => (hovered ? lineageForNode(sankey, hovered) : null),
    [hovered, sankey],
  )

  const maxCP = Math.max(...sankey.catPersonaLinks.map((l) => l.weight), 1)
  const maxPM = Math.max(...sankey.personaModuleLinks.map((l) => l.weight), 1)
  const widthFor = (w, max) => 1.5 + (w / max) * 12

  const nodeOpacity = (id) => (!activeSet ? 1 : activeSet.has(id) ? 1 : 0.28)
  const linkOpacity = (s, t) => {
    if (!activeSet) return 0.42
    return activeSet.has(s) && activeSet.has(t) ? 0.85 : 0.08
  }

  const openNode = (id) => {
    const nodeRows = rowsForNode(rows, id)
    const node = posById[id]
    const typeLabel = node.col === 'left' ? 'Change Category' : node.col === 'mid' ? 'Persona' : 'Module'
    openDrawer({
      type: typeLabel,
      title: node.label,
      subtitle: `${nodeRows.length} record${nodeRows.length > 1 ? 's' : ''} on this lineage`,
      accent: node.col === 'mid' ? personaColor(node.label) : node.color || TOKENS.navy,
      rows: nodeRows,
    })
  }

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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="font-serif-head" style={{ fontSize: 20, margin: 0, color: TOKENS.navy }}>
            TNA Flow — CIA Impact → Training Need → Learning Module
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: TOKENS.subtle }}>
            Hover any node to trace its full lineage. Click to open the source records.
          </p>
        </div>
        <ColumnLegend />
      </div>

      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <svg
          viewBox={`0 0 ${COL.width} ${height}`}
          width="100%"
          style={{ minWidth: 880, display: 'block' }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Column headers */}
          <ColHeader x={COL.leftX} w={COL.leftW} label="CIA IMPACT" sub="by category" />
          <ColHeader x={COL.midX} w={COL.midW} label="TRAINING NEED" sub="by persona" />
          <ColHeader x={COL.rightX} w={COL.rightW} label="LEARNING MODULE" sub="by hours" />

          {/* Links: category -> persona */}
          <g>
            {sankey.catPersonaLinks.map((l, i) => {
              const s = posById[l.source]
              const t = posById[l.target]
              if (!s || !t) return null
              return (
                <path
                  key={`cp-${i}`}
                  d={bezier(COL.leftX + COL.leftW, s.y + s.h / 2, COL.midX, t.y + t.h / 2)}
                  stroke={personaColor(t.label)}
                  strokeWidth={widthFor(l.weight, maxCP)}
                  fill="none"
                  opacity={linkOpacity(l.source, l.target)}
                  style={{ transition: 'opacity 200ms ease' }}
                />
              )
            })}
          </g>

          {/* Links: persona -> module */}
          <g>
            {sankey.personaModuleLinks.map((l, i) => {
              const s = posById[l.source]
              const t = posById[l.target]
              if (!s || !t) return null
              return (
                <path
                  key={`pm-${i}`}
                  d={bezier(COL.midX + COL.midW, s.y + s.h / 2, COL.rightX, t.y + t.h / 2)}
                  stroke={personaColor(s.label)}
                  strokeWidth={widthFor(l.weight, maxPM)}
                  fill="none"
                  opacity={linkOpacity(l.source, l.target)}
                  style={{ transition: 'opacity 200ms ease' }}
                />
              )
            })}
          </g>

          {/* Left nodes */}
          {cats.map((n) => (
            <Node
              key={n.id}
              x={COL.leftX}
              w={COL.leftW}
              n={n}
              fill={TOKENS.navy}
              label={n.label}
              badge={n.count}
              align="left"
              opacity={nodeOpacity(n.id)}
              onHover={() => setHovered(n.id)}
              onClick={() => openNode(n.id)}
            />
          ))}

          {/* Middle nodes */}
          {personas.map((n) => (
            <Node
              key={n.id}
              x={COL.midX}
              w={COL.midW}
              n={n}
              fill={personaColor(n.label)}
              label={n.label}
              badge={n.count}
              align="center"
              opacity={nodeOpacity(n.id)}
              onHover={() => setHovered(n.id)}
              onClick={() => openNode(n.id)}
            />
          ))}

          {/* Right nodes */}
          {mods.map((n) => (
            <Node
              key={n.id}
              x={COL.rightX}
              w={COL.rightW}
              n={n}
              fill="#fff"
              stroke={priorityColor(n.priority)}
              textColor="#222"
              label={n.label}
              badge={`${n.hours}h`}
              align="right"
              opacity={nodeOpacity(n.id)}
              onHover={() => setHovered(n.id)}
              onClick={() => openNode(n.id)}
            />
          ))}
        </svg>
      </div>
    </section>
  )
}

function Node({ x, w, n, fill, stroke, textColor, label, badge, align, opacity, onHover, onClick }) {
  const small = n.h < 30
  const tColor = textColor || '#fff'
  return (
    <g
      style={{ cursor: 'pointer', transition: 'opacity 200ms ease' }}
      opacity={opacity}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <rect
        x={x}
        y={n.y}
        width={w}
        height={n.h}
        rx={6}
        fill={fill}
        stroke={stroke || 'rgba(0,0,0,0.06)'}
        strokeWidth={stroke ? 3 : 1}
      />
      <foreignObject x={x + 8} y={n.y} width={w - 16} height={n.h}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: small ? 'row' : 'column',
            alignItems: align === 'center' ? 'center' : 'flex-start',
            justifyContent: 'center',
            gap: small ? 6 : 2,
            textAlign: align === 'center' ? 'center' : 'left',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: tColor,
              lineHeight: 1.15,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {label}
          </span>
          <span
            className="font-mono-num"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: textColor ? '#555' : 'rgba(255,255,255,0.85)',
            }}
          >
            {badge}
          </span>
        </div>
      </foreignObject>
    </g>
  )
}

function ColHeader({ x, w, label, sub }) {
  return (
    <g>
      <text x={x + w / 2} y={10} textAnchor="middle" fontSize="11" fontWeight="700" fill={TOKENS.navy} letterSpacing="0.6">
        {label}
      </text>
    </g>
  )
}

function ColumnLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: TOKENS.subtle, alignItems: 'center' }}>
      <LegendDot color={TOKENS.navy} label="Category" />
      <LegendDot color="#1A8A8F" label="Persona" />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: '#fff', border: `3px solid ${priorityColor('Critical')}` }} />
        Module (border = priority)
      </span>
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
      {label}
    </span>
  )
}
