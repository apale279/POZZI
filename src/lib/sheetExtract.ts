import { getSheetColumnsList } from './completion'
import { normalizeYesNoCellValue, type SheetCellValue } from './cellValueFormat'
import type { GeminiUncertainField } from './geminiUncertainty'
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
