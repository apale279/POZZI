/** Valori sì/no come nel DB Excel (TRUE / FALSE), non 0 / 1. */

export type SheetCellValue = string | number | boolean

export function isYesNoLiteral(v: unknown): boolean {
  if (typeof v === 'boolean') return true
  if (typeof v === 'number') return v === 0 || v === 1
  if (typeof v !== 'string') return false
  const s = v.trim().toLowerCase()
  return (
    s === 'true' ||
    s === 'false' ||
    s === '0' ||
    s === '1' ||
    s === 'sì' ||
    s === 'si' ||
    s === 'no' ||
    s === 'yes' ||
    s === 'y' ||
    s === 'n'
  )
}

/** Normalizza in booleano per salvataggio (Firestore / record). */
export function normalizeYesNoCellValue(
  val: string | number | boolean | undefined | null,
): SheetCellValue | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') {
    if (val === 0 || val === 1) return val === 1
    return val
  }
  const s = String(val).trim()
  const lower = s.toLowerCase()
  if (['true', 'vero', 'sì', 'si', 'yes', 'y', '1'].includes(lower)) return true
  if (lower === 'x') return true
  if (['false', 'falso', 'no', 'n', '0'].includes(lower)) return false
  const n = Number(s.replace(',', '.'))
  if (Number.isFinite(n) && /^-?\d+([.,]\d+)?$/.test(s)) {
    if (n === 0 || n === 1) return n === 1
    return n
  }
  return s
}

/** Testo in tabella / export TSV (TRUE / FALSE come in Excel). */
export function formatCellValueForUi(val: unknown): string {
  if (val === undefined || val === null || val === '') return ''
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') {
    if (val === 0) return 'FALSE'
    if (val === 1) return 'TRUE'
  }
  const s = String(val).trim()
  const lower = s.toLowerCase()
  if (lower === 'true') return 'TRUE'
  if (lower === 'false') return 'FALSE'
  if (s === '0') return 'FALSE'
  if (s === '1') return 'TRUE'
  return s
}

/** Da input utente o estrazione IA → valore da salvare. */
export function parseCellValueFromUi(input: string): SheetCellValue | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const normalized = normalizeYesNoCellValue(trimmed)
  if (typeof normalized === 'boolean') return normalized
  if (typeof normalized === 'number') return normalized
  return trimmed
}

/** Per mappe proposed: non convertire booleani in 0/1; correggere legacy 0/1. */
export function coerceProposedCellValue(
  val: string | number | boolean | undefined | null,
): SheetCellValue | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (typeof val === 'boolean') return val
  if (typeof val === 'number' && (val === 0 || val === 1)) return val === 1
  if (typeof val === 'string' && isYesNoLiteral(val)) {
    const n = normalizeYesNoCellValue(val)
    if (typeof n === 'boolean') return n
  }
  return val
}
