import type { SheetCellValue } from './cellValueFormat'
import { findCrossDbTargets } from './crossDbLinks'
import { isHiddenSheetColumn } from './sheetColumns'

const STORAGE_KEY = 'pozzi:work-cells'

export function cellKey(study: 'ecmo' | 'acc', sheet: string, column: string): string {
  return `${study}:${sheet}:${column}`
}

export function parseCellKey(key: string): { study: 'ecmo' | 'acc'; sheet: string; column: string } | null {
  const parts = key.split(':')
  if (parts.length < 3) return null
  const study = parts[0]
  if (study !== 'ecmo' && study !== 'acc') return null
  return {
    study,
    sheet: parts.slice(1, -1).join(':'),
    column: parts[parts.length - 1],
  }
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

export function loadWorkCells(): Record<string, SheetCellValue> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, SheetCellValue>
      const cleaned: Record<string, SheetCellValue> = {}
      for (const [key, val] of Object.entries(parsed)) {
        const loc = parseCellKey(key)
        if (loc && isHiddenSheetColumn(loc.column)) continue
        cleaned[key] = val
      }
      return cleaned
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function saveWorkCells(cells: Record<string, SheetCellValue>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cells))
}

export function getWorkCell(
  cells: Record<string, SheetCellValue>,
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
): SheetCellValue | undefined {
  return cells[cellKey(study, sheet, column)]
}

/** Imposta valore e propaga verso l’altro DB se le celle target sono ancora vuote. */
export function setWorkCell(
  cells: Record<string, SheetCellValue>,
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
  value: SheetCellValue | undefined,
  options?: { propagate?: boolean },
): Record<string, SheetCellValue> {
  const next = { ...cells }
  const key = cellKey(study, sheet, column)

  if (value === undefined || value === '') {
    delete next[key]
  } else {
    next[key] = value
  }

  if (options?.propagate === true && !isEmpty(value)) {
    for (const t of findCrossDbTargets(study, sheet, column, true)) {
      const tk = cellKey(t.study, t.sheet, t.column)
      if (isEmpty(next[tk])) next[tk] = value as SheetCellValue
    }
  }

  return next
}

export function clearAllWorkCells(): void {
  localStorage.removeItem(STORAGE_KEY)
}
