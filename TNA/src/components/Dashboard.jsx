import { LayoutGrid, Network, CalendarRange, Grid3x3, Info } from 'lucide-react'
import { useDashboardState } from '../state/useDashboardState.js'
import { TOKENS } from '../utils/colors.js'
import HeadlineBar from './HeadlineBar.jsx'
import TNAFlowSankey from './TNAFlowSankey.jsx'
import LearningJourneySequencer from './LearningJourneySequencer.jsx'
import ModuleLibrary from './ModuleLibrary.jsx'
import DetailDrawer from './DetailDrawer.jsx'

// CIA Heatmap intentionally omitted from the nav — it lives in the separate,
// already-live CIA Control Tower interface.
const NAV = [
  { id: 'headline', label: 'Overview', icon: LayoutGrid },
  { id: 'flow', label: 'TNA Flow', icon: Network },
  { id: 'journey', label: 'Learning Journey', icon: CalendarRange },
  { id: 'library', label: 'Module Library', icon: Grid3x3 },
  { id: 'about', label: 'About', icon: Info },
]

export default function Dashboard() {
  const state = useDashboardState()
  const { view, setView } = state

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: TOKENS.paper,
      }}
    >
      {/* Top navigation */}
      <header
        style={{
          flexShrink: 0,
          height: 54,
          background: '#fff',
          borderBottom: `1px solid ${TOKENS.border}`,
          display: 'flex',
          alignItems: 'stretch',
          padding: '0 20px',
          gap: 4,
          boxShadow: '0 1px 0 rgba(10,61,98,0.04)',
          zIndex: 30,
        }}
      >
        <div
          onClick={() => setView('headline')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingRight: 18,
            marginRight: 6,
            borderRight: `1px solid ${TOKENS.border}`,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: TOKENS.navy,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 14,
            }}
          >
            E
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span className="font-serif-head" style={{ fontSize: 16, fontWeight: 600, color: TOKENS.navy }}>
              ELEVATE
            </span>
            <span style={{ fontSize: 9.5, letterSpacing: 1, color: TOKENS.subtle, fontWeight: 600 }}>
              TNA DASHBOARD
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 14px',
                  border: 'none',
                  background: 'transparent',
                  color: active ? TOKENS.navy : TOKENS.subtle,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  fontFamily: 'inherit',
                  borderBottom: active ? `2.5px solid ${TOKENS.navy}` : '2.5px solid transparent',
                  marginBottom: -1,
                  transition: 'color 160ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = TOKENS.navy
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = TOKENS.subtle
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="font-mono-num" style={{ fontSize: 10.5, color: '#9a9a92', letterSpacing: 0.6 }}>
            ROCHE · ELEVATE PROGRAM
          </span>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div key={view} className="view-fade">
          {view === 'headline' && <HeadlineBar state={state} full />}
          {view === 'flow' && (
            <>
              <HeadlineBar state={state} compact />
              <TNAFlowSankey state={state} />
            </>
          )}
          {view === 'journey' && <LearningJourneySequencer state={state} />}
          {view === 'library' && <ModuleLibrary state={state} />}
          {view === 'about' && <About />}
        </div>
      </main>

      <DetailDrawer state={state} />
    </div>
  )
}

function About() {
  return (
    <div
      style={{
        maxWidth: 720,
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: 28,
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
      }}
    >
      <h1 className="font-serif-head" style={{ fontSize: 28, margin: '0 0 8px', color: TOKENS.navy }}>
        ELEVATE TNA Dashboard
      </h1>
      <p style={{ color: TOKENS.subtle, fontSize: 14, lineHeight: 1.6 }}>
        This dashboard shows how CIA findings translate into Training Needs, Learning Modules,
        and persona-level Learning Journeys for the Roche ELEVATE Program. Every Module traces
        to its TNAs, and every TNA traces to a CIA Impact and a verbatim source quote.
      </p>
      <p style={{ color: TOKENS.subtle, fontSize: 13, lineHeight: 1.6, marginTop: 16 }}>
        Built from a single denormalized table of 29 Training Needs. All figures are derived
        live from the source data; the 51 upstream CIA Impacts figure reflects the wider CIA
        extraction (only the 29 that yielded training needs appear here). The CIA Impacts
        heatmap lives in the separate CIA Control Tower interface.
      </p>
    </div>
  )
}
