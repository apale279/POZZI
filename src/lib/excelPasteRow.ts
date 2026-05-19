import { getSheetColumnsList } from './completion'
import type { SheetCellValue } from './cellValueFormat'
import { formatValueForExcelExport } from './excelExportFormat'

function cellText(v: string | number | boolean | undefined): string {
  if (v === undefined || v === null || v === '') return ''
  const s = formatValueForExcelExport(v)
  if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Valori in ordine colonne Excel (separati da tab per incolla in riga). */
export function buildExcelPasteRow(
  study: 'ecmo' | 'acc',
  sheet: string,
  values: Map<string, SheetCellValue> | Record<string, string | number | boolean | undefined>,
  ecmoRun?: number,
): { tsv: string; filled: number; total: number; columns: string[]; cells: string[] } {
  const cols = getSheetColumnsList(study, sheet)
  const get = (col: string): string | number | boolean | undefined => {
    if (col.trim().toUpperCase() === 'RUN' && ecmoRun !== undefined) {
      if (values instanceof Map) {
        const key = `${study}:${sheet}:${col}`
        if (values.has(key)) return values.get(key)
      }
      return ecmoRun
    }
    if (values instanceof Map) {
      const key = `${study}:${sheet}:${col}`
      if (values.has(key)) return values.get(key)
      return values.get(col)
    }
    return values[col]
  }

  const cells = cols.map((col) => cellText(get(col)))
  const filled = cells.filter((c) => c !== '').length
  return { tsv: cells.join('\t'), filled, total: cols.length, columns: cols, cells }
}
