import { getSheetSchema } from './sheetSchema'
import { getSheetColumnsList } from './completion'

const SHEETS = () => getSheetSchema()

function normCol(c: string): string {
  return c.trim().toUpperCase()
}

/** Colonne equivalenti tra ECMO e ACC (nomi diversi sul foglio). */
export const COLUMN_EQUIVALENTS: string[][] = [
  ['ELSO', 'NUMERO ELSO'],
  ['ECMO LENS'],
  ['PESO'],
  ['ALTEZZA', 'ALTEZZA '],
  ['DN'],
  ['ANNO'],
  ['HB'],
  ['LAC', 'LACTATE'],
  ['GENDER', 'SEX'],
  ['AGE', 'ANNI', 'CALCOLO ETA'],
]

export function equivalentColumns(column: string): Set<string> {
  const n = normCol(column)
  const set = new Set<string>([n])
  for (const group of COLUMN_EQUIVALENTS) {
    if (group.some((g) => normCol(g) === n)) {
      for (const g of group) set.add(normCol(g))
    }
  }
  return set
}

export interface CrossDbTarget {
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
}

function findColumnInSheet(study: 'ecmo' | 'acc', sheet: string, column: string): string | undefined {
  const cols = getSheetColumnsList(study, sheet)
  const equiv = equivalentColumns(column)
  return cols.find((c) => equiv.has(normCol(c)))
}

/** Dove finirà lo stesso valore nell’altro database (tutti i fogli che hanno la colonna). */
export function findCrossDbTargets(
  sourceStudy: 'ecmo' | 'acc',
  _sourceSheet: string,
  column: string,
  _bothStudiesActive?: boolean,
): CrossDbTarget[] {
  void _bothStudiesActive
  const otherStudy = sourceStudy === 'acc' ? 'ecmo' : 'acc'
  const out: CrossDbTarget[] = []
  const seen = new Set<string>()

  for (const sheet of Object.keys(SHEETS()[otherStudy])) {
    const targetCol = findColumnInSheet(otherStudy, sheet, column)
    if (!targetCol) continue
    const sk = `${otherStudy}:${sheet}:${targetCol}`
    if (seen.has(sk)) continue
    seen.add(sk)
    out.push({ study: otherStudy, sheet, column: targetCol })
  }
  return out
}

export function formatCrossDbLabel(t: CrossDbTarget): string {
  const prefix = t.study === 'ecmo' ? 'ECMO' : 'ACC'
  return `${prefix} → ${t.sheet} → ${t.column}`
}
