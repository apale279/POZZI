import type { PatientRecord } from '../types/canonical'
import { getSheetColumnsList } from './completion'

export interface CalculatedSuggestion {
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
  value: string | number
  reason: string
  sourceColumns: string[]
}

const DATE_YEAR_COLUMNS: { column: string; dateKeys: string[] }[] = [
  { column: 'ANNO', dateKeys: ['DATA ARRESTO', 'DATA INGRESSO H', 'DATA INGRESSO ICU', 'START DATE', 'DATA EGA', 'DATA SETTING'] },
]

const BMI_COLUMNS = new Set(['BMI'])
const ETA_COLUMNS = new Set(['CALCOLO ETA', 'ANNI'])

export function parseDateParts(raw: string): { y: number; m: number; d: number } | null {
  const s = raw.trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] }
  const it = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (it) {
    let y = +it[3]
    if (y < 100) y += y > 30 ? 1900 : 2000
    return { y, m: +it[2], d: +it[1] }
  }
  const yonly = s.match(/^(\d{4})$/)
  if (yonly) return { y: +yonly[1], m: 1, d: 1 }
  return null
}

export function ageYears(dn: string, ref: Date): number | null {
  const born = parseDateParts(dn)
  if (!born) return null
  const refY = ref.getFullYear()
  const refM = ref.getMonth() + 1
  const refD = ref.getDate()
  let age = refY - born.y
  if (refM < born.m || (refM === born.m && refD < born.d)) age--
  return age >= 0 && age < 130 ? age : null
}

function sheetData(
  record: PatientRecord,
  study: 'ecmo' | 'acc',
  sheet: string,
): Record<string, string | number | boolean> {
  return (study === 'acc' ? record.accSheets?.[sheet] : record.ecmoSheets?.[sheet]) ?? {}
}

function getVal(data: Record<string, string | number | boolean>, col: string): string | number | undefined {
  const v = data[col]
  if (v === undefined || v === null || v === '') return undefined
  return typeof v === 'boolean' ? (v ? 1 : 0) : v
}

function numVal(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function computeBmi(pesoKg: number, altezzaCm: number): number | null {
  if (pesoKg <= 0 || altezzaCm <= 0) return null
  const m = altezzaCm / 100
  const bmi = pesoKg / (m * m)
  return Math.round(bmi * 10) / 10
}

/** Suggerimenti calcolati per i fogli coinvolti in un target (solo fogli target). */
export function suggestCalculatedFields(
  record: PatientRecord,
  sheets: { study: 'ecmo' | 'acc'; sheet: string }[],
): CalculatedSuggestion[] {
  const out: CalculatedSuggestion[] = []
  const arrestParts = record.acc?.dataArresto ? parseDateParts(record.acc.dataArresto) : null
  const ref = arrestParts
    ? new Date(arrestParts.y, arrestParts.m - 1, arrestParts.d)
    : new Date()

  const dn =
    record.core.dataNascita ||
    getVal(sheetData(record, 'ecmo', 'ANAGRAFICA'), 'DN') ||
    getVal(sheetData(record, 'acc', 'Anagrafica'), 'DN')

  for (const { study, sheet } of sheets) {
    const data = sheetData(record, study, sheet)
    const schemaCols = getSheetColumnsList(study, sheet)
    const cols = [...new Set([...schemaCols, ...Object.keys(data)])]
    const allCols = new Set(cols)

    const peso =
      numVal(getVal(data, 'PESO')) ??
      record.core.pesoKg ??
      numVal(getVal(sheetData(record, 'ecmo', 'ANAGRAFICA'), 'PESO'))
    const altezza =
      numVal(getVal(data, 'ALTEZZA')) ??
      record.core.altezzaCm ??
      numVal(getVal(sheetData(record, 'ecmo', 'ANAGRAFICA'), 'ALTEZZA'))

    if (peso && altezza) {
      for (const col of cols) {
        if (!BMI_COLUMNS.has(col)) continue
        const bmi = computeBmi(peso, altezza)
        if (bmi != null) {
          out.push({
            study,
            sheet,
            column: col,
            value: bmi,
            reason: `BMI = peso / altezza² (${peso} kg, ${altezza} cm)`,
            sourceColumns: ['PESO', 'ALTEZZA'],
          })
        }
      }
    }

    if (dn) {
      const age = ageYears(String(dn), ref)
      if (age != null) {
        for (const col of cols) {
          if (ETA_COLUMNS.has(col)) {
            out.push({
              study,
              sheet,
              column: col,
              value: col === 'ANNI' ? age : age,
              reason: `Età da data di nascita (${dn}) alla data di riferimento`,
              sourceColumns: ['DN'],
            })
          }
        }
      }
    }

    for (const rule of DATE_YEAR_COLUMNS) {
      if (!allCols.has(rule.column) && !cols.includes(rule.column)) {
        const schemaCols = cols.length ? cols : [rule.column]
        if (!schemaCols.includes(rule.column) && sheet !== 'Anagrafica' && sheet !== 'ANAGRAFICA') continue
      }
      for (const dateKey of rule.dateKeys) {
        const dv = getVal(data, dateKey)
        if (dv === undefined) continue
        const parts = parseDateParts(String(dv))
        if (!parts) continue
        if (cols.includes(rule.column) || sheet === 'Anagrafica' || sheet === 'ANAGRAFICA') {
          const existing = getVal(data, rule.column)
          if (existing === undefined || existing === parts.y) {
            out.push({
              study,
              sheet,
              column: rule.column,
              value: parts.y,
              reason: `Anno da ${dateKey}`,
              sourceColumns: [dateKey],
            })
          }
        }
        break
      }
    }

    if (study === 'acc' && record.acc?.dataArresto && cols.includes('ANNO')) {
      const parts = parseDateParts(record.acc.dataArresto)
      if (parts) {
        out.push({
          study,
          sheet,
          column: 'ANNO',
          value: parts.y,
          reason: 'Anno da data arresto (scheda paziente)',
          sourceColumns: ['DATA ARRESTO'],
        })
      }
    }

    if (study === 'ecmo' && record.ecmo?.anno && cols.includes('ANNO')) {
      out.push({
        study,
        sheet,
        column: 'ANNO',
        value: record.ecmo.anno,
        reason: 'Anno ECMO da scheda paziente',
        sourceColumns: [],
      })
    }
  }

  const dedupe = new Map<string, CalculatedSuggestion>()
  for (const s of out) {
    dedupe.set(`${s.study}:${s.sheet}:${s.column}`, s)
  }
  return [...dedupe.values()]
}
