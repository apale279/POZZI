import { useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import { ACC_SHEET_ORDER } from '../lib/accSheets'
import { parseClinicalText, parsedToAccColumns, parsedToSharedBloodGas } from '../lib/textParse'

type Props = {
  record: PatientRecord
  onChange: (record: PatientRecord) => void
  /** Foglio ACC attualmente aperto (se in sezione ACC). */
  activeAccSheet?: string
}

type TargetMode = 'acc-sheet' | 'shared' | 'all-ega-sheets'

export function DataIngest({ record, onChange, activeAccSheet }: Props) {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<TargetMode>('acc-sheet')
  const [lastResult, setLastResult] = useState<string | null>(null)

  const applyParsed = () => {
    if (!text.trim()) {
      setLastResult('Incolla prima del testo da analizzare.')
      return
    }

    const { values, matched } = parseClinicalText(text)
    if (matched.length === 0) {
      setLastResult('Nessun valore riconosciuto. Prova con etichette tipo pH 7.32, PaO2 80, Lattato 2.1')
      return
    }

    const updated = { ...record, accSheets: { ...record.accSheets }, updatedAt: new Date().toISOString() }

    if (target === 'shared') {
      const bg = parsedToSharedBloodGas(values)
      const vent = {
        peep: typeof values.peep === 'number' ? values.peep : undefined,
        fio2: typeof values.fio2 === 'number' ? values.fio2 : undefined,
        tv: typeof values.tv === 'number' ? values.tv : undefined,
        rr: typeof values.rr === 'number' ? values.rr : undefined,
      }
      updated.ecmoAssessment24h = {
        ...record.ecmoAssessment24h,
        bloodGas: { ...record.ecmoAssessment24h?.bloodGas, ...bg },
        ventilation: { ...record.ecmoAssessment24h?.ventilation, ...vent },
      }
      setLastResult(`Aggiornata gasometria condivisa: ${matched.join(', ')}`)
    } else if (target === 'all-ega-sheets') {
      const egaSheets = ['Ammissione', '6 - 12H', 'DAY 1', 'DAY 2', 'DAY 3']
      for (const sheet of egaSheets) {
        const cols = parsedToAccColumns(values, sheet)
        if (Object.keys(cols).length) {
          updated.accSheets![sheet] = { ...updated.accSheets?.[sheet], ...cols }
        }
      }
      setLastResult(`Copiato su ${egaSheets.join(', ')}: ${matched.join(', ')}`)
    } else {
      const sheet = activeAccSheet ?? 'DAY 1'
      const cols = parsedToAccColumns(values, sheet)
      updated.accSheets![sheet] = { ...updated.accSheets?.[sheet], ...cols }
      setLastResult(`Foglio "${sheet}": ${matched.join(', ')}`)
    }

    onChange(updated)
  }

  return (
    <section className="data-ingest">
      <h2>Ingresso dati</h2>
      <p className="hint">
        Incolla gasometria, ventilazione o estratto da Innovian/Galileo. L’app estrae i valori
        (pH, PaO₂, lattato, …) e li inserisce nei campi scelti sotto.
      </p>

      <textarea
        className="ingest-textarea"
        rows={6}
        placeholder={'Esempio:\npH 7.28\nPaO2 72\nPaCO2 48\nLattato 4.2\nPEEP 8\nFiO2 0.6'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="field-row">
        <label>
          Applica a
          <select value={target} onChange={(e) => setTarget(e.target.value as TargetMode)}>
            <option value="acc-sheet">
              Foglio ACC corrente{activeAccSheet ? ` (${activeAccSheet})` : ' (DAY 1)'}
            </option>
            <option value="all-ega-sheets">Tutti i fogli con EGA (Ammissione → DAY 3)</option>
            <option value="shared">Gasometria condivisa (ECMO 24h + export)</option>
          </select>
        </label>
      </div>

      <div className="ingest-actions">
        <button type="button" className="primary" onClick={applyParsed}>
          Analizza e compila campi
        </button>
        <button type="button" onClick={() => setText('')}>
          Svuota
        </button>
      </div>

      {lastResult && <p className="ingest-result">{lastResult}</p>}

      <details className="ingest-screenshot">
        <summary>Screenshot (salvataggio locale — estrazione IA in arrivo)</summary>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setLastResult(`Immagine "${f.name}" ricevuta. Per ora incolla il testo copiato dallo screenshot.`)
          }}
        />
      </details>

      {record.acc?.attivo && (
        <p className="hint small">
          Fogli ACC: {ACC_SHEET_ORDER.join(' · ')}
        </p>
      )}
    </section>
  )
}
