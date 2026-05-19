import type { SheetFieldRow } from '../types/ingest'
import { formatCrossDbLabel, type CrossDbTarget } from '../lib/crossDbLinks'
import { formatCellValueForUi } from '../lib/cellValueFormat'

type Props = {
  rows: SheetFieldRow[]
  onEdit: (key: string, value: string) => void
  filter?: 'all' | 'missing' | 'filled'
  crossDbForRow?: (row: SheetFieldRow) => CrossDbTarget[]
  bothStudies?: boolean
}

function rowKey(r: SheetFieldRow): string {
  return `${r.studyId}:${r.sheet}:${r.column}`
}

export function FullSheetTable({
  rows,
  onEdit,
  filter = 'all',
  crossDbForRow,
  bothStudies,
}: Props) {
  const filtered = rows.filter((r) => {
    const filled =
      r.displayValue !== undefined && r.displayValue !== null && r.displayValue !== ''
    if (filter === 'missing') return !filled
    if (filter === 'filled') return filled
    return true
  })

  if (!filtered.length) {
    return <p className="hint">Nessun campo in questa vista.</p>
  }

  return (
    <div className="full-sheet-table-wrap">
      <table className="full-sheet-table">
        <thead>
          <tr>
            <th>Stato</th>
            <th>Colonna</th>
            <th>Valore</th>
            {bothStudies && <th>Propagazione</th>}
            <th>Origine</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const filled =
              r.displayValue !== undefined && r.displayValue !== null && r.displayValue !== ''
            const changed =
              r.proposedValue !== undefined &&
              String(r.proposedValue) !== String(r.currentValue ?? '')
            const cross = crossDbForRow?.(r) ?? []
            const hasCross = cross.length > 0
            const crossActive = hasCross && filled

            return (
              <tr
                key={rowKey(r)}
                className={[
                  !filled ? 'row-missing' : '',
                  changed ? 'row-changed' : '',
                  r.source === 'calculated' ? 'row-calc' : '',
                  hasCross ? 'row-cross-db' : '',
                  crossActive ? 'row-cross-db-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td>
                  {!filled && <span className="badge-missing">Vuoto</span>}
                  {filled && changed && <span className="badge-changed">Modificato</span>}
                  {filled && !changed && <span className="badge-ok">OK</span>}
                  {hasCross && <span className="badge-linked">Comune</span>}
                </td>
                <td>
                  <code>{r.column}</code>
                  {r.fromExtraction && <span className="tag-extract">estrazione</span>}
                </td>
                <td>
                  <input
                    type="text"
                    className="sheet-cell-input"
                    value={r.displayValue === undefined ? '' : String(r.displayValue)}
                    placeholder="—"
                    onChange={(e) => onEdit(rowKey(r), e.target.value)}
                  />
                  {r.currentValue !== undefined &&
                    changed &&
                    String(r.currentValue) !== String(r.displayValue) && (
                      <span className="hint was">era: {formatCellValueForUi(r.currentValue)}</span>
                    )}
                </td>
                {bothStudies && (
                  <td className="cross-db-cell">
                    {hasCross ? (
                      <ul className="cross-db-list">
                        {cross.slice(0, 4).map((t) => (
                          <li key={`${t.study}:${t.sheet}:${t.column}`}>
                            {formatCrossDbLabel(t)}
                          </li>
                        ))}
                        {cross.length > 4 && <li className="hint">+{cross.length - 4} fogli…</li>}
                      </ul>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                )}
                <td className="source-cell">{sourceLabel(r.source)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function sourceLabel(s: SheetFieldRow['source']): string {
  switch (s) {
    case 'calculated':
      return 'Calcolato'
    case 'extract':
      return 'Estrazione'
    case 'manual':
      return 'Manuale'
    case 'existing':
      return 'Salvato'
    default:
      return '—'
  }
}
