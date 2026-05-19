import type { ConflictChoice, FieldConflict } from '../types/ingest'

type Props = {
  conflicts: FieldConflict[]
  onResolve: (key: string, choice: ConflictChoice) => void
  onResolveAll: (choice: ConflictChoice) => void
  onClose: () => void
}

export function ConflictResolverModal({ conflicts, onResolve, onResolveAll, onClose }: Props) {
  if (!conflicts.length) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <h3>Valore già presente — quale tenere?</h3>
        <p className="hint">
          L’estrazione ha trovato dati diversi da quelli già salvati. Scegli per ogni campo.
        </p>
        <div className="conflict-actions-top">
          <button type="button" className="btn-secondary" onClick={() => onResolveAll('keep')}>
            Tieni tutti i valori attuali
          </button>
          <button type="button" className="btn-primary" onClick={() => onResolveAll('use_new')}>
            Usa tutti i nuovi
          </button>
        </div>
        <ul className="conflict-list">
          {conflicts.map((c) => (
            <li key={c.key} className="conflict-item">
              <div className="conflict-meta">
                <code>{c.dbTarget}</code>
                <span className="hint">({c.source === 'gemini' ? 'da IA' : 'da testo'})</span>
              </div>
              <div className="conflict-values">
                <div>
                  <span>Attuale</span>
                  <strong>{String(c.existingValue)}</strong>
                </div>
                <div>
                  <span>Nuovo</span>
                  <strong>{String(c.newValue)}</strong>
                </div>
              </div>
              <div className="conflict-btns">
                <button type="button" onClick={() => onResolve(c.key, 'keep')}>
                  Tieni attuale
                </button>
                <button type="button" className="btn-primary" onClick={() => onResolve(c.key, 'use_new')}>
                  Usa nuovo
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
