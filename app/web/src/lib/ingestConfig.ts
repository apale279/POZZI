import parseColumnMapJson from '../data/parse_column_map.json'
import type { IngestTarget } from '../types/ingest'
import { buildIngestTargets } from './sheetTargets'

export const INGEST_TARGETS: IngestTarget[] = buildIngestTargets()
export const PARSE_COLUMN_MAP = parseColumnMapJson as Record<string, Record<string, string>>

export function getTargetById(id: string): IngestTarget | undefined {
  return INGEST_TARGETS.find((t) => t.id === id)
}

export const PARSE_KEY_LABELS: Record<string, string> = {
  ph: 'pH',
  pao2: 'PaO₂',
  paco2: 'PaCO₂',
  hco3: 'HCO₃⁻',
  be: 'BE',
  lactate: 'Lattato',
  hb: 'Emoglobina',
  ht: 'Ematocrito',
  sao2: 'SatO₂',
  fio2: 'FiO₂',
  peep: 'PEEP',
  tv: 'Volume corrente',
  rr: 'Frequenza respiratoria',
  na: 'Sodio',
  k: 'Potassio',
  creat: 'Creatinina',
  pam: 'PAM',
  pas: 'PAS',
  pad: 'PAD',
  temp: 'Temperatura',
}
