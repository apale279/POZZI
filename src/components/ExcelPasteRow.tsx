import { useMemo, useState } from 'react'
import { buildExcelPasteRow } from '../lib/excelPasteRow'
import type { SheetCellValue } from '../lib/cellValueFormat'

type Props = {
  study: 'ecmo' | 'acc'
  sheet: string
  values: Map<string, SheetCellValue>
  ecmoRun?: number
}

export function ExcelPasteRow({ study, sheet, values, ecmoRun }: Props) {
  const [copied, setCopied] = useState(false)
  const { tsv, filled, total, columns, cells } = useMemo(
    () => buildExcelPasteRow(study, sheet, values, ecmoRun),
    [study, sheet, values, ecmoRun],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* fallback */
    }
  }

  return (
    <section className="excel-paste-section" aria-labelledby="excel-paste-title">
      <div className="excel-paste-head">
        <h2 id="excel-paste-title">Riga per Excel</h2>
        <p className="hint">
          {filled}/{total} celle nell’ordine del foglio <strong>{sheet}</strong> (
          {study.toUpperCase()}). Le intestazioni sotto sono solo anteprima: il pulsante copia{' '}
          <strong>solo i valori</strong> (separati da tab), pronti da incollare sulla riga dati del
          file Excel. I numeri sono senza unità di misura.
        </p>
      </div>

      <div
        className="excel-paste-preview-scroll"
        tabIndex={0}
        aria-label="Anteprima riga con intestazioni colonne"
      >
        <table className="excel-paste-preview">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} title={col}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cells.map((val, i) => (
                <td
                  key={columns[i]}
                  className={val ? '' : 'excel-paste-empty'}
                  title={val || undefined}
                >
                  {val || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="excel-paste-actions">
        <button type="button" className="btn-primary" onClick={copy} disabled={filled === 0}>
          {copied ? 'Copiato negli appunti' : 'Copia riga per Excel'}
        </button>
      </div>
    </section>
  )
}
