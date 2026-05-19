import type { PatientRecord } from '../types/canonical'

type Props = {
  record: PatientRecord
  onChange: (record: PatientRecord) => void
}

function num(v: string): number | undefined {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function PatientForm({ record, onChange }: Props) {
  const setCore = (patch: Partial<PatientRecord['core']>) =>
    onChange({ ...record, core: { ...record.core, ...patch }, updatedAt: new Date().toISOString() })

  const setEcmo = (patch: Partial<NonNullable<PatientRecord['ecmo']>>) =>
    onChange({
      ...record,
      ecmo: { attivo: true, ...record.ecmo, ...patch },
      updatedAt: new Date().toISOString(),
    })

  const setAcc = (patch: Partial<NonNullable<PatientRecord['acc']>>) =>
    onChange({
      ...record,
      acc: { attivo: true, ...record.acc, ...patch },
      updatedAt: new Date().toISOString(),
    })

  const setBg = (
    patch: Partial<NonNullable<NonNullable<PatientRecord['ecmoAssessment24h']>['bloodGas']>>,
  ) =>
    onChange({
      ...record,
      ecmoAssessment24h: {
        ...record.ecmoAssessment24h,
        bloodGas: { ...record.ecmoAssessment24h?.bloodGas, ...patch },
      },
      updatedAt: new Date().toISOString(),
    })

  const setVent = (
    patch: Partial<NonNullable<NonNullable<PatientRecord['ecmoAssessment24h']>['ventilation']>>,
  ) =>
    onChange({
      ...record,
      ecmoAssessment24h: {
        ...record.ecmoAssessment24h,
        ventilation: { ...record.ecmoAssessment24h?.ventilation, ...patch },
      },
      updatedAt: new Date().toISOString(),
    })

  const bg = record.ecmoAssessment24h?.bloodGas ?? {}

  return (
    <div className="form-grid">
      <section>
        <h2>Paziente (una sola volta)</h2>
        <div className="field-row">
          <label>
            SDO
            <input value={record.core.sdo} onChange={(e) => setCore({ sdo: e.target.value })} />
          </label>
          <label>
            Cognome
            <input
              value={record.core.cognome}
              onChange={(e) => setCore({ cognome: e.target.value })}
            />
          </label>
          <label>
            Nome
            <input value={record.core.nome} onChange={(e) => setCore({ nome: e.target.value })} />
          </label>
        </div>
        <div className="field-row">
          <label>
            Data nascita
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
          <label>
            Telefono
            <input
              value={record.core.telefono ?? ''}
              onChange={(e) => setCore({ telefono: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={record.core.email ?? ''}
              onChange={(e) => setCore({ email: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section>
        <h2>Studi attivi</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={record.ecmo?.attivo ?? false}
            onChange={(e) =>
              onChange({
                ...record,
                ecmo: { ...record.ecmo, attivo: e.target.checked },
                updatedAt: new Date().toISOString(),
              })
            }
          />
          ECMO / ELSO
        </label>
        {record.ecmo?.attivo && (
          <div className="field-row nested">
            <label>
              ECMO LENS
              <input
                value={record.ecmo?.ecmoLens ?? ''}
                onChange={(e) => setEcmo({ ecmoLens: e.target.value })}
              />
            </label>
            <label>
              N. ELSO
              <input
                value={record.ecmo?.numeroElso ?? ''}
                onChange={(e) => setEcmo({ numeroElso: e.target.value })}
              />
            </label>
            <label>
              Anno
              <input value={record.ecmo?.anno ?? ''} onChange={(e) => setEcmo({ anno: e.target.value })} />
            </label>
          </div>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={record.acc?.attivo ?? false}
            onChange={(e) =>
              onChange({
                ...record,
                acc: { ...record.acc, attivo: e.target.checked },
                accSheets: e.target.checked ? record.accSheets ?? {} : record.accSheets,
                updatedAt: new Date().toISOString(),
              })
            }
          />
          ACC (scheda completa nel tab ACC)
        </label>
        {record.acc?.attivo && (
          <div className="field-row nested">
            <label>
              Anno ACC
              <input value={record.acc?.anno ?? ''} onChange={(e) => setAcc({ anno: e.target.value })} />
            </label>
          </div>
        )}
      </section>

      {record.ecmo?.attivo && (
        <section>
          <h2>ECMO — gasometria 24h (sintesi)</h2>
          <p className="hint">Dettaglio completo ECMO in export; qui i campi principali condivisi.</p>
          <div className="field-row">
            <label>
              pH
              <input
                type="number"
                step="0.01"
                value={bg.ph ?? ''}
                onChange={(e) => setBg({ ph: num(e.target.value) })}
              />
            </label>
            <label>
              PaO₂
              <input
                type="number"
                value={bg.pao2 ?? ''}
                onChange={(e) => setBg({ pao2: num(e.target.value) })}
              />
            </label>
            <label>
              PaCO₂
              <input
                type="number"
                value={bg.paco2 ?? ''}
                onChange={(e) => setBg({ paco2: num(e.target.value) })}
              />
            </label>
            <label>
              Lattato
              <input
                type="number"
                value={bg.lactate ?? ''}
                onChange={(e) => setBg({ lactate: num(e.target.value) })}
              />
            </label>
            <label>
              PEEP
              <input
                type="number"
                value={record.ecmoAssessment24h?.ventilation?.peep ?? ''}
                onChange={(e) => setVent({ peep: num(e.target.value) })}
              />
            </label>
            <label>
              FiO₂
              <input
                type="number"
                value={record.ecmoAssessment24h?.ventilation?.fio2 ?? ''}
                onChange={(e) => setVent({ fio2: num(e.target.value) })}
              />
            </label>
          </div>
        </section>
      )}
    </div>
  )
}
