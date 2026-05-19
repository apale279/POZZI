import type { PatientRecord } from '../types/canonical'
import type { ExtractionPreview, FieldConflict, SheetFieldRow } from '../types/ingest'
import type { CalculatedSuggestion } from './calculatedFields'
import {
  coerceProposedCellValue,
  normalizeYesNoCellValue,
  type SheetCellValue,
} from './cellValueFormat'
import { syncCrossDatabaseColumns } from './crossDbSync'
import { applyRecordOptimizations } from './recordOptimizations'
import { buildExtractionPreview, buildGeminiExtractionPreview } from './extraction'
import { getTargetById } from './ingestConfig'
import { getTargetFieldInfos } from './targetFields'
import { resolveWrites } from './targetWrites'

export function fieldKey(study: 'ecmo' | 'acc', sheet: string, column: string): string {
  return `${study}:${sheet}:${column}`
}

export function buildSheetFieldRows(
  record: PatientRecord,
  targetId: string,
  ecmoRun?: number,
  proposed?: Map<string, SheetCellValue>,
  sources?: Map<string, SheetFieldRow['source']>,
): SheetFieldRow[] {
  const target = getTargetById(targetId)
  if (!target) return []

  const infos = getTargetFieldInfos(record, target)
  const rows: SheetFieldRow[] = []

  for (const info of infos) {
    const study = info.study
    const sheet = info.sheet
    const key = fieldKey(study, sheet, info.column)
    const studyLabel = study === 'ecmo' ? 'ECMO' : 'ACC'
    const current = info.currentValue
    const prop = proposed?.get(key)

    rows.push({
      study: studyLabel,
      studyId: study,
      sheet,
      column: info.column,
      dbTarget: `${studyLabel} → ${sheet} → ${info.column}${ecmoRun ? ` (RUN ${ecmoRun})` : ''}`,
      fromExtraction: info.fromExtraction,
      currentValue: current,
      proposedValue: prop,
      displayValue: prop !== undefined ? prop : current,
      source:
        prop !== undefined
          ? (sources?.get(key) ?? 'extract')
          : current !== undefined
            ? 'existing'
            : 'empty',
      ecmoRun,
    })
  }

  return rows
}

export function mergeAppliedSuggestions(
  applied: CalculatedSuggestion[],
  targetId: string,
  proposed: Map<string, SheetCellValue>,
  sources?: Map<string, SheetFieldRow['source']>,
): CalculatedSuggestion[] {
  const target = getTargetById(targetId)
  if (!target) return []

  const sheets = new Set(resolveWrites(target).map((w) => `${w.study}:${w.sheet}`))
  const forTarget: CalculatedSuggestion[] = []

  for (const s of applied) {
    if (!sheets.has(`${s.study}:${s.sheet}`)) continue
    const key = fieldKey(s.study, s.sheet, s.column)
    proposed.set(key, s.value)
    sources?.set(key, 'calculated')
    forTarget.push(s)
  }
  return forTarget
}

export function applyCalculatedToProposed(
  record: PatientRecord,
  targetId: string,
  proposed: Map<string, SheetCellValue>,
  onlyEmpty = true,
): CalculatedSuggestion[] {
  const { applied } = applyRecordOptimizations(record, { onlyEmpty })
  return mergeAppliedSuggestions(applied, targetId, proposed)
}

/** Valori già nel record per i fogli di questo target → visibili in tabella. */
export function syncRecordValuesToProposed(
  record: PatientRecord,
  targetId: string,
  proposed: Map<string, SheetCellValue>,
  sources?: Map<string, SheetFieldRow['source']>,
): void {
  const target = getTargetById(targetId)
  if (!target) return
  for (const w of resolveWrites(target)) {
    const data = w.study === 'acc' ? record.accSheets?.[w.sheet] : record.ecmoSheets?.[w.sheet]
    if (!data) continue
    for (const [column, val] of Object.entries(data)) {
      if (val === undefined || val === null || val === '') continue
      const key = fieldKey(w.study, w.sheet, column)
      if (!proposed.has(key)) {
        proposed.set(key, coerceProposedCellValue(val) ?? val)
        if (sources && !sources.has(key)) sources.set(key, 'existing')
      }
    }
  }
}

