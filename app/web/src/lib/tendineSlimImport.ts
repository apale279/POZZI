import * as XLSX from 'xlsx'
import { getSheetColumnsList } from './completion'
import { fieldHintKey } from './fieldHints'
import { filterSheetColumns } from './sheetColumns'
import { allSheets } from './sheetSchema'

const TENDINE_SHEET_NAMES = ['TENDINE SLIM', 'TENDE SLIM']

function normalizeSheetName(name: string): string {
  return name.trim().toUpperCase()
}

function findTendineSheetName(sheetNames: string[]): string | null {
  for (const candidate of TENDINE_SHEET_NAMES) {
    const found = sheetNames.find((s) => normalizeSheetName(s) === normalizeSheetName(candidate))
    if (found) return found
  }
  return null
}

/** Valori ammessi per colonna dal foglio TENDINE SLIM (riga 1 = intestazioni, sotto = elenco). */
export async function parseTendineSlimAllowedValues(
  file: File,
): Promise<Record<string, string[]>> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = findTendineSheetName(wb.SheetNames)
  if (!sheetName) return {}

  const ws = wb.Sheets[sheetName]
  if (!ws) return {}

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  const headers = filterSheetColumns(
    (rows[0] as unknown[] | undefined)?.map((c) => String(c ?? '').trim()).filter(Boolean) ?? [],
  )
  if (!headers.length) return {}

  const byColumn = new Map<string, Set<string>>()
  for (const h of headers) byColumn.set(h, new Set())

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < headers.length; c++) {
      const v = String(row[c] ?? '').trim()
      if (!v) continue
      byColumn.get(headers[c])?.add(v)
    }
  }

  const out: Record<string, string[]> = {}
  for (const [col, set] of byColumn) {
    if (set.size) out[col] = [...set].sort((a, b) => a.localeCompare(b, 'it'))
  }
  return out
}

/** Applica valori TENDINE SLIM a tutte le colonne ECMO con lo stesso nome. */
export function applyTendineSlimToEcmoKeys(
  tendineByColumn: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [column, values] of Object.entries(tendineByColumn)) {
    if (!values.length) continue
    for (const sheet of allSheets('ecmo')) {
      if (getSheetColumnsList('ecmo', sheet).includes(column)) {
        out[fieldHintKey('ecmo', sheet, column)] = values
      }
    }
  }
  return out
}
