import type { PatientRecord, WorkflowStatus } from '../types/canonical'

export const COMPLETE_THRESHOLD = 85

export function deriveWorkflowStatus(
  record: PatientRecord,
  completionPercent: number,
): WorkflowStatus {
  if (completionPercent >= COMPLETE_THRESHOLD) return 'complete'

  const hasSheetData =
    Object.values(record.accSheets ?? {}).some((s) => Object.keys(s).length > 0) ||
    Object.values(record.ecmoSheets ?? {}).some((s) => Object.keys(s).length > 0)

  const hasStudies = Boolean(record.acc?.attivo || record.ecmo?.attivo)
  const hasIdentity = Boolean(record.core.sdo?.trim())

  if (completionPercent > 0 || hasSheetData || (hasIdentity && hasStudies)) {
    return 'in_progress'
  }

  return 'todo'
}

export function workflowLabel(status: WorkflowStatus): string {
  switch (status) {
    case 'complete':
      return 'Completato'
    case 'in_progress':
      return 'In corso'
    default:
      return 'Da compilare'
  }
}
