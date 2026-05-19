import { useMemo, useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import {
  buildExportBundle,
  copyRowToClipboard,
  downloadExportWorkbook,
  downloadSheetCsv,
  defaultExportPlan,
  type SheetExportRow,
} from '../lib/excelExport'
import { computeAllCompletions, overallCompletion } from '../lib/completion'
import { COMPLETE_THRESHOLD } from '../lib/workflow'
import { isFirebaseConfigured } from '../lib/firebase'
import { deletePatientFromFirebase } from '../lib/patientFirestore'

type Props = {
  record: PatientRecord
  onDeleted?: () => void
}

export function ExportPanel({ record, onDeleted }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const bundle = useMemo(() => buildExportBundle(record), [record])
  const plan = useMemo(() => defaultExportPlan(record), [record])
  const completionPercent = useMemo(() => {
    const completions = computeAllCompletions(record)
    return overallCompletion(completions)
  }, [record])
  const caseComplete = completionPercent >= COMPLETE_THRESHOLD

  const handleCopy = async (row: SheetExportRow, withHeader: boolean) => {
    await copyRowToClipboard(row, withHeader)
    setCopied(`${row.study}:${row.sheet}`)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleDeleteFromFirebase = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePatientFromFirebase(record.id)
      setConfirmDelete(false)
      onDeleted?.()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Errore eliminazione')
    } finally {
      setDeleting(false)
    }
  }

  if (!record.core.sdo) {
    return (
      <div className="export-panel empty">
        <p>Inserisci almeno lo SDO per generare righe da esportare.</p>
      </div>
    )
  }

  if (plan.length === 0) {
    return (
      <div className="export-panel empty">
        <p>Attiva almeno uno studio (ECMO o ACC) per l’export.</p>
      </div>
    )
  }

  return (
    <div className="export-panel">
      <header>
        <h2>Export verso i DB Excel</h2>
        <p className="hint">
          Ogni blocco è una riga nell’ordine esatto delle colonne del tuo file. Apri il foglio
          corretto, seleziona la prima cella della prossima riga vuota, incolla (Ctrl+V) oppure
          scarica il file .xlsx di supporto.
        </p>
        <button type="button" className="btn-primary" onClick={() => downloadExportWorkbook(bundle)}>
          Scarica .xlsx (tutti i fogli del piano)
        </button>
        {isFirebaseConfigured() && caseComplete && (
          <div className="export-cleanup">
            <p className="hint">
              Completamento circa <strong>{completionPercent}%</strong>. Dopo aver incollato i dati
              nei fogli Excel/Sheet puoi rimuovere questo caso da Firebase.
            </p>
            <button type="button" className="danger-btn" onClick={() => setConfirmDelete(true)}>
              Cancella tutti i dati da Firebase
            </button>
          </div>
        )}
        {deleteError && <p className="error-msg">{deleteError}</p>}
      </header>

      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Eliminare da Firebase?</h3>
            <p>
              Eliminerai definitivamente i dati di{' '}
              <strong>
                {record.core.cognome} {record.core.nome}
              </strong>{' '}
              (SDO {record.core.sdo}) dal cloud. L’export che hai già fatto resta sul PC.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Annulla
              </button>
              <button type="button" className="danger-btn" onClick={handleDeleteFromFirebase} disabled={deleting}>
                {deleting ? 'Eliminazione…' : 'Sì, elimina da Firebase'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ol className="export-list">
        {bundle.rows.map((row) => {
          const filled = row.values.filter((v) => v !== null && v !== '').length
          const key = `${row.study}:${row.sheet}`
          return (
            <li key={key} className="export-item">
              <div className="export-item-head">
                <strong>
                  {row.study.toUpperCase()} — {row.sheet}
                </strong>
                <span>
                  {filled} / {row.columns.length} colonne valorizzate
                </span>
              </div>
              <pre className="preview">{previewCells(row)}</pre>
              <div className="actions">
                <button type="button" onClick={() => handleCopy(row, false)}>
                  Copia riga (incolla in Excel)
                </button>
                <button type="button" onClick={() => handleCopy(row, true)}>
                  Copia con intestazioni
                </button>
                <button type="button" onClick={() => downloadSheetCsv(row)}>
                  CSV foglio
                </button>
                {copied === key && <span className="ok">Copiato</span>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function previewCells(row: SheetExportRow): string {
  const lines: string[] = []
  for (const col of row.columns) {
    const v = row.cells[col]
    if (v !== undefined && v !== null && v !== '') {
      lines.push(`${col}: ${v}`)
    }
  }
  return lines.length ? lines.join('\n') : '(nessun valore — compila il form sopra)'
}