export function mergeIntoProposed(
  record: PatientRecord,
  targetId: string,
  _ecmoRun: number | undefined,
  preview: ExtractionPreview,
  proposed: Map<string, SheetCellValue>,
): FieldConflict[] {
  const conflicts: FieldConflict[] = []
  void targetId

  for (const row of preview.rows) {
    if (row.autoFilled) continue
    const studyId = row.study === 'ECMO' ? 'ecmo' : 'acc'
    const key = fieldKey(studyId, row.sheet, row.column)
    const newVal = row.value

    const data =
      studyId === 'acc'
        ? record.accSheets?.[row.sheet]
        : record.ecmoSheets?.[row.sheet]
    const existing = data?.[row.column] ?? proposed.get(key)

    if (existing !== undefined && existing !== null && existing !== '' && String(existing) !== String(newVal)) {
      conflicts.push({
        key,
        study: row.study,
        sheet: row.sheet,
        column: row.column,
        dbTarget: row.dbTarget,
        existingValue: existing,
        newValue: newVal,
        source: preview.source ?? 'text',
      })
      continue
    }
    const stored = normalizeYesNoCellValue(newVal) ?? newVal
    proposed.set(key, stored)
  }

  return conflicts
}

export function applySheetEdits(
  record: PatientRecord,
  targetId: string,
  values: Map<string, SheetCellValue>,
): PatientRecord {
  const target = getTargetById(targetId)
  if (!target) return record

  const next: PatientRecord = {
    ...record,
    accSheets: { ...record.accSheets },
    ecmoSheets: { ...record.ecmoSheets },
    updatedAt: new Date().toISOString(),
  }

  const patchesBySheet = new Map<string, Record<string, SheetCellValue>>()

  for (const [key, val] of values) {
    const [study, sheet, ...colParts] = key.split(':')
    const column = colParts.join(':')
    if (!study || !sheet || !column) continue
    if (study === 'acc') {
      next.accSheets![sheet] = { ...next.accSheets?.[sheet], [column]: val }
    } else if (study === 'ecmo') {
      next.ecmoSheets![sheet] = { ...next.ecmoSheets?.[sheet], [column]: val }
    }
    const sk = `${study}:${sheet}`
    const patch = patchesBySheet.get(sk) ?? {}
    patch[column] = val
    patchesBySheet.set(sk, patch)
  }

  let synced = next
  for (const [sk, patch] of patchesBySheet) {
    const [study, sheet] = sk.split(':') as ['ecmo' | 'acc', string]
    synced = syncCrossDatabaseColumns(synced, study, sheet, patch)
  }

  return synced
}

export function proposedMapFromRows(rows: SheetFieldRow[]): Map<string, SheetCellValue> {
  const m = new Map<string, SheetCellValue>()
  for (const r of rows) {
    if (r.displayValue !== undefined && r.displayValue !== '') {
      const v = coerceProposedCellValue(r.displayValue) ?? r.displayValue
      m.set(fieldKey(r.studyId, r.sheet, r.column), v)
    }
  }
  return m
}

export function analyzeTextForTarget(
  targetId: string,
  text: string,
  record: PatientRecord,
  ecmoRun?: number,
  source: 'text' | 'gemini' = 'text',
) {
  return buildExtractionPreview(targetId, text, record, ecmoRun, source)
}

export function analyzeGeminiResponseForTarget(
  targetId: string,
  response: { values: Record<string, number>; columns?: Record<string, string | number> },
  record: PatientRecord,
  ecmoRun?: number,
) {
  return buildGeminiExtractionPreview(
    targetId,
    response.values ?? {},
    response.columns,
    record,
    ecmoRun,
  )
}

export function analyzeGeminiValuesForTarget(
  targetId: string,
  values: Record<string, number>,
  record: PatientRecord,
  ecmoRun?: number,
) {
  return analyzeGeminiResponseForTarget(targetId, { values }, record, ecmoRun)
}

export const SHEET_EDITOR_CHANNEL = 'ecmo-acc-sheet-editor'

export interface SheetEditorLaunch {
  patientId: string
  targetId: string
  ecmoRun?: number
}

export function openSheetEditorWindow(launch: SheetEditorLaunch): Window | null {
  const q = new URLSearchParams({
    popup: 'sheet',
    patientId: launch.patientId,
    targetId: launch.targetId,
    ...(launch.ecmoRun ? { ecmoRun: String(launch.ecmoRun) } : {}),
  })
  return window.open(
    `${window.location.origin}${window.location.pathname}?${q}`,
    `sheet-${launch.targetId}-${launch.patientId}`,
    'width=1200,height=900,menubar=no,toolbar=no',
  )
}
