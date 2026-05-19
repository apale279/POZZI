import type { PatientRecord } from '../types/canonical'
import type { IngestTarget, TargetFieldInfo } from '../types/ingest'
import { PARSE_COLUMN_MAP, PARSE_KEY_LABELS } from './ingestConfig'
import { getSheetColumnsList } from './completion'
import { resolveWrites } from './targetWrites'

/** Colonne che l'estrazione testo/IA può riempire per questo target. */
export function getExtractableColumns(target: IngestTarget): Map<string, string> {
  const colToLabel = new Map<string, string>()
  const writes = resolveWrites(target)
  for (const w of writes) {
    for (const [parseKey, byTarget] of Object.entries(PARSE_COLUMN_MAP)) {
      const col = byTarget[w.parseTargetId]
      if (col) {
        colToLabel.set(`${w.study}:${w.sheet}:${col}`, PARSE_KEY_LABELS[parseKey] ?? parseKey)
      }
    }
  }
  return colToLabel
}

export function getTargetFieldInfos(
  record: PatientRecord,
  target: IngestTarget,
): TargetFieldInfo[] {
  const extractable = getExtractableColumns(target)
  const writes = resolveWrites(target)
  const seen = new Set<string>()
  const out: TargetFieldInfo[] = []

  for (const w of writes) {
    const cols = getSheetColumnsList(w.study, w.sheet)
    const data =
      w.study === 'acc' ? record.accSheets?.[w.sheet] : record.ecmoSheets?.[w.sheet]

    for (const col of cols) {
      const key = `${w.study}:${w.sheet}:${col}`
      if (seen.has(key)) continue
      seen.add(key)
      const fromExtraction = extractable.has(key)
      const val = data?.[col]
      const alreadyFilled = val !== undefined && val !== null && val !== ''
      out.push({
        study: w.study,
        sheet: w.sheet,
        column: col,
        label: fromExtraction
          ? `${extractable.get(key)} → ${col}`
          : col,
        fromExtraction,
        alreadyFilled,
        currentValue: alreadyFilled ? val : undefined,
      })
    }
  }

  const orderIndex = new Map<string, number>()
  let idx = 0
  for (const w of writes) {
    for (const col of getSheetColumnsList(w.study, w.sheet)) {
      const key = `${w.study}:${w.sheet}:${col}`
      if (!orderIndex.has(key)) orderIndex.set(key, idx++)
    }
  }

  return out.sort((a, b) => {
    const ka = `${a.study}:${a.sheet}:${a.column}`
    const kb = `${b.study}:${b.sheet}:${b.column}`
    const ia = orderIndex.get(ka) ?? 9999
    const ib = orderIndex.get(kb) ?? 9999
    if (ia !== ib) return ia - ib
    if (a.fromExtraction !== b.fromExtraction) return a.fromExtraction ? -1 : 1
    return a.column.localeCompare(b.column)
  })
}
