import { formatCellValueForUi, type SheetCellValue } from './cellValueFormat'

/** Unità di misura da rimuovere in export numerico (solo export, non in tabella). */
const UNIT_SUFFIX =
  /\s*(?:mm\s*hg|mmhg|cmh2o|kpa|bpm|\/min|l\/min|ml\/min|ml\/kg\/min|mg\/dl|g\/dl|mg\/l|g\/l|mmol\/l|meq\/l|mEq\/l|iu\/l|ui\/l|u\/l|ng\/ml|pg\/ml|μg\/dl|ug\/dl|μmol\/l|umol\/l|mm\/s|cm|mm|kg|g|ml|mL|l|L|°c|ºc|percento|%)\s*$/i

const UNIT_ANYWHERE =
  /\s+(?:mm\s*hg|mmhg|cmh2o|kpa|bpm|mg\/dl|g\/dl|mmol\/l|meq\/l|iu\/l|ng\/ml|pg\/ml|ml\/min|l\/min)\b/gi

/** Valore per incolla in Excel: TRUE/FALSE, numeri senza unità. */
export function formatValueForExcelExport(val: SheetCellValue | undefined): string {
  if (val === undefined || val === null || val === '') return ''
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val)
    const s = String(val)
    return s.includes('.') ? s.replace(/\.?0+$/, '') || s : s
  }

  let s = String(val).trim()
  const ui = formatCellValueForUi(val)
  if (ui === 'TRUE' || ui === 'FALSE') return ui

  s = s.replace(UNIT_ANYWHERE, '').replace(UNIT_SUFFIX, '').trim()

  const numMatch = s.match(/^(-?\d+(?:[.,]\d+)?)/)
  if (numMatch) {
    const n = Number(numMatch[1].replace(',', '.'))
    if (Number.isFinite(n)) {
      if (Number.isInteger(n)) return String(n)
      return String(n)
    }
  }

  return s
}
