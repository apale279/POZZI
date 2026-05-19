import type { PatientRecord } from '../types/canonical'
import type { StudyExport } from './schemas'

/** Dove scrivere un valore canonico su un foglio Excel (nome colonna identico al file originale). */
export interface ExcelTarget {
  study: StudyExport
  sheet: string
  column: string
}

export interface FieldMapping {
  /** Chiave nel payload flat per buildRow */
  key: string
  targets: ExcelTarget[]
  getValue: (record: PatientRecord, ctx: ExportBridgeContext) => unknown
}

export interface ExportBridgeContext {
  ecmoRunNumber?: number
  accTimepoint?: string
}

function bg(record: PatientRecord) {
  const a = record.ecmoAssessment24h
  const tp = record.accTimepoints?.find((t) => t.timepoint === 'DAY_1')
  return { ecmo: a?.bloodGas, acc: tp?.bloodGas ?? a?.bloodGas }
}

function vent(record: PatientRecord) {
  const a = record.ecmoAssessment24h
  const tp = record.accTimepoints?.find((t) => t.timepoint === 'DAY_1')
  return { ecmo: a?.ventilation, acc: tp?.ventilation ?? a?.ventilation }
}

/** Mappature esplicite: un inserimento → più celle Excel. */
export const FIELD_MAPPINGS: FieldMapping[] = [
  // —— ECMO Anagrafica ——
  {
    key: 'ecmo.anag.sdo',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'SDO' }],
    getValue: (r) => r.core.sdo,
  },
  {
    key: 'ecmo.anag.cognome',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'COGNOME' }],
    getValue: (r) => r.core.cognome,
  },
  {
    key: 'ecmo.anag.nome',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'NOME' }],
    getValue: (r) => r.core.nome,
  },
  {
    key: 'ecmo.anag.elso',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'NUMERO ELSO' }],
    getValue: (r) => r.ecmo?.numeroElso,
  },
  {
    key: 'ecmo.anag.lens',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'ECMO LENS' }],
    getValue: (r) => r.ecmo?.ecmoLens,
  },
  {
    key: 'ecmo.anag.sex',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'SEX' }],
    getValue: (r) => r.core.sesso,
  },
  {
    key: 'ecmo.anag.peso',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'PESO' }],
    getValue: (r) => r.core.pesoKg,
  },
  {
    key: 'ecmo.anag.altezza',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'ALTEZZA' }],
    getValue: (r) => r.core.altezzaCm,
  },
  {
    key: 'ecmo.anag.dn',
    targets: [{ study: 'ecmo', sheet: 'ANAGRAFICA', column: 'DN' }],
    getValue: (r) => r.core.dataNascita,
  },
  // —— Gasometria → ECMO 24h + ACC timepoints ——
  {
    key: 'bloodGas.ph',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'pH' },
      { study: 'acc', sheet: 'DAY 1', column: 'EGA - pH' },
      { study: 'acc', sheet: '6 - 12H', column: 'EGA - pH' },
      { study: 'acc', sheet: 'Ammissione', column: 'EGA - pH' },
    ],
    getValue: (r) => bg(r).ecmo?.ph ?? bg(r).acc?.ph,
  },
  {
    key: 'bloodGas.pao2',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'pO2' },
      { study: 'acc', sheet: 'DAY 1', column: 'EGA - PaO2' },
      { study: 'acc', sheet: '6 - 12H', column: 'EGA - PaO2' },
      { study: 'acc', sheet: 'Ammissione', column: 'EGA - PaO2' },
    ],
    getValue: (r) => bg(r).ecmo?.pao2 ?? bg(r).acc?.pao2,
  },
  {
    key: 'bloodGas.paco2',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'pCO2' },
      { study: 'acc', sheet: 'DAY 1', column: 'EGA - PaCO2' },
      { study: 'acc', sheet: '6 - 12H', column: 'EGA - PaCO2' },
      { study: 'acc', sheet: 'Ammissione', column: 'EGA - PaCO2' },
    ],
    getValue: (r) => bg(r).ecmo?.paco2 ?? bg(r).acc?.paco2,
  },
  {
    key: 'bloodGas.hco3',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'HCO3-' },
      { study: 'acc', sheet: 'DAY 1', column: 'HCO3' },
      { study: 'acc', sheet: '6 - 12H', column: 'HCO3' },
      { study: 'acc', sheet: 'Ammissione', column: 'HCO3' },
    ],
    getValue: (r) => bg(r).ecmo?.hco3 ?? bg(r).acc?.hco3,
  },
  {
    key: 'bloodGas.lactate',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'Lac' },
      { study: 'acc', sheet: 'DAY 1', column: 'LAC' },
      { study: 'acc', sheet: '6 - 12H', column: 'LAC' },
      { study: 'acc', sheet: 'Ammissione', column: 'LAC' },
    ],
    getValue: (r) => bg(r).ecmo?.lactate ?? bg(r).acc?.lactate,
  },
  {
    key: 'bloodGas.be',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'BE' },
      { study: 'acc', sheet: 'DAY 1', column: 'BE' },
      { study: 'acc', sheet: '6 - 12H', column: 'BE' },
      { study: 'acc', sheet: 'Ammissione', column: 'BE' },
    ],
    getValue: (r) => bg(r).ecmo?.be ?? bg(r).acc?.be,
  },
  {
    key: 'bloodGas.hb',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'Hb' },
      { study: 'acc', sheet: 'DAY 1', column: 'Hb' },
      { study: 'acc', sheet: '6 - 12H', column: 'HB' },
      { study: 'acc', sheet: 'Ammissione', column: 'HB' },
    ],
    getValue: (r) => bg(r).ecmo?.hb ?? bg(r).acc?.hb,
  },
  {
    key: 'bloodGas.ht',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'HT' },
      { study: 'acc', sheet: 'DAY 1', column: 'HT' },
      { study: 'acc', sheet: '6 - 12H', column: 'HT' },
      { study: 'acc', sheet: 'Ammissione', column: 'Ht' },
    ],
    getValue: (r) => bg(r).ecmo?.ht ?? bg(r).acc?.ht,
  },
  {
    key: 'bloodGas.sao2',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'O2Hb' },
      { study: 'acc', sheet: 'DAY 1', column: 'SO2' },
    ],
    getValue: (r) => bg(r).ecmo?.sao2 ?? bg(r).acc?.sao2,
  },
  // —— Ventilazione ——
  {
    key: 'vent.peep',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'PEEP' },
      { study: 'acc', sheet: 'DAY 1', column: 'PEEP' },
      { study: 'acc', sheet: 'Ammissione', column: 'PEEP' },
    ],
    getValue: (r) => vent(r).ecmo?.peep ?? vent(r).acc?.peep,
  },
  {
    key: 'vent.fio2',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'FiO2' },
      { study: 'acc', sheet: 'DAY 1', column: 'EGA -FIO2' },
    ],
    getValue: (r) => vent(r).ecmo?.fio2 ?? vent(r).acc?.fio2,
  },
  {
    key: 'vent.tv',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'TV' },
      { study: 'acc', sheet: 'DAY 1', column: 'VT' },
    ],
    getValue: (r) => vent(r).ecmo?.tv ?? vent(r).acc?.tv,
  },
  {
    key: 'vent.rr',
    targets: [
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'RR' },
      { study: 'acc', sheet: 'DAY 1', column: 'FR' },
    ],
    getValue: (r) => vent(r).ecmo?.rr ?? vent(r).acc?.rr,
  },
  // —— Emodinamica (solo ECMO) ——
  {
    key: 'hemo.pam',
    targets: [{ study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'PAM' }],
    getValue: (r) => r.ecmoAssessment24h?.hemodynamics?.pam,
  },
  {
    key: 'hemo.co',
    targets: [{ study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', column: 'CO' }],
    getValue: (r) => r.ecmoAssessment24h?.hemodynamics?.co,
  },
  // —— Outcome ——
  {
    key: 'outcome.cpc',
    targets: [
      { study: 'ecmo', sheet: 'OUTCOME', column: 'CPC DISCHARGE' },
      { study: 'acc', sheet: 'Outcome', column: 'CPC AT DISCHARGE' },
    ],
    getValue: (r) => r.outcome?.cpcDimissione,
  },
]

export function collectValuesForSheet(
  study: StudyExport,
  sheet: string,
  record: PatientRecord,
  ctx: ExportBridgeContext,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const m of FIELD_MAPPINGS) {
    const v = m.getValue(record, ctx)
    if (v === undefined || v === null || v === '') continue
    for (const t of m.targets) {
      if (t.study === study && t.sheet === sheet) {
        values[t.column] = v
      }
    }
  }
  return values
}
