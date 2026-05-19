import { ACC_SHEETS } from './schemas'
import { filterSheetColumns, HIDDEN_SHEET_COLUMNS } from './sheetColumns'

/** Ordine fogli ACC come nel file originale (escluso PIVOT). */
export const ACC_SHEET_ORDER = [
  'Anagrafica',
  'Anamnesi',
  'Pre-H',
  'PS',
  'Ammissione',
  '6 - 12H',
  'DAY 1',
  'DAY 2',
  'DAY 3',
  'Outcome',
] as const

export type AccSheetName = (typeof ACC_SHEET_ORDER)[number]

export const ACC_IDENTITY_COLUMNS = HIDDEN_SHEET_COLUMNS

export function getAccSheetColumns(sheet: string): string[] {
  return filterSheetColumns(ACC_SHEETS[sheet] ?? [])
}

export function getAccEditableColumns(sheet: string): string[] {
  return getAccSheetColumns(sheet)
}

export type AccFieldGroup = 'ega' | 'lab' | 'vent' | 'neuro' | 'arrest' | 'outcome' | 'anamnesi' | 'altro'

export function groupAccColumn(column: string): AccFieldGroup {
  const u = column.toUpperCase()
  if (u.includes('EGA') || u === 'P/F' || u === 'HCO3' || u === 'BE' || u === 'LAC' || u.includes('CT02')) return 'ega'
  if (u.includes('GCS') || u.includes('NPI') || u.includes('ENOLASI') || u.includes('CORNEALE') || u.includes('CARENALE') || u.includes('DISSEDAZIONE')) return 'neuro'
  if (u.includes('VENT') || u === 'PEEP' || u === 'VT' || u === 'FR' || u.includes('PLAT') || u.includes('PICCO') || u === 'CRS' || u.includes('FIO2') || u.includes('GAS FLOW')) return 'vent'
  if (u.includes('DISCHARGE') || u.includes('DEATH') || u.includes('CPC') || u.includes('TC') || u.includes('RMN') || u.includes('INFECTION') || u.includes('DONATION') || u.includes('DAYS IN')) return 'outcome'
  if (u.includes('ACC') || u.includes('CPR') || u.includes('ROSC') || u.includes('FLOW') || u.includes('RITMO') || u.includes('TESTIMON')) return 'arrest'
  if (['NA', 'K', 'CA', 'CL', 'WBC', 'PLT', 'HB', 'HT', 'INR', 'PTTR', 'PCR', 'PCT', 'CREA', 'BILI', 'GLU', 'OSM'].some((t) => u === t || u.startsWith(t + ' '))) return 'lab'
  if (['PRIOR MI', 'CHF', 'IRC', 'COPD', 'DIABETE', 'ASA', 'FRAILTY'].some((t) => u.includes(t))) return 'anamnesi'
  return 'altro'
}

const GROUP_LABELS: Record<AccFieldGroup, string> = {
  ega: 'Gasometria (EGA)',
  lab: 'Laboratorio',
  vent: 'Ventilazione / ECMO',
  neuro: 'Neurologia',
  arrest: 'Arresto / pre-ospedale',
  outcome: 'Outcome',
  anamnesi: 'Anamnesi / comorbidità',
  altro: 'Altri campi',
}

export function accGroupLabel(g: AccFieldGroup): string {
  return GROUP_LABELS[g]
}

export function isNumericAccColumn(column: string): boolean {
  const u = column.toUpperCase()
  if (ACC_IDENTITY_COLUMNS.has(column)) return false
  if (u.includes('DATE') || u.includes('ORA') || u.includes('TIME') || u.includes('DISCORSIV')) return false
  if (u.includes('GCS') || u.includes('MOD VENT') || u.includes('ESITO') || u.includes('CAUSA')) return false
  if (['EXITUS', 'STEMI', 'NSTEMI', 'PCI', 'CCH', 'CACG', 'eCPR', 'IABP', 'DONATION', 'SMOKE', 'LIVE ALONE'].some((t) => u.includes(t))) return false
  return /^(EGA|PH|PO2|PCO2|FIO2|P\/F|HCO3|BE|HT|HB|SO2|NA|K|CA|CL|LAC|GLU|WBC|PLT|INR|PEEP|VT|FR|CRS|TEMP|SAPS|NPI|FMT|N20|DIMERO|FBG|PTT|PCR|PCT|CREA|BILI|UREA|OSM|ANION|NO FLOW|LOW FLOW)/i.test(u) || u.includes('TEMPERATURA') || u.includes('ALIVE') || u.includes('DAYS IN')
}

export function isBooleanAccColumn(column: string): boolean {
  const u = column.toUpperCase()
  return [
    'EXITUS', 'STEMI', 'NSTEMI', 'PCI', 'CCH', 'CACG', 'eCPR', 'IABP',
    'ALIVE AT ICU DISCHARGE', 'DONATION', 'Eseguita TC', 'Eseguita RMN',
    'VAP', 'UTI', 'CRBS', 'MDR POS', 'TESTIMONIATO', 'BS-CPR', 'LUCAS', 'ROSC',
    'DEATH PRE', 'DEATH AFTER', 'INCOMPLETE PROGNOSTICATION', 'PRima TC',
  ].some((t) => u === t || u.includes(t))
}

export function hasAccSheetData(
  sheet: string,
  data: Record<string, Record<string, string | number | boolean>> | undefined,
): boolean {
  const row = data?.[sheet]
  if (!row) return false
  return Object.entries(row).some(([k, v]) => !ACC_IDENTITY_COLUMNS.has(k) && v !== '' && v !== undefined)
}
