import { useState } from 'react'
import type { EcmoRun, PatientRecord } from '../types/canonical'
import { parseDateParts } from '../lib/calculatedFields'
import { applyRecordOptimizations } from '../lib/recordOptimizations'

type Props = {
  record: PatientRecord
  onChange: (record: PatientRecord) => void
}

function num(v: string): number | undefined {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function PatientScreen({ record, onChange }: Props) {
  const [optimizeMsg, setOptimizeMsg] = useState<string | null>(null)

  const runOptimize = () => {
    const { record: opt, applied } = applyRecordOptimizations(record, { onlyEmpty: true })
    onChange(opt)
    setOptimizeMsg(
      applied.length
        ? `Ottimizzazione: ${applied.length} campi compilati o propagati (ANNO, BMI, P/F, identità…).`
        : 'Nessuna cella vuota da ottimizzare con i dati attuali.',
    )
    setTimeout(() => setOptimizeMsg(null), 5000)
  }

  const touch = (patch: Partial<PatientRecord>) =>
    onChange({ ...record, ...patch, updatedAt: new Date().toISOString() })

  const setCore = (patch: Partial<PatientRecord['core']>) =>
    touch({ core: { ...record.core, ...patch } })

  const runs = record.ecmoRuns?.length ? record.ecmoRuns : [{ runNumber: 1 }]

  const setRuns = (ecmoRuns: EcmoRun[]) => touch({ ecmoRuns })

  const addRun = () => {
    const next = Math.max(0, ...runs.map((r) => r.runNumber)) + 1
    setRuns([...runs, { runNumber: next }])
  }

  const updateRun = (runNumber: number, patch: Partial<EcmoRun>) => {
    setRuns(runs.map((r) => (r.runNumber === runNumber ? { ...r, ...patch } : r)))
  }

  const removeRun = (runNumber: number) => {
    if (runs.length <= 1) return
    setRuns(runs.filter((r) => r.runNumber !== runNumber))
  }

  const both = record.acc?.attivo && record.ecmo?.attivo

  return (
    <div className="patient-screen">
      <section>
        <h2>Paziente</h2>
        <p className="hint">
          Dati inseriti una volta; P.O.Z.Z.I. li propaga su tutti i fogli (SDO, ANNO, BMI, P/F…).
        </p>
        <div className="optimize-row">
          <button type="button" className="btn-secondary" onClick={runOptimize}>
            Ottimizza tutti i fogli (solo celle vuote)
          </button>
          {optimizeMsg && <p className="ok-inline">{optimizeMsg}</p>}
        </div>
        <div className="field-row">
          <label>
            SDO *
            <input
              required
              value={record.core.sdo}
              onChange={(e) => setCore({ sdo: e.target.value.trim() })}
            />
          </label>
          <label>
            Cognome *
            <input
              value={record.core.cognome}
              onChange={(e) => setCore({ cognome: e.target.value })}
            />
          </label>
          <label>
            Nome *
            <input value={record.core.nome} onChange={(e) => setCore({ nome: e.target.value })} />
          </label>
        </div>
        <div className="field-row">
          <label>
            Data di nascita
            <input
              type="date"
              value={record.core.dataNascita ?? ''}
              onChange={(e) => setCore({ dataNascita: e.target.value })}
            />
          </label>
          <label>
            Sesso
            <select
              value={record.core.sesso ?? ''}
              onChange={(e) => setCore({ sesso: e.target.value })}
            >
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
          <label>
            Peso (kg)
            <input
              type="number"
              value={record.core.pesoKg ?? ''}
              onChange={(e) => setCore({ pesoKg: num(e.target.value) })}
            />
          </label>
          <label>
            Altezza (cm)
            <input
              type="number"
              value={record.core.altezzaCm ?? ''}
              onChange={(e) => setCore({ altezzaCm: num(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="enrollment-box">
        <h2>Arruolamento studi</h2>
        <div className="enrollment-grid">
          <label className="checkbox card">
            <input
              type="checkbox"
              checked={record.acc?.attivo ?? false}
              onChange={(e) =>
                touch({
                  acc: { ...record.acc, attivo: e.target.checked, anno: record.acc?.anno },
                  accSheets: record.accSheets ?? {},
                })
              }
            />
            <span>
              <strong>Studio ACC</strong>
              <small>Arresto cardiaco — fogli Pre-H, PS, DAY 1–3, …</small>
            </span>
          </label>
          <label className="checkbox card">
            <input
              type="checkbox"
              checked={record.ecmo?.attivo ?? false}
              onChange={(e) =>
                touch({
                  ecmo: { ...record.ecmo, attivo: e.target.checked },
                  ecmoSheets: record.ecmoSheets ?? {},
                  ecmoRuns: record.ecmoRuns ?? [{ runNumber: 1 }],
                })
              }
            />
            <span>
              <strong>Studio ECMO / ELSO</strong>
              <small>Supporto meccanico — richiede numero RUN</small>
            </span>
          </label>
        </div>

        {both && (
          <p className="scenario-note">
            Paziente in <strong>entrambi</strong> gli studi: i campi con lo stesso nome (SDO, ANNO,
            ELSO, …) si copiano automaticamente tra i fogli ACC e ECMO quando salvi una scheda.
          </p>
        )}

        {record.acc?.attivo && (
          <div className="field-row nested">
            <label>
              Data arresto / inizio ACC
              <input
                type="date"
                value={record.acc?.dataArresto ?? ''}
                onChange={(e) => {
                  const dataArresto = e.target.value
                  const parts = parseDateParts(dataArresto)
                  const draft: PatientRecord = {
                    ...record,
                    acc: {
                      ...record.acc!,
                      attivo: true,
                      dataArresto,
                      anno: parts ? String(parts.y) : record.acc?.anno,
                    },
                    updatedAt: new Date().toISOString(),
                  }
                  const { record: opt } = applyRecordOptimizations(draft, { onlyEmpty: true })
                  onChange(opt)
                }}
              />
            </label>
            <label>
              Anno ACC
              <input
                value={record.acc?.anno ?? ''}
                onChange={(e) => touch({ acc: { ...record.acc!, attivo: true, anno: e.target.value } })}
              />
            </label>
          </div>
        )}
      </section>

      {record.ecmo?.attivo && (
        <section>
          <h2>ECMO — trattamenti (RUN)</h2>
          <p className="hint">
            Ogni cannulazione / nuovo supporto = un RUN. I dati estratti andranno sul foglio indicato con
            RUN = 1, 2, …
          </p>
          {runs.map((run) => (
            <div key={run.runNumber} className="run-card">
              <div className="run-card-head">
                <strong>RUN {run.runNumber}</strong>
                {runs.length > 1 && (
                  <button type="button" className="link-btn" onClick={() => removeRun(run.runNumber)}>
                    Rimuovi
                  </button>
                )}
              </div>
              <div className="field-row">
                <label>
                  Inizio data
                  <input
                    type="date"
                    value={run.startDate ?? ''}
                    onChange={(e) => updateRun(run.runNumber, { startDate: e.target.value })}
                  />
                </label>
                <label>
                  Inizio ora
                  <input
                    type="time"
                    value={run.startTime ?? ''}
                    onChange={(e) => updateRun(run.runNumber, { startTime: e.target.value })}
                  />
                </label>
                <label>
                  Fine data
                  <input
                    type="date"
                    value={run.endDate ?? ''}
                    onChange={(e) => updateRun(run.runNumber, { endDate: e.target.value })}
                  />
                </label>
                <label>
                  Modalità
                  <input
                    value={run.mode ?? ''}
                    onChange={(e) => updateRun(run.runNumber, { mode: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addRun}>
            + Aggiungi RUN (secondo ECMO)
          </button>
          <div className="field-row nested">
            <label>
              ECMO LENS
              <input
                value={record.ecmo?.ecmoLens ?? ''}
                onChange={(e) => touch({ ecmo: { ...record.ecmo!, attivo: true, ecmoLens: e.target.value } })}
              />
            </label>
            <label>
              N. ELSO
              <input
                value={record.ecmo?.numeroElso ?? ''}
                onChange={(e) =>
                  touch({ ecmo: { ...record.ecmo!, attivo: true, numeroElso: e.target.value } })
                }
              />
            </label>
            <label>
              Anno ECMO
              <input
                value={record.ecmo?.anno ?? ''}
                onChange={(e) => touch({ ecmo: { ...record.ecmo!, attivo: true, anno: e.target.value } })}
              />
            </label>
          </div>
        </section>
      )}
    </div>
  )
}
