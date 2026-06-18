import { useState } from 'react'
import {
  LayoutGrid,
  Network,
  CalendarRange,
  Grid3x3,
  Info,
  ChevronRight,
} from 'lucide-react'
import { useDashboardState } from '../state/useDashboardState'
import { TOKENS } from '../utils/colors'
import HeadlineBar from './HeadlineBar'
import CIAHeatmap from './CIAHeatmap'
import TNAFlowSankey from './TNAFlowSankey'
import LearningJourneySequencer from './LearningJourneySequencer'
import ModuleLibrary from './ModuleLibrary'
import DetailDrawer from './DetailDrawer'

const NAV = [
  { id: 'heatmap', label: 'CIA Heatmap', icon: LayoutGrid },
  { id: 'flow', label: 'TNA Flow', icon: Network },
  { id: 'journey', label: 'Learning Journey', icon: CalendarRange },
  { id: 'library', label: 'Module Library', icon: Grid3x3 },
  { id: 'about', label: 'About', icon: Info },
]

const VIEW_NAMES = {
  headline: 'Overview',
  heatmap: 'CIA Impacts Heatmap',
  flow: 'TNA Flow',
  journey: 'Learning Journey',
  library: 'Module Library',
  about: 'About',
}

export default function Dashboard() {
  const state = useDashboardState()
  const { view, setView } = state
  const [navExpanded, setNavExpanded] = useState(false)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: TOKENS.paper }}>
      {/* Sidebar */}
      <nav
        onMouseEnter={() => setNavExpanded(true)}
        onMouseLeave={() => setNavExpanded(false)}
        style={{
          width: navExpanded ? 200 : 64,
          flexShrink: 0,
          background: TOKENS.navy,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 200ms ease',
          zIndex: 40,
          boxShadow: '2px 0 16px rgba(10,61,98,0.18)',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
          onClick={() => setView('headline')}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: '#fff',
              color: TOKENS.navy,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              flexShrink: 0,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            E
          </div>
          {navExpanded && (
            <span
              className="font-serif-head"
              style={{ fontSize: 17, whiteSpace: 'nowrap', fontWeight: 600 }}
            >
              ELEVATE
            </span>
          )}
        </div>

        <div style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                title={label}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 20px',
                  border: 'none',
                  background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                  cursor: 'pointer',
                  borderLeft: active ? '3px solid #fff' : '3px solid transparent',
                  transition: 'background 200ms ease, color 200ms ease',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <Icon size={20} style={{ flexShrink: 0 }} />
                {navExpanded && <span>{label}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Breadcrumb */}
        <header
          style={{
            height: 56,
            flexShrink: 0,
            background: '#fff',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: 8,
          }}
        >
          <span
            style={{ fontSize: 13, color: TOKENS.subtle, cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setView('headline')}
          >
            ELEVATE TNA Demo
          </span>
          <ChevronRight size={14} color={TOKENS.subtle} />
          <span style={{ fontSize: 13, color: TOKENS.navy, fontWeight: 600 }}>
            {VIEW_NAMES[view]}
          </span>
          <div style={{ flex: 1 }} />
          <span
            className="font-mono-num"
            style={{ fontSize: 11, color: TOKENS.subtle, letterSpacing: 0.5 }}
          >
            ROCHE · ELEVATE PROGRAM
          </span>
        </header>

        {/* Scrollable content */}
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div key={view} className="view-fade">
            {view === 'headline' && <HeadlineBar state={state} full />}
            {view === 'heatmap' && (
              <>
                <HeadlineBar state={state} compact />
                <CIAHeatmap state={state} />
              </>
            )}
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
      </div>

      {/* Detail drawer (global) */}
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
        ELEVATE TNA Demo
      </h1>
      <p style={{ color: TOKENS.subtle, fontSize: 14, lineHeight: 1.6 }}>
        This dashboard shows how CIA findings translate into Training Needs, Learning Modules,
        and persona-level Learning Journeys for the Roche ELEVATE Program. Every Module traces
        to its TNAs, and every TNA traces to a CIA Impact and a verbatim source quote.
      </p>
      <p style={{ color: TOKENS.subtle, fontSize: 13, lineHeight: 1.6, marginTop: 16 }}>
        Built from a single denormalized table of 29 Training Needs. All figures are derived
        live from the source data; the 51 upstream CIA Impacts figure reflects the wider CIA
        extraction (only the 29 that yielded training needs appear here).
      </p>
    </div>
  )
}
