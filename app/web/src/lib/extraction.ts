import type { PatientRecord } from '../types/canonical'
import type { DestinationRow, ExtractionPreview } from '../types/ingest'
import { normalizeYesNoCellValue } from './cellValueFormat'
import { getSheetColumnsList } from './completion'
import { getTargetById, PARSE_COLUMN_MAP, PARSE_KEY_LABELS } from './ingestConfig'
import { parseClinicalText } from './textParse'
import { resolveWrites, type ResolvedWrite } from './targetWrites'

function findSheetColumn(sheetCols: string[], name: string): string | undefined {
  if (sheetCols.includes(name)) return name
  const lower = name.toLowerCase()
  return sheetCols.find((c) => c.toLowerCase() === lower)
}

export function buildExtractionPreview(
  targetId: string,
  text: string,
  record: PatientRecord,
  ecmoRun?: number,
  source: 'text' | 'gemini' = 'text',
): ExtractionPreview | { error: string } {
  const target = getTargetById(targetId)
  if (!target) return { error: 'Seleziona cosa stai estraendo.' }

  if (target.requiresRun && (ecmoRun === undefined || ecmoRun < 1)) {
    return { error: 'Seleziona il numero RUN ECMO (1, 2, …).' }
  }

  if (target.requiresBothStudies && !(record.acc?.attivo && record.ecmo?.attivo)) {
    return { error: 'Questa valutazione richiede paziente in ACC e ECMO.' }
  }
  if (target.study === 'acc' && !record.acc?.attivo) {
    return { error: 'Paziente non arruolato in ACC.' }
  }
  if (target.study === 'ecmo' && !record.ecmo?.attivo) {
    return { error: 'Paziente non arruolato in ECMO.' }
  }

  const { values, matched } = parseClinicalText(text)
  const rows: DestinationRow[] = []
  const writes = resolveWrites(target)

  for (const w of writes) {
    const run = w.requiresRun ? ecmoRun : undefined
    const studyLabel = w.study === 'ecmo' ? 'ECMO' : 'ACC'
    appendIdentity(rows, record, w, studyLabel, run)
    appendParsed(rows, values, w, studyLabel, run)
  }

  const unmatched =
    matched.length === 0
      ? 'Nessun parametro riconosciuto. Prova etichette pH, PaO2, Lattato o usa analisi IA da screenshot.'
      : undefined

  return {
    targetId,
    targetLabel: target.label,
    ecmoRun,
    rows,
    unmatchedText: unmatched,
    source,
  }
}

function appendIdentity(
  rows: DestinationRow[],
  record: PatientRecord,
  w: ResolvedWrite,
  studyLabel: 'ECMO' | 'ACC',
  ecmoRun?: number,
) {
  const push = (param: string, col: string, val: string | number) => {
    rows.push({
      parameter: param,
      parseKey: `_id_${col}`,
      value: val,
      study: studyLabel,
      sheet: w.sheet,
      column: col,
      dbTarget: formatDbTarget(studyLabel, w.sheet, col, ecmoRun),
      ecmoRun,
      autoFilled: true,
    })
  }
  if (w.study === 'ecmo' && ecmoRun !== undefined) {
    push('RUN ECMO', 'RUN', ecmoRun)
  }
  if (w.study === 'ecmo' && record.ecmo?.numeroElso) {
    rows.push({
      parameter: 'N. ELSO',
      parseKey: '_elso',
      value: record.ecmo.numeroElso,
      study: 'ECMO',
      sheet: w.sheet,
      column: 'ELSO',
      dbTarget: formatDbTarget('ECMO', w.sheet, 'ELSO', ecmoRun),
      ecmoRun,
      autoFilled: true,
    })
  }
}

function appendParsed(
  rows: DestinationRow[],
  values: Record<string, string | number>,
  w: ResolvedWrite,
  studyLabel: 'ECMO' | 'ACC',
  ecmoRun?: number,
) {
  for (const [parseKey, numVal] of Object.entries(values)) {
    const col = PARSE_COLUMN_MAP[parseKey]?.[w.parseTargetId]
    if (!col) continue
    const label = PARSE_KEY_LABELS[parseKey] ?? parseKey
    rows.push({
      parameter: label,
      parseKey,
      value: numVal,
      study: studyLabel,
      sheet: w.sheet,
      column: col,
      dbTarget: formatDbTarget(studyLabel, w.sheet, col, ecmoRun),
      ecmoRun,
    })
  }
}

