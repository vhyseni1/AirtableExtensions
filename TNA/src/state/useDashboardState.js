import { useMemo, useState, useCallback } from 'react'
import rawData from '../data/tna_master.json'
import {
  buildModules,
  buildJourneys,
  buildSankey,
  heatmapMatrix,
  topComponents,
  headlineMetrics,
  priorityCounts,
  journeyOptions,
  DEFAULT_JOURNEY_KEY,
} from '../utils/aggregations.js'
import { PHASE_ORDER } from '../utils/colors.js'

// Build the initial phase -> [moduleId] sequence for a journey from source data.
function initialSequence(journey) {
  const seq = { 'Pre-go-live': [], Concurrent: [], 'Post-go-live': [] }
  if (!journey) return seq
  const sorted = [...journey.modules].sort(
    (a, b) => (a.position || 0) - (b.position || 0),
  )
  for (const m of sorted) {
    const phase = PHASE_ORDER.includes(m.phase) ? m.phase : 'Concurrent'
    seq[phase].push(m.moduleId)
  }
  return seq
}

export function useDashboardState() {
  const rows = rawData

  // Precomputed, memoized aggregations
  const modules = useMemo(() => buildModules(rows), [rows])
  const journeys = useMemo(() => buildJourneys(rows), [rows])
  const sankey = useMemo(() => buildSankey(rows), [rows])
  const heatmap = useMemo(() => heatmapMatrix(rows), [rows])
  const components = useMemo(() => topComponents(rows), [rows])
  const metrics = useMemo(() => headlineMetrics(rows), [rows])
  const priorities = useMemo(() => priorityCounts(rows), [rows])
  const journeyOpts = useMemo(() => journeyOptions(rows), [rows])

  const moduleById = useMemo(() => {
    const map = {}
    for (const m of modules) map[m.moduleId] = m
    return map
  }, [modules])

  // ---- View routing ----
  const [view, setView] = useState('headline') // headline | heatmap | flow | journey | library

  // ---- Detail drawer ----
  const [drawer, setDrawer] = useState(null) // { type, title, rows, meta } | null
  const openDrawer = useCallback((payload) => setDrawer(payload), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])

  // ---- Journey sequencer ----
  const defaultJourneyKey = journeys[DEFAULT_JOURNEY_KEY]
    ? DEFAULT_JOURNEY_KEY
    : journeyOpts[0]?.key
  const [journeyKey, setJourneyKey] = useState(defaultJourneyKey)

  // sequences: { [journeyKey]: { phase: [moduleId] } }
  const [sequences, setSequences] = useState({})

  const currentJourney = journeys[journeyKey]

  const currentSequence = useMemo(() => {
    if (sequences[journeyKey]) return sequences[journeyKey]
    return initialSequence(currentJourney)
  }, [sequences, journeyKey, currentJourney])

  const selectJourney = useCallback((key) => {
    setJourneyKey(key)
  }, [])

  const resetSequence = useCallback(() => {
    setSequences((prev) => {
      const next = { ...prev }
      delete next[journeyKey]
      return next
    })
  }, [journeyKey])

  // Move a module to a target phase at a target index.
  const moveModule = useCallback(
    (moduleId, fromPhase, toPhase, toIndex) => {
      setSequences((prev) => {
        const base = prev[journeyKey] || initialSequence(currentJourney)
        const next = {
          'Pre-go-live': [...base['Pre-go-live']],
          Concurrent: [...base.Concurrent],
          'Post-go-live': [...base['Post-go-live']],
        }
        // remove from source
        const fromArr = next[fromPhase]
        const idx = fromArr.indexOf(moduleId)
        if (idx !== -1) fromArr.splice(idx, 1)
        // insert into target
        const targetArr = next[toPhase]
        let insertAt = toIndex
        if (insertAt == null || insertAt > targetArr.length) insertAt = targetArr.length
        if (insertAt < 0) insertAt = 0
        targetArr.splice(insertAt, 0, moduleId)
        return { ...prev, [journeyKey]: next }
      })
    },
    [journeyKey, currentJourney],
  )

  const isDirty = !!sequences[journeyKey]

  return {
    rows,
    modules,
    moduleById,
    journeys,
    sankey,
    heatmap,
    components,
    metrics,
    priorities,
    journeyOpts,

    view,
    setView,

    drawer,
    openDrawer,
    closeDrawer,

    journeyKey,
    currentJourney,
    currentSequence,
    selectJourney,
    resetSequence,
    moveModule,
    isDirty,
  }
}
