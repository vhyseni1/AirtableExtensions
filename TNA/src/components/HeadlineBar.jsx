import { useState } from 'react'
import { TOKENS } from '../utils/colors.js'

export default function HeadlineBar({ state, full = false, compact = false }) {
  const { metrics, setView } = state

  const tiles = [
    { label: 'Total CIA Impacts', value: metrics.ciaImpacts, accent: '#0A3D62', nav: null, note: 'upstream · CIA Control Tower' },
    { label: 'Training Needs Derived', value: metrics.trainingNeeds, accent: '#2C5F8D', nav: 'flow' },
    { label: 'Learning Modules', value: metrics.learningModules, accent: '#1A8A8F', nav: 'library' },
    { label: 'Persona Journeys', value: metrics.personaJourneys, accent: '#8B5A3C', nav: 'journey' },
    { label: 'Total Training Hours', value: metrics.totalTrainingHours, accent: '#A65D3D', nav: null },
    { label: 'Critical Path Weeks', value: metrics.criticalPathWeeks, accent: '#6B3F5E', nav: null },
  ]

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {tiles.map((t) => (
          <CompactTile key={t.label} tile={t} onClick={() => t.nav && setView(t.nav)} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: full ? 24 : 0 }}>
      {full && (
        <div style={{ marginBottom: 18 }}>
          <h1
            className="font-serif-head"
            style={{ fontSize: 32, margin: 0, color: TOKENS.navy, fontWeight: 600 }}
          >
            Training Needs Analysis
          </h1>
          <p style={{ margin: '4px 0 0', color: TOKENS.subtle, fontSize: 14 }}>
            From CIA Impact to Learning Journey — the full lineage, end to end.
          </p>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        {tiles.map((t) => (
          <KpiTile key={t.label} tile={t} onClick={() => t.nav && setView(t.nav)} />
        ))}
      </div>
    </div>
  )
}

function KpiTile({ tile, onClick }) {
  const [hover, setHover] = useState(false)
  const clickable = !!tile.nav
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
        padding: '18px 16px 16px 20px',
        boxShadow: hover ? '0 8px 24px rgba(10,61,98,0.12)' : '0 2px 12px rgba(10,61,98,0.06)',
        cursor: clickable ? 'pointer' : 'default',
        transform: hover ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 200ms ease',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: tile.accent,
        }}
      />
      <div
        className="font-mono-num"
        style={{ fontSize: 36, fontWeight: 700, color: TOKENS.navy, lineHeight: 1 }}
      >
        {tile.value}
      </div>
      <div
        className="font-serif-head"
        style={{ marginTop: 8, fontStyle: 'italic', fontSize: 14, color: '#333' }}
      >
        {tile.label}
      </div>
      {tile.note && (
        <div style={{ marginTop: 3, fontSize: 11, color: TOKENS.subtle }}>{tile.note}</div>
      )}
    </div>
  )
}

function CompactTile({ tile, onClick }) {
  const [hover, setHover] = useState(false)
  const clickable = !!tile.nav
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
        padding: '8px 14px 8px 16px',
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
        cursor: clickable ? 'pointer' : 'default',
        transform: hover && clickable ? 'translateY(-2px)' : 'none',
        transition: 'all 200ms ease',
        minWidth: 150,
        flex: '1 1 0',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tile.accent }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="font-mono-num" style={{ fontSize: 22, fontWeight: 700, color: TOKENS.navy }}>
          {tile.value}
        </span>
        <span style={{ fontSize: 11.5, color: TOKENS.subtle, fontWeight: 500 }}>{tile.label}</span>
      </div>
    </div>
  )
}
