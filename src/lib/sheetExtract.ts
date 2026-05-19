import { getSheetColumnsList } from './completion'
import { normalizeYesNoCellValue, type SheetCellValue } from './cellValueFormat'
import type { GeminiUncertainField } from './geminiUncertainty'
import { PARSE_COLUMN_MAP } from './ingestConfig'
import { getParseTargetId } from './sheetTargets'
import { cellKey } from './workSession'

function findSheetColumn(sheetCols: string[], name: string): string | undefined {
  if (sheetCols.includes(name)) return name
  const lower = name.toLowerCase()
  return sheetCols.find((c) => c.toLowerCase() === lower)
}

export function sheetContextLabel(study: 'ecmo' | 'acc', sheet: string, ecmoRun?: number): string {
  const prefix = study === 'ecmo' ? 'ECMO' : 'ACC'
  return ecmoRun !== undefined ? `${prefix} → ${sheet} (RUN ${ecmoRun})` : `${prefix} → ${sheet}`
}

/**
 * Unisce columns + chiavi numeriche standard (ph, pao2, …) mappate sul foglio corrente.
 * Gemini spesso riempie solo values; senza questa conversione l’UI non compila celle.
 */
export function combineGeminiExtractColumns(
  study: 'ecmo' | 'acc',
  sheet: string,
  gemini: {
    values?: Record<string, number>
    columns?: Record<string, string | number | boolean | undefined>
  },
): Record<string, string | number | boolean | undefined> {
  const parseId = getParseTargetId(study, sheet)
  const merged: Record<string, string | number | boolean | undefined> = {}

  if (gemini.values) {
    for (const [key, val] of Object.entries(gemini.values)) {
      if (val === undefined || val === null || !Number.isFinite(Number(val))) continue
      const col = PARSE_COLUMN_MAP[key]?.[parseId]
      if (col) merged[col] = Number(val)
    }
  }

  if (gemini.columns) {
    for (const [k, v] of Object.entries(gemini.columns)) {
      if (v === undefined || v === null || v === '') continue
      merged[k] = v
    }
  }

  return merged
}

/** Unisce l’oggetto columns di Gemini nei valori del foglio corrente (solo celle ancora vuote). */
export function mergeGeminiColumnsForSheet(
  study: 'ecmo' | 'acc',
  sheet: string,
  columns: Record<string, string | number | boolean | undefined> | undefined,
  into: Map<string, SheetCellValue>,
  onlyEmpty = true,
): number {
  if (!columns) return 0
  const sheetCols = getSheetColumnsList(study, sheet)
  let count = 0

  for (const [rawCol, val] of Object.entries(columns)) {
    const col = findSheetColumn(sheetCols, rawCol)
    if (!col) continue
    const raw = typeof val === 'string' ? val.trim() : val
    const normalized = normalizeYesNoCellValue(raw)
    if (normalized === undefined) continue
    const key = cellKey(study, sheet, col)
    if (onlyEmpty && into.has(key)) continue
    into.set(key, normalized)
    count++
  }

  return count
}

/** Incertezza IA limitata ai campi effettivamente scritti nel foglio (chiavi work cell). */
export function uncertainFieldsForAppliedKeys(
  study: 'ecmo' | 'acc',
  sheet: string,
  uncertain: GeminiUncertainField[] | undefined,
  appliedKeys: Iterable<string>,
): GeminiUncertainField[] {
  if (!uncertain?.length) return []
  const applied = new Set(appliedKeys)
  const sheetCols = getSheetColumnsList(study, sheet)
  const out: GeminiUncertainField[] = []
  const seen = new Set<string>()

  for (const u of uncertain) {
    const col = findSheetColumn(sheetCols, u.column)
    if (!col) continue
    const key = cellKey(study, sheet, col)
    if (!applied.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ ...u, column: col })
  }
  return out
}
