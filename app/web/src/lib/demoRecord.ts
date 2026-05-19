import type { PatientRecord } from '../types/canonical'

export function createEmptyRecord(): PatientRecord {
  return {
    id: crypto.randomUUID(),
    core: { sdo: '', cognome: '', nome: '' },
    ecmo: { attivo: false },
    acc: { attivo: false },
    ecmoRuns: [{ runNumber: 1 }],
    accSheets: {},
    ecmoSheets: {},
    updatedAt: new Date().toISOString(),
  }
}
