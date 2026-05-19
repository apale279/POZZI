import type { PatientRecord } from '../types/canonical'
import { findCrossDbTargets } from './crossDbLinks'
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

/**
 * Propaga valori compilati sul foglio corrente verso l’altro database
 * (stessa colonna o alias, solo celle ancora vuote).
 */
export function syncCrossDatabaseColumns(
  record: PatientRecord,
  sourceStudy: 'ecmo' | 'acc',
  _sourceSheet: string,
  patch: Record<string, string | number | boolean>,
): PatientRecord {
  if (sourceStudy === 'acc' && !record.ecmo?.attivo) return record
  if (sourceStudy === 'ecmo' && !record.acc?.attivo) return record

  const next: PatientRecord = {
    ...record,
    accSheets: { ...record.accSheets },
    ecmoSheets: { ...record.ecmoSheets },
    updatedAt: new Date().toISOString(),
  }

  const bothActive = !!(record.acc?.attivo && record.ecmo?.attivo)

  for (const [column, value] of Object.entries(patch)) {
    if (isEmpty(value)) continue

    const targets = findCrossDbTargets(sourceStudy, _sourceSheet, column, bothActive)
    for (const t of targets) {
      if (t.study === 'acc') {
        next.accSheets = next.accSheets ?? {}
        const cur = next.accSheets[t.sheet] ?? {}
        if (!isEmpty(cur[t.column])) continue
        next.accSheets[t.sheet] = { ...cur, [t.column]: value }
      } else {
        next.ecmoSheets = next.ecmoSheets ?? {}
        const cur = next.ecmoSheets[t.sheet] ?? {}
        if (!isEmpty(cur[t.column])) continue
        next.ecmoSheets[t.sheet] = { ...cur, [t.column]: value }
      }
    }
  }

  return next
}