function formatDbTarget(
  study: 'ECMO' | 'ACC',
  sheet: string,
  column: string,
  ecmoRun?: number,
): string {
  const base = `${study} → ${sheet} → ${column}`
  return ecmoRun !== undefined ? `${base}  (RUN = ${ecmoRun})` : base
}

export function applyExtractionToRecord(
  record: PatientRecord,
  preview: ExtractionPreview,
): PatientRecord {
  const target = getTargetById(preview.targetId)!
  const next: PatientRecord = {
    ...record,
    accSheets: { ...record.accSheets },
    ecmoSheets: { ...record.ecmoSheets },
    updatedAt: new Date().toISOString(),
  }

  const writes = resolveWrites(target)

  for (const w of writes) {
    const patch: Record<string, string | number | boolean> = {
      ...(w.study === 'acc'
        ? next.accSheets?.[w.sheet]
        : next.ecmoSheets?.[w.sheet]),
    }

    for (const row of preview.rows) {
      if (row.sheet !== w.sheet) continue
      if (row.study !== (w.study === 'ecmo' ? 'ECMO' : 'ACC')) continue
      if (row.autoFilled && row.parseKey.startsWith('_id_')) continue
      patch[row.column] = normalizeYesNoCellValue(row.value) ?? row.value
    }

    if (w.study === 'acc') {
      next.accSheets![w.sheet] = patch
    } else {
      next.ecmoSheets![w.sheet] = patch
    }
  }

  return next
}

export function appendGeminiColumnsToPreview(
  preview: ExtractionPreview,
  columns: Record<string, string | number>,
  targetId: string,
  ecmoRun?: number,
): ExtractionPreview {
  const target = getTargetById(targetId)
  if (!target) return preview

  const rows = [...preview.rows]
  const seen = new Set(rows.map((r) => `${r.study}:${r.sheet}:${r.column}`))

  for (const w of resolveWrites(target)) {
    const studyLabel = w.study === 'ecmo' ? 'ECMO' : 'ACC'
    const sheetCols = getSheetColumnsList(w.study, w.sheet)
    const run = w.requiresRun ? ecmoRun : undefined

    for (const [rawCol, val] of Object.entries(columns)) {
      const col = findSheetColumn(sheetCols, rawCol)
      if (!col) continue
      const sk = `${studyLabel}:${w.sheet}:${col}`
      if (seen.has(sk)) continue
      seen.add(sk)
      const raw = typeof val === 'string' ? val.trim() : val
      const normalized = normalizeYesNoCellValue(raw)
      if (normalized === undefined) continue
      rows.push({
        parameter: col,
        parseKey: `_gemini_col_${col}`,
        value: normalized,
        study: studyLabel,
        sheet: w.sheet,
        column: col,
        dbTarget: formatDbTarget(studyLabel, w.sheet, col, run),
        ecmoRun: run,
      })
    }
  }

  const hasExtracted = rows.some((r) => !r.autoFilled)
  return {
    ...preview,
    rows,
    unmatchedText: hasExtracted ? undefined : preview.unmatchedText,
    source: 'gemini',
  }
}

export function buildGeminiExtractionPreview(
  targetId: string,
  values: Record<string, number>,
  columns: Record<string, string | number> | undefined,
  record: PatientRecord,
  ecmoRun?: number,
): ExtractionPreview | { error: string } {
  const base = buildExtractionPreview(targetId, valuesToText(values), record, ecmoRun, 'gemini')
  if ('error' in base) return base
  if (columns && Object.keys(columns).length > 0) {
    return appendGeminiColumnsToPreview(base, columns, targetId, ecmoRun)
  }
  return base
}

/** Unisce valori estratti da Gemini nel testo per il parser regex. */
export function valuesToText(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([k, v]) => {
      const label = PARSE_KEY_LABELS[k] ?? k
      return `${label}: ${v}`
    })
    .join('\n')
}
