import { PRIORITY_WEIGHT } from './colors.js'

// ---------------------------------------------------------------------------
// Generic group-by / count-by / sum-by helpers
// ---------------------------------------------------------------------------

export function groupBy(rows, key) {
  const out = {}
  for (const row of rows) {
    const k = typeof key === 'function' ? key(row) : row[key]
    if (!out[k]) out[k] = []
    out[k].push(row)
  }
  return out
}

export function countBy(rows, key) {
  const out = {}
  for (const row of rows) {
    const k = typeof key === 'function' ? key(row) : row[key]
    out[k] = (out[k] || 0) + 1
  }
  return out
}

export function sumBy(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
}

export function distinct(rows, key) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const k = typeof key === 'function' ? key(row) : row[key]
    if (!seen.has(k)) {
      seen.add(k)
      out.push(row)
    }
  }
  return out
}

export function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((r) => r[key]).filter((v) => v !== '' && v != null)))
}

export function parsePipes(value) {
  if (!value) return []
  return String(value)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseTags(value) {
  return parsePipes(value)
}

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

// The canonical 8 pillars (heatmap columns). Data uses a subset of these.
export const CATEGORY_COLUMNS = [
  'Process & Workflow',
  'Technology & Integration',
  'Data Ownership & Integrity',
  'Analytics & Measurements',
  'Roles & Responsibilities',
  'Skill & Capability',
  'Mindset & Cultural Sentiment',
  'Engagement & Communication',
]

// Hardcoded upstream-context figures (per build spec).
export const UPSTREAM_CIA_IMPACTS = 51
export const CRITICAL_PATH_WEEKS = 14

// ---------------------------------------------------------------------------
// Headline figures
// ---------------------------------------------------------------------------

export function headlineMetrics(rows) {
  const modules = distinct(rows, 'Module_ID')
  const totalTrainingHours = sumBy(modules, 'Module_Total_Hours')
  return {
    ciaImpacts: UPSTREAM_CIA_IMPACTS,
    trainingNeeds: rows.length,
    learningModules: modules.length,
    personaJourneys: uniqueValues(rows, 'Persona').length,
    totalTrainingHours,
    criticalPathWeeks: CRITICAL_PATH_WEEKS,
  }
}

export function priorityCounts(rows) {
  return countBy(rows, 'Priority')
}

// ---------------------------------------------------------------------------
// CIA Heatmap: Persona (rows) x Change Category (cols)
// ---------------------------------------------------------------------------

export function personasInData(rows) {
  // Preserve a stable, sensible order.
  const order = [
    'Primary Point of Contact',
    'Scientific Expert',
    'BI & Analytics',
    'Digital',
    'Admin',
    'Market Access',
    'Compliance',
  ]
  const present = new Set(rows.map((r) => r.Persona))
  return order.filter((p) => present.has(p))
}

export function heatmapMatrix(rows) {
  const personas = personasInData(rows)
  const cells = {}
  let maxIntensity = 0
  for (const persona of personas) {
    cells[persona] = {}
    for (const cat of CATEGORY_COLUMNS) {
      const matching = rows.filter((r) => r.Persona === persona && r.Change_Category === cat)
      const count = matching.length
      const intensity = matching.reduce(
        (acc, r) => acc + (PRIORITY_WEIGHT[r.Priority] || 0),
        0,
      )
      cells[persona][cat] = { count, intensity, rows: matching }
      if (intensity > maxIntensity) maxIntensity = intensity
    }
  }
  return { personas, categories: CATEGORY_COLUMNS, cells, maxIntensity }
}

export function topComponents(rows, limit = 8) {
  const counts = countBy(rows, 'Change_Component')
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Module Library
// ---------------------------------------------------------------------------

export function buildModules(rows) {
  const byModule = groupBy(rows, 'Module_ID')
  return Object.entries(byModule).map(([moduleId, moduleRows]) => {
    const first = moduleRows[0]
    const personas = uniqueValues(moduleRows, 'Persona')
    return {
      moduleId,
      name: first.Module_Name,
      component: first.Change_Component,
      totalHours: first.Module_Total_Hours,
      deliveryMethod: first.Module_Delivery_Method,
      rolesCovered: parsePipes(first.Module_Roles_Covered),
      tnaCount: first.Module_TNA_Count,
      priority: first.Module_Priority,
      sequencing: first.Module_Sequencing,
      prerequisites: first.Module_Prerequisites,
      personas,
      primaryPersona: first.Persona,
      personaColor: first.Persona_Color,
      rows: moduleRows,
    }
  })
}

// ---------------------------------------------------------------------------
// TNA Flow Sankey
// ---------------------------------------------------------------------------

export function buildSankey(rows) {
  // Left nodes: Change Category groups
  const catCounts = countBy(rows, 'Change_Category')
  const categoryNodes = Object.entries(catCounts)
    .map(([name, count]) => ({ id: `cat:${name}`, label: name, count }))
    .sort((a, b) => b.count - a.count)

  // Middle nodes: Persona groups
  const personaCounts = countBy(rows, 'Persona')
  const personaNodes = personasInData(rows).map((name) => ({
    id: `persona:${name}`,
    label: name,
    count: personaCounts[name] || 0,
    color: rows.find((r) => r.Persona === name)?.Persona_Color,
  }))

  // Right nodes: Modules (sized by Module_Total_Hours)
  const modules = buildModules(rows)
  const moduleNodes = modules
    .map((m) => ({
      id: `module:${m.moduleId}`,
      label: m.name,
      hours: m.totalHours,
      priority: m.priority,
      personaColor: m.personaColor,
      count: m.rows.length,
    }))
    .sort((a, b) => b.hours - a.hours)

  // Links category -> persona (weight = row count)
  const catPersona = {}
  for (const r of rows) {
    const k = `cat:${r.Change_Category}__persona:${r.Persona}`
    catPersona[k] = (catPersona[k] || 0) + 1
  }
  const catPersonaLinks = Object.entries(catPersona).map(([k, weight]) => {
    const [source, target] = k.split('__')
    return { source, target, weight }
  })

  // Links persona -> module (weight = estimated hours)
  const personaModule = {}
  for (const r of rows) {
    const k = `persona:${r.Persona}__module:${r.Module_ID}`
    personaModule[k] = (personaModule[k] || 0) + (Number(r.Estimated_Hours) || 0)
  }
  const personaModuleLinks = Object.entries(personaModule).map(([k, weight]) => {
    const [source, target] = k.split('__')
    return { source, target, weight }
  })

  return { categoryNodes, personaNodes, moduleNodes, catPersonaLinks, personaModuleLinks, rows }
}

// Return the set of node ids on the full lineage path through a given node.
export function lineageForNode(sankey, nodeId) {
  const active = new Set([nodeId])
  const [type, value] = splitNodeId(nodeId)

  for (const r of sankey.rows) {
    const cat = `cat:${r.Change_Category}`
    const persona = `persona:${r.Persona}`
    const mod = `module:${r.Module_ID}`
    let match = false
    if (type === 'cat' && r.Change_Category === value) match = true
    if (type === 'persona' && r.Persona === value) match = true
    if (type === 'module' && r.Module_ID === value) match = true
    if (match) {
      active.add(cat)
      active.add(persona)
      active.add(mod)
    }
  }
  return active
}

function splitNodeId(nodeId) {
  const idx = nodeId.indexOf(':')
  return [nodeId.slice(0, idx), nodeId.slice(idx + 1)]
}

// Rows feeding a given sankey node (for the detail drawer).
export function rowsForNode(rows, nodeId) {
  const idx = nodeId.indexOf(':')
  const type = nodeId.slice(0, idx)
  const value = nodeId.slice(idx + 1)
  return rows.filter((r) => {
    if (type === 'cat') return r.Change_Category === value
    if (type === 'persona') return r.Persona === value
    if (type === 'module') return r.Module_ID === value
    return false
  })
}

// ---------------------------------------------------------------------------
// Learning Journeys
// ---------------------------------------------------------------------------

export function buildJourneys(rows) {
  const byJourney = groupBy(rows, (r) => `${r.Journey_Persona}__${r.Journey_Affiliate}`)
  const journeys = {}
  for (const [key, jRows] of Object.entries(byJourney)) {
    const [persona, affiliate] = key.split('__')
    const first = jRows[0]
    // Distinct modules within this journey
    const moduleMap = groupBy(jRows, 'Module_ID')
    const modules = Object.entries(moduleMap).map(([moduleId, mRows]) => {
      const f = mRows[0]
      return {
        moduleId,
        name: f.Module_Name,
        component: f.Change_Component,
        hours: f.Module_Total_Hours,
        format: f.Format,
        deliveryMethod: f.Module_Delivery_Method,
        priority: f.Module_Priority,
        persona: f.Persona,
        personaColor: f.Persona_Color,
        phase: f.Journey_Phase,
        position: f.Position_In_Phase,
        tnaCount: mRows.length,
        rows: mRows,
      }
    })
    journeys[key] = {
      key,
      persona,
      affiliate,
      totalHours: first.Journey_Total_Hours,
      timelineWeeks: first.Journey_Timeline_Weeks,
      modulesCount: first.Journey_Modules_Count,
      personaColor: first.Persona_Color,
      modules,
    }
  }
  return journeys
}

export function journeyOptions(rows) {
  const byJourney = groupBy(rows, (r) => `${r.Journey_Persona}__${r.Journey_Affiliate}`)
  return Object.keys(byJourney)
    .map((key) => {
      const [persona, affiliate] = key.split('__')
      return { key, persona, affiliate, label: `${persona} × ${affiliate}` }
    })
    .sort((a, b) => a.persona.localeCompare(b.persona))
}

export const DEFAULT_JOURNEY_KEY = 'Primary Point of Contact__Global'
