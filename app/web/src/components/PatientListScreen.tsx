import { useEffect, useMemo, useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  COMPLETE_THRESHOLD,
  deletePatientFromFirebase,
  subscribePatients,
  type PatientListItem,
} from '../lib/patientFirestore'
import { workflowLabel } from '../lib/workflow'
import { PatientImportPanel } from './PatientImportPanel'
import { PatientManualAddForm } from './PatientManualAddForm'

type Props = {
  selectedId: string | null
  onSelect: (record: PatientRecord) => void
  onNewPatient: (record: PatientRecord) => void
}

type FilterId = 'all' | 'todo' | 'in_progress' | 'complete'

function barColor(pct: number): string {
  if (pct >= COMPLETE_THRESHOLD) return '#0f766e'
  if (pct >= 40) return '#ca8a04'
  return '#dc2626'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusClass(status: PatientListItem['workflowStatus']): string {
  return `status-badge status-${status}`
}

export function PatientListScreen({ selectedId, onSelect, onNewPatient }: Props) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PatientListItem | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false)
      setError('Firebase non configurato — aggiungi VITE_FIREBASE_* in .env.local')
      return
    }

    setLoading(true)
    const unsub = subscribePatients(
      (list) => {
        setPatients(list)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  const stats = useMemo(() => {
    const todo = patients.filter((p) => p.workflowStatus === 'todo').length
    const inProgress = patients.filter((p) => p.workflowStatus === 'in_progress').length
    const complete = patients.filter((p) => p.workflowStatus === 'complete').length
    return { todo, inProgress, complete, total: patients.length }
  }, [patients])

  const filtered = useMemo(() => {
    if (filter === 'all') return patients
    return patients.filter((p) => p.workflowStatus === filter)
  }, [patients, filter])

  const existingSdos = useMemo(
    () => new Set(patients.map((p) => p.sdo.trim()).filter(Boolean)),
    [patients],
  )

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      await deletePatientFromFirebase(confirmDelete.id)
      setConfirmDelete(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione')
    } finally {
      setDeletingId(null)
    }
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className="patient-list empty">
        <h2>Elenco pazienti</h2>
        <p className="error-msg">
          Configura Firebase in <code>.env.local</code> (vedi <code>.env.example</code>) e pubblica
          l’app online (vedi <code>DEPLOY.md</code>) per usarla dall’ospedale.
        </p>
      </div>
    )
  }

  return (
    <div className="patient-list">
      <div className="patient-list-head">
        <div>
          <h2>Elenco pazienti</h2>
          <p className="hint">
            App online su Firebase: importa la lista da Excel, segui la progressione per ogni
            valutazione, riprendi quando vuoi dall’ospedale.
          </p>
        </div>
        <div className="patient-list-actions">
          <PatientImportPanel existingSdos={existingSdos} onImported={() => {}} />
        </div>
      </div>

      <PatientManualAddForm
        existingSdos={existingSdos}
        onCreated={(record, openSheet) => {
          if (openSheet) onNewPatient(record)
        }}
      />

      {stats.total > 0 && (
        <div className="patient-stats">
          <div className="stat-card">
            <strong>{stats.todo}</strong>
            <span>Da compilare</span>
          </div>
          <div className="stat-card in-progress">
            <strong>{stats.inProgress}</strong>
            <span>In corso</span>
          </div>
          <div className="stat-card complete">
            <strong>{stats.complete}</strong>
            <span>Completati</span>
          </div>
          <div className="stat-card total">
            <strong>{stats.total}</strong>
            <span>Totale</span>
          </div>
        </div>
      )}

      <div className="patient-filters" role="tablist">
        {(
          [
            ['all', `Tutti (${stats.total})`],
            ['todo', `Da fare (${stats.todo})`],
            ['in_progress', `In corso (${stats.inProgress})`],
            ['complete', `Completati (${stats.complete})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="hint">Caricamento…</p>}
      {error && (
        <div className="firebase-error-box">
          <p className="error-msg">{error}</p>
          {error.includes('Authentication') && (
            <ol className="hint setup-steps">
              <li>
                <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
                  Apri Console Firebase
                </a>{' '}
                → seleziona il tuo progetto
              </li>
              <li>
                Menu <strong>Authentication</strong> → pulsante <strong>Inizia</strong> (se compare)
              </li>
              <li>
                Scheda <strong>Metodi di accesso</strong> → <strong>Accesso anonimo</strong> →
                Abilita
              </li>
              <li>Ricarica questa pagina (F5)</li>
            </ol>
          )}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="hint">
          {filter === 'all'
            ? 'Nessun paziente. Importa una lista da Excel o crea un nuovo caso.'
            : 'Nessun paziente in questa categoria.'}
        </p>
      )}

      <ul className="patient-cards">
        {filtered.map((p) => {
          const selected = p.id === selectedId
          const expanded = expandedId === p.id
          return (
            <li key={p.id}>
              <article
                className={`patient-card ${selected ? 'selected' : ''} status-border-${p.workflowStatus}`}
              >
                <div className="patient-card-main">
                  <button type="button" className="patient-card-select" onClick={() => onSelect(p.record)}>
                    <div className="patient-card-title-row">
                      <strong>
                        {p.cognome || '—'} {p.nome || ''}
                      </strong>
                      <span className={statusClass(p.workflowStatus)}>{workflowLabel(p.workflowStatus)}</span>
                    </div>
                    <span className="patient-card-sdo">SDO {p.sdo || '—'}</span>
                    <span className="patient-card-studies">
                      {p.accActive && 'ACC '}
                      {p.ecmoActive && 'ECMO '}
                      {!p.accActive && !p.ecmoActive && 'Studi non ancora attivati'}
                    </span>
                    <span className="patient-card-date">Aggiornato: {formatDate(p.updatedAt)}</span>
                    <div className="progress-track card-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${p.completionPercent}%`,
                          background: barColor(p.completionPercent),
                        }}
                      />
                    </div>
                    <span className="patient-card-pct">{p.completionPercent}% — media valutazioni</span>
                  </button>
                </div>

                {p.completionBreakdown.length > 0 && (
                  <div className="patient-card-progress">
                    <button
                      type="button"
                      className="progress-toggle"
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                    >
                      {expanded ? 'Nascondi' : 'Mostra'} progressione per valutazione
                    </button>
                    {expanded && (
                      <ul className="mini-completion-list">
                        {p.completionBreakdown.map((c) => (
                          <li key={c.targetId}>
                            <span className="mini-label">{c.sheet}</span>
                            <div className="progress-track mini">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${c.percent}%`,
                                  background: barColor(c.percent),
                                }}
                              />
                            </div>
                            <span className="mini-pct" style={{ color: barColor(c.percent) }}>
                              {c.percent}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="patient-card-actions">
                  {p.workflowStatus === 'complete' && (
                    <span className="badge-complete">Completato — pronto per export</span>
                  )}
                  <button type="button" className="btn-primary" onClick={() => onSelect(p.record)}>
                    Apri paziente
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={deletingId === p.id}
                    onClick={() => setConfirmDelete(p)}
                  >
                    {deletingId === p.id ? 'Eliminazione…' : 'Elimina'}
                  </button>
                </div>
              </article>
            </li>
          )
        })}
      </ul>

      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Conferma eliminazione</h3>
            <p>
              Stai per eliminare <strong>definitivamente</strong> tutti i dati di{' '}
              <strong>
                {confirmDelete.cognome} {confirmDelete.nome}
              </strong>{' '}
              (SDO {confirmDelete.sdo}) dal cloud.
            </p>
            {confirmDelete.workflowStatus !== 'complete' && (
              <p className="warn-msg">
                Stato: {workflowLabel(confirmDelete.workflowStatus)} ({confirmDelete.completionPercent}
                %).
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Annulla
              </button>
              <button type="button" className="danger-btn" onClick={handleDelete}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
