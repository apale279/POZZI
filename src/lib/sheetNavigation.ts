import type { PatientRecord } from '../types/canonical'
import { stashPatientRecord } from './patientSession'
import type { SheetEditorLaunch } from './sheetEditor'
import { openSheetEditorWindow } from './sheetEditor'

export type OpenSheetOptions = {
  record: PatientRecord
  launch: SheetEditorLaunch
  /** Apre la scheda nella stessa finestra (consigliato). */
  onInline: (launch: SheetEditorLaunch) => void
  /** Prova anche una nuova finestra (se il browser lo consente). */
  tryPopup?: boolean
}

/**
 * Salva il record in sessione e apre la scheda inline.
 * Opzionalmente tenta un popup (spesso bloccato).
 */
export function openSheetEditor(opts: OpenSheetOptions): void {
  stashPatientRecord(opts.record)
  opts.onInline(opts.launch)
  if (opts.tryPopup) {
    const w = openSheetEditorWindow(opts.launch)
    if (!w) return
    try {
      w.focus()
    } catch {
      /* cross-origin */
    }
  }
}
