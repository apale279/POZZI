import { useMemo, useState } from 'react'
import type { ImportField } from '../lib/patientImport'
import {
  buildImportRows,
  findDuplicateSdos,
  importRowToPatient,
  parseExcelFile,
  parseTsvPaste,
  type ParsedImportSheet,
} from '../lib/patientImport'
import { importPatientsBatch } from '../lib/patientFirestore'

const FIELD_LABELS: Record<ImportField, string> = {
  sdo: 'SDO',
  cognome: 'Cognome',
  nome: 'Nome',
  dataNascita: 'Data nascita',
  sesso: 'Sesso',
  acc: 'Studio ACC (sì/no)',
  ecmo: 'Studio ECMO (sì/no)',
  note: 'Note',
  skip: '— Ignora —',
}

type Props = {
  existingSdos: Set<string>
  onImported: () => void
}

export function PatientImportPanel({ existingSdos, onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<ParsedImportSheet | null>(null)
  const [mapping, setMapping] = useState<Record<number, ImportField>>({})
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const previewRows = useMemo(() => {
    if (!parsed) return []
    return buildImportRows(parsed, mapping).slice(0, 8)
  }, [parsed, mapping])

  const allRows = useMemo(() => {
    if (!parsed) return []
    return buildImportRows(parsed, mapping)
  }, [parsed, mapping])

  const dupes = useMemo(
    () => findDuplicateSdos(allRows, existingSdos),
    [allRows, existingSdos],
  )

  const loadParsed = (sheet: ParsedImportSheet) => {
    setParsed(sheet)
    setMapping({ ...sheet.suggestedMapping })
    setResult(null)
    setError(null)
  }

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    loadParsed(parseExcelFile(buf))
  }

  const handlePaste = () => {
    if (!pasteText.trim()) return
    loadParsed(parseTsvPaste(pasteText))
  }

  const handleImport = async () => {
    if (!allRows.length) {
      setError('Nessuna riga valida. Assegna almeno SDO o Cognome/Nome.')
      return
    }
    const skipExisting = new Set(dupes.duplicatesExisting)
    const skipInFile = new Set(dupes.duplicatesInFile)
    const toImport = allRows.filter((r) => {
      const sdo = r.sdo.trim()
      if (sdo && (skipExisting.has(sdo) || skipInFile.has(sdo))) return false
      return true
    })

    if (!toImport.length) {
      setError('Tutte le righe sono duplicate (già in elenco o ripetute nel file).')
      return
    }

    setImporting(true)
    setError(null)
    try {
      const batchId = crypto.randomUUID()
      const records = toImport.map((row) => importRowToPatient(row, batchId))
      const n = await importPatientsBatch(records)
      const skipped = allRows.length - toImport.length
      setResult(
        `Importati ${n} pazienti${skipped ? ` (${skipped} saltati: duplicati)` : ''}. ` +
          `Potrai adattare le colonne quando mi invii la struttura Excel definitiva.`,
      )
      setParsed(null)
      setPasteText('')
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore import')
    } finally {
      setImporting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Importa lista da Excel / foglio
      </button>
    )
  }

  return (
    <section className="import-panel">
      <header className="import-panel-head">
        <div>
          <h3>Importa lista pazienti da compilare</h3>
          <p className="hint">
            Carica il file Excel (primo foglio) o incolla righe da Google Sheet. Riconosciamo
            automaticamente SDO, Cognome, Nome; potrai affinare le colonne. Quando mi mandi come è
            organizzato il file definitivo, aggiorniamo il mapping.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)}>
          Chiudi
        </button>
      </header>

      <div className="import-sources">
        <label className="import-file">
          File .xlsx / .xls / .csv
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
        </label>
        <div className="import-paste">
          <label>
            Oppure incolla da Excel (righe con tab o punto e virgola)
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="SDO&#9;COGNOME&#9;NOME&#9;..."
            />
          </label>
          <button type="button" onClick={handlePaste}>
            Analizza testo incollato
          </button>
        </div>
      </div>

      {parsed && (
        <>
          <h4>Associa colonne</h4>
          <div className="import-mapping">
            {parsed.headers.map((h, i) => (
              <label key={i}>
                {h}
                <select
                  value={mapping[i] ?? 'skip'}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [i]: e.target.value as ImportField }))
                  }
                >
                  {Object.entries(FIELD_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {(dupes.duplicatesExisting.length > 0 || dupes.duplicatesInFile.length > 0) && (
            <p className="warn-msg">
              {dupes.duplicatesExisting.length > 0 &&
                `SDO già presenti (saltati): ${dupes.duplicatesExisting.slice(0, 5).join(', ')}${dupes.duplicatesExisting.length > 5 ? '…' : ''}. `}
              {dupes.duplicatesInFile.length > 0 &&
                `Duplicati nel file: ${dupes.duplicatesInFile.slice(0, 5).join(', ')}.`}
            </p>
          )}

          <h4>Anteprima ({allRows.length} pazienti)</h4>
          <div className="import-preview-wrap">
            <table className="import-preview">
              <thead>
                <tr>
                  <th>SDO</th>
                  <th>Cognome</th>
                  <th>Nome</th>
                  <th>ACC</th>
                  <th>ECMO</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.rowIndex}>
                    <td>{r.sdo || '—'}</td>
                    <td>{r.cognome}</td>
                    <td>{r.nome}</td>
                    <td>{r.acc === undefined ? '—' : r.acc ? 'Sì' : 'No'}</td>
                    <td>{r.ecmo === undefined ? '—' : r.ecmo ? 'Sì' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allRows.length > 8 && (
              <p className="hint">… e altri {allRows.length - 8} pazienti</p>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={importing || !allRows.length}
            onClick={handleImport}
          >
            {importing ? 'Importazione…' : `Importa ${allRows.length} pazienti su Firebase`}
          </button>
        </>
      )}

      {error && <p className="error-msg">{error}</p>}
      {result && <p className="ok-inline">{result}</p>}
    </section>
  )
}
