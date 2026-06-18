import { LayoutGrid, CalendarRange, Grid3x3, Info, Activity, Target, Users, ArrowRight } from 'lucide-react'
import { useDashboardState } from '../state/useDashboardState'
import { useRecordExpander } from '../state/useAirtableRecords'
import { TOKENS } from '../utils/colors'
import HeadlineBar from './HeadlineBar'
import TNAFlowSankey from './TNAFlowSankey'
import LearningJourneySequencer from './LearningJourneySequencer'
import ModuleLibrary from './ModuleLibrary'
import DetailDrawer from './DetailDrawer'

// CIA Heatmap intentionally omitted from the nav — it lives in the separate,
// already-live CIA Control Tower interface.
const NAV = [
  { id: 'headline', label: 'Overview', icon: LayoutGrid },
  { id: 'journey', label: 'Learning Journey', icon: CalendarRange },
  { id: 'library', label: 'Module Library', icon: Grid3x3 },
  { id: 'about', label: 'About', icon: Info },
]

export default function Dashboard() {
  const state = useDashboardState()
  const { view, setView } = state
  const { expandRow, hasBinding } = useRecordExpander()

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
      {/* Top navigation — sits above Airtable's own interface chrome */}
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
        {/* Brand */}
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

        {/* Tabs */}
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

      {/* Scrollable content */}
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div key={view} className="view-fade">
          {view === 'headline' && (
            <>
              <HeadlineBar state={state} full />
              <NarrativeSteps />
              <TNAFlowSankey state={state} />
            </>
          )}
          {view === 'journey' && <LearningJourneySequencer state={state} />}
          {view === 'library' && <ModuleLibrary state={state} />}
          {view === 'about' && <About />}
        </div>
      </main>

      {/* Detail drawer (global) — offers native Airtable record expand when bound */}
      <DetailDrawer state={state} expandRow={expandRow} hasBinding={hasBinding} />
    </div>
  )
}

const STEPS = [
  {
    n: 1,
    icon: Activity,
    color: '#0A3D62',
    title: 'How you are impacted',
    body: 'CIA change impacts mapped to each persona — what shifts in roles, process, skills and mindset.',
  },
  {
    n: 2,
    icon: Target,
    color: '#1A8A8F',
    title: 'What to focus on',
    body: 'Those impacts translated into prioritised Training Needs and the proficiency gaps to close.',
  },
  {
    n: 3,
    icon: Users,
    color: '#6B3F5E',
    title: 'Who to train, on what',
    body: 'Needs clustered into Learning Modules per persona, ready to sequence into a journey.',
  },
]

function NarrativeSteps() {
  return (
    <div style={{ margin: '0 0 20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        {STEPS.flatMap((s, i) => {
          const items = [<StepCard key={s.n} step={s} />]
          if (i < STEPS.length - 1) {
            items.push(
              <div
                key={`arrow-${s.n}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}
              >
                <ArrowRight size={22} color="#c4c4ba" />
              </div>,
            )
          }
          return items
        })}
      </div>
    </div>
  )
}

function StepCard({ step }) {
  const { icon: Icon, color, title, body, n } = step
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        padding: '16px 18px',
        boxShadow: '0 2px 12px rgba(10,61,98,0.06)',
        borderTop: `3px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}14`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={17} />
        </div>
        <span className="font-mono-num" style={{ fontSize: 12, fontWeight: 700, color }}>
          0{n}
        </span>
        <span className="font-serif-head" style={{ fontSize: 16, color: TOKENS.navy, fontWeight: 600 }}>
          {title}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: TOKENS.subtle, lineHeight: 1.5 }}>{body}</p>
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
