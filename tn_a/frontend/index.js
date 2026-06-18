import { initializeBlock } from '@airtable/blocks/interface/ui'
import './style.css'
import Dashboard from './components/Dashboard'

// ELEVATE TNA Dashboard — a self-contained demo interface extension.
// It renders entirely from a bundled denormalized table (frontend/data.js)
// and does not read from the host base, so it runs in any interface.
initializeBlock({ interface: () => <Dashboard /> })
