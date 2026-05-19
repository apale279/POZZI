import type { PatientRecord } from '../types/canonical'
import type { IngestTarget, SheetCompletion } from '../types/ingest'
import { INGEST_TARGETS } from './ingestConfig'
import { filterSheetColumns } from './sheetColumns'
import { getSheetSchema } from './sheetSchema'

function sheetData(
  record: PatientRecord,
  study: 'ecmo' | 'acc',
  sheet: string,
): Record<string, string | number | boolean> | undefined {
  return study === 'acc' ? record.accSheets?.[sheet] : record.ecmoSheets?.[sheet]
}

function isFilled(v: unknown): boolean {
  return v !== undefined && v !== null && v !== ''
}

export function getSheetColumnsList(study: 'ecmo' | 'acc', sheet: string): string[] {
  return filterSheetColumns(getSheetSchema()[study][sheet] ?? [])
}

export function computeSheetCompletion(
  record: PatientRecord,
  target: IngestTarget,
): SheetCompletion {
  const cols = getSheetColumnsList(target.study, target.sheet)
  const data = sheetData(record, target.study, target.sheet) ?? {}
  const missing: string[] = []
  let filled = 0
  for (const col of cols) {
    if (isFilled(data[col])) filled++
    else missing.push(col)
  }
  const total = cols.length
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100)
  return {
    targetId: target.id,
    label: target.label,
    study: target.study,
    sheet: target.sheet,
    totalFields: total,
    filledFields: filled,
    percent,
    missingColumns: missing,
  }
}

/** Completamento per tutti i target applicabili al paziente. */
export function computeAllCompletions(record: PatientRecord): SheetCompletion[] {
  return INGEST_TARGETS.filter((t) => {
    if (t.requiresBothStudies && !(record.acc?.attivo && record.ecmo?.attivo)) return false
    if (t.study === 'acc' && !record.acc?.attivo) return false
    if (t.study === 'ecmo' && !record.ecmo?.attivo) return false
    return true
  }).map((t) => computeSheetCompletion(record, t))
}

export function overallCompletion(completions: SheetCompletion[]): number {
  if (!completions.length) return 0
  const sum = completions.reduce((a, c) => a + c.percent, 0)
  return Math.round(sum / completions.length)
}
