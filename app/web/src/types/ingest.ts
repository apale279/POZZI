export interface LinkedWrite {
  study: 'ecmo' | 'acc'
  sheet: string
  /** Chiave per PARSE_COLUMN_MAP (può differire dal target principale) */
  parseTargetId: string
  requiresRun?: boolean
}

export interface IngestTarget {
  id: string
  label: string
  study: 'ecmo' | 'acc'
  sheet: string
  description?: string
  requiresRun?: boolean
  requiresBothStudies?: boolean
  clinicalDay?: number
  linkedWrites?: LinkedWrite[]
}

export interface DestinationRow {
  parameter: string
  parseKey: string
  value: string | number | boolean
  study: 'ECMO' | 'ACC'
  sheet: string
  column: string
  dbTarget: string
  ecmoRun?: number
  autoFilled?: boolean
}

export interface ExtractionPreview {
  targetId: string
  targetLabel: string
  ecmoRun?: number
  rows: DestinationRow[]
  unmatchedText?: string
  source?: 'text' | 'gemini'
}

export interface SheetCompletion {
  targetId: string
  label: string
  study: 'ecmo' | 'acc'
  sheet: string
  totalFields: number
  filledFields: number
  percent: number
  missingColumns: string[]
  hidden?: boolean
}

export interface TargetFieldInfo {
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
  label: string
  fromExtraction: boolean
  alreadyFilled: boolean
  currentValue?: string | number | boolean
}

export interface SheetFieldRow {
  study: 'ECMO' | 'ACC'
  studyId: 'ecmo' | 'acc'
  sheet: string
  column: string
  dbTarget: string
  fromExtraction: boolean
  currentValue?: string | number | boolean
  proposedValue?: string | number | boolean
  displayValue?: string | number | boolean
  source: 'existing' | 'extract' | 'calculated' | 'manual' | 'empty'
  ecmoRun?: number
}

export interface FieldConflict {
  key: string
  study: 'ECMO' | 'ACC'
  sheet: string
  column: string
  dbTarget: string
  existingValue: string | number | boolean
  newValue: string | number | boolean
  source: 'text' | 'gemini'
}

export type ConflictChoice = 'keep' | 'use_new'
