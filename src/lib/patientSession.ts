import type { PatientRecord } from '../types/canonical'

const PREFIX = 'pozzi:patient:'

export function stashPatientRecord(record: PatientRecord): void {
  try {
    sessionStorage.setItem(`${PREFIX}${record.id}`, JSON.stringify(record))
  } catch {
    /* quota / private mode */
  }
}

export function getStashedPatientRecord(patientId: string): PatientRecord | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${patientId}`)
    if (!raw) return null
    return JSON.parse(raw) as PatientRecord
  } catch {
    return null
  }
}

export function clearStashedPatientRecord(patientId: string): void {
  try {
    sessionStorage.removeItem(`${PREFIX}${patientId}`)
  } catch {
    /* ignore */
  }
}
