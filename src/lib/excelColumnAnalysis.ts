import * as XLSX from 'xlsx'
import { fieldHintKey } from './fieldHints'
import { filterSheetColumns, isHiddenSheetColumn } from './sheetColumns'

/** Valore da usare in app/export quando il dato non è stato trovato. */
export type AbsentValueConvention = 'empty' | 'false' | 'zero'

export type ColumnConventionEntry = {
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
  convention: AbsentValueConvention
  /** Breve spiegazione per UI */
  reason: string
  stats: {
    rows: number
    empty: number
    trueCount: number
    falseCount: number
    zeroCount: number
    other: number
  }
}

export type ColumnConventionMap = Record<string, ColumnConventionEntry>

const STORAGE_KEY = 'pozzi:column-conventions'

function convKey(study: 'ecmo' | 'acc', sheet: string, column: string): string {
  return fieldHintKey(study, sheet, column)
}

type CellKind = 'empty' | 'true' | 'false' | 'zero' | 'other'

function classifyCell(raw: unknown): CellKind {
  if (raw === undefined || raw === null) return 'empty'
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  if (typeof raw === 'number') {
    if (raw === 0) return 'zero'
    if (raw === 1) return 'true'
    return 'other'
  }
  const s = String(raw).trim()
  if (!s) return 'empty'
  const lower = s.toLowerCase()
  if (lower === 'true' || lower === 'vero' || lower === 'sì' || lower === 'si') return 'true'
  if (lower === 'false' || lower === 'falso' || lower === 'no') return 'false'
  if (/^0([.,]0+)?$/.test(s)) return 'zero'
  return 'other'
}

function inferConvention(
  column: string,
  counts: { rows: number; empty: number; trueCount: number; falseCount: number; zeroCount: number; other: number },
): { convention: AbsentValueConvention; reason: string } {
  const { rows, empty, trueCount, falseCount, zeroCount, other } = counts
  const nonEmpty = rows - empty
  const emptyRatio = rows > 0 ? empty / rows : 1
  const boolN = trueCount + falseCount

  if (rows === 0 || nonEmpty === 0) {
    return { convention: 'empty', reason: 'Nessun dato nelle righe Excel analizzate' }
  }

  if (boolN / nonEmpty >= 0.92) {
    if (emptyRatio >= 0.25) {
      return {
        convention: 'empty',
        reason: `Sì/no (${boolN} valori): spesso lasciato vuoto nel DB (${Math.round(emptyRatio * 100)}% righe vuote)`,
      }
    }
    if (falseCount >= trueCount * 2) {
      return {
        convention: 'false',
        reason: `Sì/no: prevalentemente FALSE quando compilato — assenza dati → FALSE`,
      }
    }
    return {
      convention: 'empty',
      reason: 'Sì/no: in dubbio lasciare vuoto piuttosto che FALSE',
    }
  }

  if (zeroCount / nonEmpty >= 0.88 && other <= 1) {
    return {
      convention: 'zero',
      reason: `Numericamente quasi sempre 0 nel DB (${zeroCount}/${nonEmpty} valori non vuoti)`,
    }
  }

  const u = column.toUpperCase()
  if (
    /^(ACEi|ARB|BETABLOCK|AED|P2Y12|IMMUNOSOP|PRIOR MI|CHF|IRC|DIABETE|COPD|SMOKE|LIVE ALONE|ILLICIT)/.test(
      u,
    ) ||
    u.includes('EXITUS') ||
    u.includes('DONATION')
  ) {
    return {
      convention: 'empty',
      reason: 'Campo clinico sì/no: se non trovato → vuoto (non assumere FALSE)',
    }
  }

  return {
    convention: 'empty',
    reason: 'Valori misti o numeri/testo: se non trovato → vuoto',
  }
}

function analyzeSheet(
  study: 'ecmo' | 'acc',
  sheetName: string,
  rows: unknown[][],
): ColumnConventionEntry[] {
  const headers = filterSheetColumns(
    (rows[0] as unknown[] | undefined)?.map((c) => String(c ?? '').trim()).filter(Boolean) ?? [],
  )
  if (!headers.length) return []

  const out: ColumnConventionEntry[] = []
  const dataRowCount = Math.max(0, rows.length - 1)

  for (let c = 0; c < headers.length; c++) {
    const column = headers[c]
    if (isHiddenSheetColumn(column)) continue

    const counts = {
      rows: dataRowCount,
      empty: 0,
      trueCount: 0,
      falseCount: 0,
      zeroCount: 0,
      other: 0,
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      if (!Array.isArray(row)) continue
      const kind = classifyCell(row[c])
      if (kind === 'empty') counts.empty++
      else if (kind === 'true') counts.trueCount++
      else if (kind === 'false') counts.falseCount++
      else if (kind === 'zero') counts.zeroCount++
      else counts.other++
    }

    const { convention, reason } = inferConvention(column, counts)
    out.push({ study, sheet: sheetName, column, convention, reason, stats: counts })
  }

  return out
}

/** Analizza tutte le righe dati di un file Excel DB. */
export async function analyzeWorkbookConventions(
  file: File,
  study: 'ecmo' | 'acc',
  maxRows = 500,
): Promise<ColumnConventionMap> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const map: ColumnConventionMap = {}

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
    const slice = rows.slice(0, 1 + maxRows)
    for (const entry of analyzeSheet(study, sheetName, slice)) {
      map[convKey(entry.study, entry.sheet, entry.column)] = entry
    }
  }

  return map
}

export function loadColumnConventions(): ColumnConventionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ColumnConventionMap
  } catch {
    /* ignore */
  }
  return {}
}

export function saveColumnConventions(map: ColumnConventionMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function mergeColumnConventions(partial: ColumnConventionMap): ColumnConventionMap {
  const next = { ...loadColumnConventions(), ...partial }
  saveColumnConventions(next)
  return next
}

export function getColumnConvention(
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
): ColumnConventionEntry | undefined {
  return loadColumnConventions()[convKey(study, sheet, column)]
}

export function absentConventionLabel(c: AbsentValueConvention): string {
  switch (c) {
    case 'false':
      return 'FALSE'
    case 'zero':
      return '0'
    default:
      return 'vuoto'
  }
}

export function valueForAbsentConvention(c: AbsentValueConvention): boolean | number | undefined {
  switch (c) {
    case 'false':
      return false
    case 'zero':
      return 0
    default:
      return undefined
  }
}

export function clearColumnConventions(): void {
  localStorage.removeItem(STORAGE_KEY)
}
