import { useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import { createEmptyRecord } from '../lib/demoRecord'
import { createPatientInFirebase } from '../lib/patientFirestore'

type Props = {
  existingSdos: Set<string>
  onCreated: (record: PatientRecord, openSheet: boolean) => void
}

export function PatientManualAddForm({ existingSdos, onCreated }: Props) {
  const [sdo, setSdo] = useState('')
  const [cognome, setCognome] = useState('')
  const [nome, setNome] = useState('')
  const [acc, setAcc] = useState(false)
  const [ecmo, setEcmo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const reset = () => {
    setSdo('')
    setCognome('')
    setNome('')
    setAcc(false)
    setEcmo(false)
  }

  const buildRecord = (): PatientRecord => {
    const record = createEmptyRecord()
    record.core = {
      sdo: sdo.trim(),
      cognome: cognome.trim(),
      nome: nome.trim(),
    }
    record.acc = { attivo: acc }
    record.ecmo = { attivo: ecmo }
    record.workflowStatus = 'todo'
    return record
  }

  const validate = (): string | null => {
    if (!sdo.trim() && !cognome.trim()) {
      return 'Inserisci almeno lo SDO o il cognome.'
    }
    if (sdo.trim() && existingSdos.has(sdo.trim())) {
      return `SDO ${sdo.trim()} già presente in elenco.`
    }
    return null
  }

  const handleSubmit = async (openSheet: boolean) => {
    const err = validate()
    if (err) {
      setError(err)
      setOk(null)
      return
    }
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const record = buildRecord()
      await createPatientInFirebase(record)
      reset()
      setOk(`Paziente ${record.core.cognome || record.core.sdo} salvato.`)
      onCreated(record, openSheet)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="manual-add-panel">
      <h3>Inserisci paziente a mano</h3>
      <p className="hint">I dati vengono salvati subito. Puoi compilare il resto dopo.</p>
      <form
        className="manual-add-form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit(false)
        }}
      >
        <div className="field-row">
          <label>
            SDO
            <input value={sdo} onChange={(e) => setSdo(e.target.value)} placeholder="es. 202512345" />
          </label>
          <label>
            Cognome
            <input value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </label>
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="checkbox">
            <input type="checkbox" checked={acc} onChange={(e) => setAcc(e.target.checked)} />
            Studio ACC
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={ecmo} onChange={(e) => setEcmo(e.target.checked)} />
            Studio ECMO
          </label>
        </div>
        <div className="manual-add-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => void handleSubmit(true)}
          >
            Salva e apri scheda
          </button>
        </div>
      </form>
      {error && <p className="error-msg">{error}</p>}
      {ok && <p className="ok-inline">{ok}</p>}
    </section>
  )
}
