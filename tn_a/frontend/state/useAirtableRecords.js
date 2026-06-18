import { useMemo } from 'react'
import { useBase, useRecords, expandRecord } from '@airtable/blocks/interface/ui'

// ─── Native record binding ────────────────────────────────────────────────
// The dashboard renders from bundled demo data, but when this extension sits
// on an interface whose base contains the source TNA table, clicking a record
// opens Airtable's NATIVE record detail (expandRecord).
//
// Configure which table/fields identify a row. tableName: null ⇒ first table.
// We index by several candidate id fields so a match is found even if the
// table's identifier column is named differently.
const RECORD_SOURCE = {
  tableName: null,
  keyFields: ['Row_ID', 'TNA_ID', 'Impact_ID'],
}

export function useRecordExpander() {
  const base = useBase()
  const table = useMemo(() => {
    if (!base) return null
    if (RECORD_SOURCE.tableName) return base.getTableByNameIfExists(RECORD_SOURCE.tableName)
    return base.tables && base.tables.length ? base.tables[0] : null
  }, [base])

  const records = useRecords(table || null)

  // Only treat the table as "the TNA table" when it actually carries one of our
  // id columns — otherwise an unrelated first table would surface a dead button.
  const keyFields = useMemo(() => {
    if (!table) return []
    return RECORD_SOURCE.keyFields
      .map((name) => table.getFieldByNameIfExists(name))
      .filter(Boolean)
  }, [table])

  const recordMap = useMemo(() => {
    const map = {}
    if (!records || !keyFields.length) return map
    for (const rec of records) {
      for (const field of keyFields) {
        let key
        try {
          key = rec.getCellValueAsString(field)
        } catch {
          key = null
        }
        if (key) map[key] = rec
      }
    }
    return map
  }, [records, keyFields])

  const hasBinding = keyFields.length > 0

  const expandRow = (row) => {
    if (!row) return false
    const rec =
      recordMap[row.Row_ID] || recordMap[row.TNA_ID] || recordMap[row.Impact_ID]
    if (rec) {
      expandRecord(rec)
      return true
    }
    return false
  }

  return { expandRow, hasBinding }
}
