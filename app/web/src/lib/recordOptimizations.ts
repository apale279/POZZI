import type { PatientRecord } from '../types/canonical'
import { getSheetSchema } from './sheetSchema'
import {
  type CalculatedSuggestion,
  computeBmi,
  parseDateParts,
  ageYears,
} from './calculatedFields'

const sheets = () => getSheetSchema()

const ELSO_COLS = ['ELSO', 'NUMERO ELSO'] as const
const RUN_COL = 'RUN'

const PAO2_ALIASES = ['pO2', 'EGA - PaO2', 'PO2', 'PaO2', 'PBO2']
const FIO2_ALIASES = ['FiO2', 'EGA -FIO2', 'EGA - FiO2', 'FIO2', 'EGA -FIO2 ']
const PF_COLS = ['P/F', 'PF']

const GCS_E = ['GCS - E', 'GCS-E T1']
const GCS_V = ['GCS - V', 'GCS-V T1']
const GCS_M = ['GCS - M', 'GCS-M T1']
const GCS_TOTAL = ['GCS', 'GCS TOTAL', 'GCS TOT']

const YEAR_SOURCE_COLS = [
  'DATA INGRESSO ICU',
  'DATA INGRESSO H',
  'START DATE',
  'DATA ARRESTO',
  'DATA EGA',
  'HEMODINAMIC DATE',
  'ACC DATE',
  'ADMISSION DATE',
]

const ARREST_DATE_COLS = ['DATA ARRESTO', 'ACC DATE', 'DATA ARRESTO ACC']

export type OptimizeOptions = {
  /** Non sovrascrivere valori già presenti (default true). */
  onlyEmpty?: boolean
  /** @deprecated Non usato: SDO/cognome/nome esclusi dall'app. */
  propagateIdentity?: boolean
  /** Propaga ANNO su tutti i fogli che hanno la colonna. */
  propagateYear?: boolean
}

function normCol(c: string): string {
  return c.trim().toUpperCase()
}

function findCol(cols: string[], aliases: string[]): string | undefined {
  const set = new Set(aliases.map((a) => normCol(a)))
  return cols.find((c) => set.has(normCol(c)))
}

function getVal(data: Record<string, string | number | boolean>, col: string): string | number | undefined {
  const v = data[col]
  if (v === undefined || v === null || v === '') return undefined
  return typeof v === 'boolean' ? (v ? 1 : 0) : v
}

