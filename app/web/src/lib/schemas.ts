import ecmoSchema from '../export-schemas/ecmo.json'
import accSchema from '../export-schemas/acc.json'
import { filterSheetColumns } from './sheetColumns'

export type StudyExport = 'ecmo' | 'acc'

export const ECMO_SHEETS = ecmoSchema as Record<string, string[]>
export const ACC_SHEETS = accSchema as Record<string, string[]>

export function getSheetColumns(study: StudyExport, sheet: string): string[] {
  const map = study === 'ecmo' ? ECMO_SHEETS : ACC_SHEETS
  return filterSheetColumns(map[sheet] ?? [])
}

export function listSheets(study: StudyExport): string[] {
  return Object.keys(study === 'ecmo' ? ECMO_SHEETS : ACC_SHEETS)
}
