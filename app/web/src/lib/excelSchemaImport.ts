import * as XLSX from 'xlsx'
import { filterSheetColumns } from './sheetColumns'
import type { SheetSchema } from './sheetSchema'

function headerRow(rows: unknown[][]): string[] {
  const first = rows[0]
  if (!Array.isArray(first)) return []
  return filterSheetColumns(
    first.map((c) => String(c ?? '').trim()).filter((c) => c.length > 0),
  )
}

/** Legge i nomi colonna (riga 1) di ogni foglio da un file Excel DB. */
export async function parseWorkbookSchema(file: File): Promise<Record<string, string[]>> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const schema: Record<string, string[]> = {}

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
    const cols = headerRow(rows)
    if (cols.length > 0) schema[sheetName] = cols
  }

  return schema
}

export async function importDbFiles(
  accFile: File | null,
  ecmoFile: File | null,
): Promise<SheetSchema> {
  const result: SheetSchema = { ecmo: {}, acc: {} }
  if (accFile) result.acc = await parseWorkbookSchema(accFile)
  if (ecmoFile) result.ecmo = await parseWorkbookSchema(ecmoFile)
  return result
}

/** Campioni valori (prime righe dati) per aiutare l’IA. */
export async function sampleColumnValues(
  file: File,
  maxRows = 50,
): Promise<Record<string, string[]>> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const samples: Record<string, string[]> = {}

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
    const headers = headerRow(rows)
    for (let c = 0; c < headers.length; c++) {
      const col = headers[c]
      const key = `${sheetName}:${col}`
      const vals: string[] = []
      for (let r = 1; r < Math.min(rows.length, 1 + maxRows); r++) {
        const row = rows[r]
        if (!Array.isArray(row)) continue
        const v = String(row[c] ?? '').trim()
        if (v) vals.push(v)
      }
      if (vals.length) samples[key] = vals
    }
  }
  return samples
}
