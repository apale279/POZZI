import type { IngestTarget } from '../types/ingest'
import { getSheetColumnsList } from './completion'
import { getSheetSchema } from './sheetSchema'

const sheets = () => getSheetSchema()

/** ID usati in parse_column_map.json (compatibilità estrazione testo). */
const PARSE_ID_BY_SHEET: Record<string, string> = {
  'acc:Ammissione': 'acc_ammissione',
  'acc:6 - 12H': 'acc_h6_12',
  'acc:DAY 1': 'acc_day1',
  'acc:DAY 2': 'acc_day2',
  'acc:DAY 3': 'acc_day3',
  'acc:PS': 'acc_ps',
  'acc:Anamnesi': 'acc_anamnesi',
  'acc:Pre-H': 'acc_preh',
  'acc:Outcome': 'acc_outcome',
  'ecmo:PRE-ECLS ASSESSMENT': 'ecmo_pre_ecls',
  'ecmo:24HRS ECLS ASSESSMENT': 'ecmo_24h',
  'ecmo:ECLS CARE': 'ecmo_ecls_care',
  'ecmo:ECPR INCANULAMENTO': 'ecmo_ecpr_incan',
  'ecmo:OUTCOME': 'ecmo_outcome',
}

function sheetKey(study: 'ecmo' | 'acc', sheet: string): string {
  return `${study}:${sheet}`
}

function slugId(study: 'ecmo' | 'acc', sheet: string): string {
  const base = sheet
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return `${study}_${base || 'sheet'}`
}

function hasRunColumn(study: 'ecmo' | 'acc', sheet: string): boolean {
  return getSheetColumnsList(study, sheet).some((c) => c.trim().toUpperCase() === 'RUN')
}

/** Una scheda valutazione = un foglio Excel del database. */
export function buildIngestTargets(): IngestTarget[] {
  const targets: IngestTarget[] = []

  for (const study of ['ecmo', 'acc'] as const) {
    const labelPrefix = study === 'ecmo' ? 'ECMO' : 'ACC'
    for (const sheet of Object.keys(sheets()[study])) {
      const key = sheetKey(study, sheet)
      targets.push({
        id: PARSE_ID_BY_SHEET[key] ?? slugId(study, sheet),
        label: `${labelPrefix} — ${sheet}`,
        study,
        sheet,
        requiresRun: study === 'ecmo' && hasRunColumn(study, sheet),
      })
    }
  }

  return targets
}

export function listSheetsForStudy(study: 'ecmo' | 'acc'): string[] {
  return Object.keys(sheets()[study])
}

/** ID per mappatura estrazione testo (parse_column_map.json). */
export function getParseTargetId(study: 'ecmo' | 'acc', sheet: string): string {
  const key = sheetKey(study, sheet)
  return PARSE_ID_BY_SHEET[key] ?? slugId(study, sheet)
}