function numVal(v: string | number | boolean | undefined): number | undefined {
  if (v === undefined || typeof v === 'boolean') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function isEmpty(data: Record<string, string | number | boolean>, col: string): boolean {
  return getVal(data, col) === undefined
}

function isGenericAnnoColumn(col: string): boolean {
  const n = normCol(col)
  return n === 'ANNO'
}

function isAnnoArrestoColumn(col: string): boolean {
  const n = normCol(col)
  return n.includes('ANNO') && n.includes('ARRESTO')
}

function isDateLikeColumn(col: string): boolean {
  const n = normCol(col)
  if (n === 'DN') return true
  if (n.startsWith('DATA ') || n.endsWith(' DATE')) return true
  if (n === 'ACC DATE' || n === 'START DATE' || n === 'END DATE' || n === 'ADMISSION DATE') return true
  return ARREST_DATE_COLS.some((a) => normCol(a) === n)
}

function isArrestDateColumn(col: string): boolean {
  const n = normCol(col)
  return ARREST_DATE_COLS.some((a) => normCol(a) === n)
}

function yearFromAnyDate(raw: string | number | boolean | undefined): number | null {
  if (raw === undefined || typeof raw === 'boolean') return null
  const parts = parseDateParts(String(raw))
  return parts?.y ?? null
}

/** Anno arresto ACC: data arresto in scheda paziente o colonne data sul foglio. */
function resolveArrestYear(
  record: PatientRecord,
  data: Record<string, string | number | boolean>,
): number | null {
  const fromCore = yearFromAnyDate(record.acc?.dataArresto)
  if (fromCore !== null) return fromCore
  const fromAccAnno = record.acc?.anno ? parseInt(String(record.acc.anno), 10) : NaN
  if (Number.isFinite(fromAccAnno)) return fromAccAnno
  for (const key of Object.keys(data)) {
    if (!isArrestDateColumn(key)) continue
    const y = yearFromAnyDate(getVal(data, key))
    if (y !== null) return y
  }
  for (const key of Object.keys(data)) {
    if (!isDateLikeColumn(key) || !isArrestDateColumn(key)) continue
    const y = yearFromAnyDate(getVal(data, key))
    if (y !== null) return y
  }
  return null
}

function findYearColumns(cols: string[]): string[] {
  return cols.filter((c) => isGenericAnnoColumn(c) || isAnnoArrestoColumn(c))
}

/** BSA Dubois (m²) — peso kg, altezza cm. */
export function estimateBsaM2(pesoKg: number, altezzaCm: number): number | null {
  if (pesoKg <= 0 || altezzaCm <= 0) return null
  const bsa = 0.007184 * pesoKg ** 0.425 * altezzaCm ** 0.725
  return Math.round(bsa * 100) / 100
}

export function computePfRatio(pao2: number, fio2: number): number | null {
  if (pao2 <= 0 || fio2 <= 0) return null
  const fio2Frac = fio2 > 1 ? fio2 / 100 : fio2
  if (fio2Frac <= 0) return null
  return Math.round(pao2 / fio2Frac)
}

function resolveReferenceDate(record: PatientRecord): Date {
  if (record.acc?.dataArresto) {
    const p = parseDateParts(record.acc.dataArresto)
    if (p) return new Date(p.y, p.m - 1, p.d)
  }
  for (const study of ['ecmo', 'acc'] as const) {
    for (const sheet of Object.keys(sheets()[study])) {
      const data = study === 'ecmo' ? record.ecmoSheets?.[sheet] : record.accSheets?.[sheet]
      if (!data) continue
      for (const key of YEAR_SOURCE_COLS) {
        const col = Object.keys(data).find((k) => normCol(k) === normCol(key))
        if (!col) continue
        const p = parseDateParts(String(getVal(data, col)!))
        if (p) return new Date(p.y, p.m - 1, p.d)
      }
    }
  }
  return new Date()
}

function resolveStudyYear(record: PatientRecord): number | null {
  if (record.ecmo?.anno) {
    const y = parseInt(String(record.ecmo.anno), 10)
    if (Number.isFinite(y)) return y
  }
  if (record.acc?.dataArresto) {
    const p = parseDateParts(record.acc.dataArresto)
    if (p) return p.y
  }
  const ref = resolveReferenceDate(record)
  return ref.getFullYear()
}

function resolveAnthropometry(record: PatientRecord): { peso?: number; altezza?: number; dn?: string } {
  let peso = record.core.pesoKg
  let altezza = record.core.altezzaCm
  let dn = record.core.dataNascita

  const scan = (study: 'ecmo' | 'acc', sheet: string) => {
    const data = study === 'ecmo' ? record.ecmoSheets?.[sheet] : record.accSheets?.[sheet]
    if (!data) return
    for (const [k, v] of Object.entries(data)) {
      const n = normCol(k)
      if (n === 'PESO' && peso === undefined) peso = numVal(v)
      if ((n === 'ALTEZZA' || n === 'ALTEZZA ') && altezza === undefined) altezza = numVal(v)
      if (n === 'DN' && !dn) dn = String(v)
    }
  }
  scan('ecmo', 'ANAGRAFICA')
  scan('acc', 'Anagrafica')
  return { peso, altezza, dn }
}

function setCell(
  record: PatientRecord,
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
  value: string | number,
  onlyEmpty: boolean,
): boolean {
  if (study === 'ecmo' && !record.ecmo?.attivo) return false
  if (study === 'acc' && !record.acc?.attivo) return false

  if (study === 'ecmo') {
    record.ecmoSheets = record.ecmoSheets ?? {}
    const cur = record.ecmoSheets[sheet] ?? {}
    if (onlyEmpty && !isEmpty(cur, column)) return false
    record.ecmoSheets[sheet] = { ...cur, [column]: value }
    return true
  }

  record.accSheets = record.accSheets ?? {}
  const cur = record.accSheets[sheet] ?? {}
  if (onlyEmpty && !isEmpty(cur, column)) return false
  record.accSheets[sheet] = { ...cur, [column]: value }
  return true
}

function push(
  applied: CalculatedSuggestion[],
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
  value: string | number,
  reason: string,
  sourceColumns: string[],
  didApply: boolean,
) {
  if (didApply) {
    applied.push({ study, sheet, column, value, reason, sourceColumns })
  }
}

/** Applica calcoli e propagazioni su tutto il record (tutti i fogli attivi). */
export function applyRecordOptimizations(
  record: PatientRecord,
  options: OptimizeOptions = {},
): { record: PatientRecord; applied: CalculatedSuggestion[] } {
  const onlyEmpty = options.onlyEmpty !== false
  const propagateYear = options.propagateYear !== false

  const next: PatientRecord = {
    ...record,
    accSheets: { ...record.accSheets },
    ecmoSheets: { ...record.ecmoSheets },
    updatedAt: new Date().toISOString(),
  }
  const applied: CalculatedSuggestion[] = []

  const refDate = resolveReferenceDate(next)
  const studyYear = resolveStudyYear(next)
  const { peso, altezza, dn } = resolveAnthropometry(next)

  const studies: { study: 'ecmo' | 'acc'; active: boolean }[] = [
    { study: 'ecmo', active: !!next.ecmo?.attivo },
    { study: 'acc', active: !!next.acc?.attivo },
  ]

  for (const { study, active } of studies) {
    if (!active) continue
    for (const [sheet, cols] of Object.entries(sheets()[study])) {
      const data = study === 'ecmo' ? next.ecmoSheets?.[sheet] ?? {} : next.accSheets?.[sheet] ?? {}

      const arrestYear = study === 'acc' ? resolveArrestYear(next, data) : null

      if (propagateYear) {
        for (const yearCol of findYearColumns(cols)) {
          let year: number | null = null
          let reason = 'Anno da data sul foglio o scheda paziente'
          const sources: string[] = []

          if (isAnnoArrestoColumn(yearCol)) {
            year = arrestYear ?? studyYear
            reason = 'ANNO arresto da data arresto / ACC DATE'
            sources.push('DATA ARRESTO', 'acc.dataArresto')
          } else if (isGenericAnnoColumn(yearCol)) {
            year = study === 'acc' ? (arrestYear ?? studyYear) : studyYear
            if (study === 'acc' && arrestYear !== null) sources.push('data arresto')
          }

          if (year === null) continue
          const ok = setCell(next, study, sheet, yearCol, year, onlyEmpty)
          push(applied, study, sheet, yearCol, year, reason, sources, ok)
        }
      }

      for (const [colKey, raw] of Object.entries(data)) {
        if (!isDateLikeColumn(colKey)) continue
        const y = yearFromAnyDate(raw)
        if (y === null) continue
        for (const yearCol of findYearColumns(cols)) {
          if (isAnnoArrestoColumn(yearCol) && !isArrestDateColumn(colKey)) continue
          if (isGenericAnnoColumn(yearCol) && isArrestDateColumn(colKey) && arrestYear !== null) {
            const ok = setCell(next, study, sheet, yearCol, arrestYear, onlyEmpty)
            push(applied, study, sheet, yearCol, arrestYear, `Anno da ${colKey}`, [colKey], ok)
            continue
          }
          if (!isGenericAnnoColumn(yearCol) && !isAnnoArrestoColumn(yearCol)) continue
          const targetYear = isAnnoArrestoColumn(yearCol) ? (arrestYear ?? y) : y
          const ok = setCell(next, study, sheet, yearCol, targetYear, onlyEmpty)
          push(applied, study, sheet, yearCol, targetYear, `Anno da ${colKey}`, [colKey], ok)
        }
      }

      if (study === 'ecmo' && next.ecmo?.numeroElso) {
        for (const elsoCol of ELSO_COLS) {
          if (!cols.includes(elsoCol)) continue
          const ok = setCell(next, study, sheet, elsoCol, next.ecmo.numeroElso, onlyEmpty)
          push(applied, study, sheet, elsoCol, next.ecmo.numeroElso, 'N. ELSO da scheda', [], ok)
        }
      }

      const runNum = next.ecmoRuns?.[0]?.runNumber
      if (study === 'ecmo' && runNum !== undefined && cols.includes(RUN_COL)) {
        const ok = setCell(next, study, sheet, RUN_COL, runNum, onlyEmpty)
        push(applied, study, sheet, RUN_COL, runNum, 'RUN ECMO (primo run)', [], ok)
      }

      if (peso && altezza && cols.includes('BMI')) {
        const bmi = computeBmi(peso, altezza)
        if (bmi != null) {
          const ok = setCell(next, study, sheet, 'BMI', bmi, onlyEmpty)
          push(applied, study, sheet, 'BMI', bmi, `BMI da ${peso} kg e ${altezza} cm`, ['PESO', 'ALTEZZA'], ok)
        }
      }

      if (dn) {
        const age = ageYears(dn, refDate)
        if (age != null) {
          for (const col of cols) {
            if (col === 'ANNI' || col === 'CALCOLO ETA' || col === 'AGE') {
              const ok = setCell(next, study, sheet, col, age, onlyEmpty)
              push(applied, study, sheet, col, age, `Età da DN (${dn})`, ['DN'], ok)
            }
          }
        }
      }

      const pfCol = findCol(cols, PF_COLS)
      const pao2Col = findCol(cols, PAO2_ALIASES)
      const fio2Col = findCol(cols, FIO2_ALIASES)
      if (pfCol && pao2Col && fio2Col) {
        const pao2 = numVal(getVal(data, pao2Col))
        const fio2 = numVal(getVal(data, fio2Col))
        if (pao2 && fio2) {
          const pf = computePfRatio(pao2, fio2)
          if (pf != null) {
            const ok = setCell(next, study, sheet, pfCol, pf, onlyEmpty)
            push(
              applied,
              study,
              sheet,
              pfCol,
              pf,
              `P/F = ${pao2Col} / ${fio2Col}`,
              [pao2Col, fio2Col],
              ok,
            )
          }
        }
      } else if (pao2Col && fio2Col && !pfCol) {
        const pao2 = numVal(getVal(data, pao2Col))
        const fio2 = numVal(getVal(data, fio2Col))
        if (pao2 && fio2) {
          const pf = computePfRatio(pao2, fio2)
          if (pf != null && onlyEmpty) {
            /* ECMO 24h: no colonna P/F — valore calcolabile ma non salvato senza colonna */
          }
        }
      }

      if (cols.includes('CI') && peso && altezza) {
        const coCol = findCol(cols, ['CO'])
        if (coCol) {
          const co = numVal(getVal(data, coCol))
          const bsa = estimateBsaM2(peso, altezza)
          if (co && bsa) {
            const ci = Math.round((co / bsa) * 100) / 100
            const ok = setCell(next, study, sheet, 'CI', ci, onlyEmpty)
            push(applied, study, sheet, 'CI', ci, `CI = CO/BSA (BSA≈${bsa} m²)`, [coCol, 'PESO', 'ALTEZZA'], ok)
          }
        }
      }

      const eCol = findCol(cols, GCS_E)
      const vCol = findCol(cols, GCS_V)
      const mCol = findCol(cols, GCS_M)
      const totCol = findCol(cols, GCS_TOTAL)
      if (totCol && eCol && vCol && mCol) {
        const e = numVal(getVal(data, eCol))
        const v = numVal(getVal(data, vCol))
        const m = numVal(getVal(data, mCol))
        if (e !== undefined && v !== undefined && m !== undefined) {
          const sum = e + v + m
          const ok = setCell(next, study, sheet, totCol, sum, onlyEmpty)
          push(applied, study, sheet, totCol, sum, 'GCS = E + V + M', [eCol, vCol, mCol], ok)
        }
      }
    }
  }

  return { record: next, applied }
}
