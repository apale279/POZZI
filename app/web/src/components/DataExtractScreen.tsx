import { useEffect } from 'react'
import type { PatientRecord } from '../types/canonical'
import { SHEET_EDITOR_CHANNEL, type SheetEditorLaunch } from '../lib/sheetEditor'
import { CompletionOverview } from './CompletionOverview'

type Props = {
  record: PatientRecord
  onChange: (record: PatientRecord) => void
  onOpenSheet: (launch: SheetEditorLaunch) => void
}

export function DataExtractScreen({ record, onChange, onOpenSheet }: Props) {
  const runs = record.ecmoRuns?.length ? record.ecmoRuns : [{ runNumber: 1 }]
  const defaultRun = runs[0]?.runNumber ?? 1

  const handleOpenSheet = (targetId: string) => {
    onOpenSheet({
      patientId: record.id,
      targetId,
      ecmoRun: defaultRun,
    })
  }

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.origin !== window.location.origin ||
        e.data?.type !== SHEET_EDITOR_CHANNEL ||
        e.data.patientId !== record.id
      ) {
        return
      }
      onChange(e.data.record as PatientRecord)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [record.id, onChange])

  if (!record.core.sdo) {
    return (
      <div className="extract-screen empty">
        <p>Compila lo <strong>SDO</strong> nel tab Paziente.</p>
      </div>
    )
  }

  if (!record.acc?.attivo && !record.ecmo?.attivo) {
    return (
      <div className="extract-screen empty">
        <p>Attiva ACC e/o ECMO nel tab Paziente.</p>
      </div>
    )
  }

  return (
    <div className="extract-screen">
      <section className="extract-step">
        <h2>Fogli database (come Excel)</h2>
        <p className="hint">
          Clicca una valutazione per aprirla a <strong>schermo intero</strong>: potrai caricare testo,
          screenshot, <strong>PDF</strong> o <strong>Word (.docx)</strong>, risolvere conflitti e
          compilare i vuoti. Usa <strong>Ottimizza (P.O.Z.Z.I.)</strong> per ANNO, BMI, età, ecc.
        </p>
        <CompletionOverview record={record} onOpenSheet={handleOpenSheet} />
      </section>
    </div>
  )
}
