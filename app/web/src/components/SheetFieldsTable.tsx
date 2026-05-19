import { absentConventionLabel, type AbsentValueConvention } from '../lib/excelColumnAnalysis'
import { formatCellValueForUi, type SheetCellValue } from '../lib/cellValueFormat'
import {
  isPropagationConfirmed,
  isPropagationSkipped,
} from '../lib/crossPropagateSession'
import { formatCrossDbLabel, type CrossDbTarget } from '../lib/crossDbLinks'
import { cellKey } from '../lib/workSession'

export type SheetFieldSource = 'empty' | 'extract' | 'manual' | 'saved' | 'propagated'

export interface SheetColumnRow {
  column: string
  value?: SheetCellValue
  source: SheetFieldSource
  crossDb: CrossDbTarget[]
  absentConvention?: AbsentValueConvention
  absentReason?: string
  allowedValuesHint?: string
}

type CrossDbItemState = 'pending' | 'confirmed' | 'skipped'

type Props = {
  rows: SheetColumnRow[]
  study: 'ecmo' | 'acc'
  sheet: string
  cells: Record<string, SheetCellValue>
  confirmedPropagations: Set<string>
  skippedPropagations: Set<string>
  onEdit: (column: string, value: string) => void
  onEditFocus: (column: string) => void
  onEditCommit: (column: string, value: string) => void
  onConfirmPropagate: (sourceColumn: string, value: SheetCellValue, target: CrossDbTarget) => void
  onSkipPropagate: (sourceColumn: string, target: CrossDbTarget) => void
  filter?: 'all' | 'missing' | 'filled'
}

function crossItemState(
  sourceKey: string,
  target: CrossDbTarget,
  confirmed: Set<string>,
  skipped: Set<string>,
): CrossDbItemState {
  if (isPropagationSkipped(sourceKey, target, skipped)) return 'skipped'
  if (isPropagationConfirmed(sourceKey, target, confirmed)) return 'confirmed'
  return 'pending'
}

export function SheetFieldsTable({
  rows,
  study,
  sheet,
  cells,
  confirmedPropagations,
  skippedPropagations,
  onEdit,
  onEditFocus,
  onEditCommit,
  onConfirmPropagate,
  onSkipPropagate,
  filter = 'all',
}: Props) {
  const filtered = rows.filter((r) => {
    const filled = r.value !== undefined && r.value !== null && r.value !== ''
    if (filter === 'missing') return !filled
    if (filter === 'filled') return filled
    return true
  })

  if (!filtered.length) {
    return <p className="hint">Nessun campo in questa vista.</p>
  }

  return (
    <div className="full-sheet-table-wrap">
      <table className="full-sheet-table sheet-fields-table">
        <thead>
          <tr>
            <th>Stato</th>
            <th>Colonna</th>
            <th>Valore</th>
            <th>Utile anche in — conferma obbligatoria</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const filled = r.value !== undefined && r.value !== null && r.value !== ''
            const hasCross = r.crossDb.length > 0
            const sourceKey = cellKey(study, sheet, r.column)

            return (
              <tr
                key={r.column}
                className={[
                  !filled ? 'row-missing' : '',
                  hasCross && filled ? 'row-cross-db' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td>
                  {!filled && <span className="badge-missing">Da compilare</span>}
                  {filled && <span className="badge-ok">OK</span>}
                  {!filled && hasCross && <span className="badge-linked">Condiviso</span>}
                </td>
                <td>
                  <code>{r.column}</code>
                  {r.absentConvention && (
                    <p className="hint absent-hint" title={r.absentReason}>
                      Se assente: <strong>{absentConventionLabel(r.absentConvention)}</strong>
                    </p>
                  )}
                  {r.allowedValuesHint && (
                    <p className="hint absent-hint" title={r.allowedValuesHint}>
                      Valori ammessi: {r.allowedValuesHint}
                    </p>
                  )}
                </td>
                <td>
                  <input
                    type="text"
                    className="sheet-cell-input"
                    value={filled ? formatCellValueForUi(r.value) : ''}
                    placeholder="—"
                    onFocus={() => onEditFocus(r.column)}
                    onChange={(e) => onEdit(r.column, e.target.value)}
                    onBlur={(e) => onEditCommit(r.column, e.target.value)}
                  />
                </td>
                <td className="cross-db-cell">
                  {hasCross ? (
                    <ul className="cross-db-list cross-db-list-actions">
                      {r.crossDb.map((t) => {
                        if (!filled) {
                          return (
                            <li key={`${t.study}:${t.sheet}:${t.column}`}>
                              {formatCrossDbLabel(t)}
                            </li>
                          )
                        }
                        const state = crossItemState(
                          sourceKey,
                          t,
                          confirmedPropagations,
                          skippedPropagations,
                        )
                        const targetKey = cellKey(t.study, t.sheet, t.column)
                        const existing = cells[targetKey]
                        const hasOther =
                          existing !== undefined &&
                          existing !== null &&
                          existing !== '' &&
                          String(existing) !== String(r.value)

                        return (
                          <li
                            key={`${t.study}:${t.sheet}:${t.column}`}
                            className={`cross-db-item cross-db-item-${state}`}
                          >
                            <span className="cross-db-label">{formatCrossDbLabel(t)}</span>
                            {state === 'pending' && (
                              <>
                                {hasOther && (
                                  <span className="hint cross-db-warn">
                                    Già presente: {formatCellValueForUi(existing)} — vuoi
                                    sostituire?
                                  </span>
                                )}
                                <span className="cross-db-actions">
                                  <button
                                    type="button"
                                    className="btn-cross-yes"
                                    onClick={() => onConfirmPropagate(r.column, r.value!, t)}
                                  >
                                    Sì, copia
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-cross-no"
                                    onClick={() => onSkipPropagate(r.column, t)}
                                  >
                                    No, non copiare
                                  </button>
                                </span>
                              </>
                            )}
                            {state === 'confirmed' && (
                              <span className="cross-db-done" title="Hai confermato la copia">
                                ✓ Copiato (confermato)
                              </span>
                            )}
                            {state === 'skipped' && (
                              <span className="hint cross-db-skipped">Non copiare (scelto da te)</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <span className="hint">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
