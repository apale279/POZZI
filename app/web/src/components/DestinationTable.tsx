import type { DestinationRow } from '../types/ingest'

type Props = {
  rows: DestinationRow[]
  title?: string
}

export function DestinationTable({ rows, title }: Props) {
  if (!rows.length) return null

  return (
    <div className="destination-table-wrap">
      {title && <h3>{title}</h3>}
      <p className="hint">
        Queste sono le celle esatte nei tuoi database (stesso nome foglio e colonna del file Excel /
        Google Sheet).
      </p>
      <table className="destination-table">
        <thead>
          <tr>
            <th>Parametro</th>
            <th>Valore</th>
            <th>Database</th>
            <th>Foglio</th>
            <th>Colonna Excel</th>
            <th>Destinazione completa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.parseKey}-${i}`} className={r.autoFilled ? 'row-auto' : 'row-parsed'}>
              <td>{r.parameter}</td>
              <td>
                <strong>{String(r.value)}</strong>
              </td>
              <td>{r.study}</td>
              <td>{r.sheet}</td>
              <td>
                <code>{r.column}</code>
              </td>
              <td>
                <code className="db-target">{r.dbTarget}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend">
        <span className="swatch parsed" /> Valore dal testo incollato &nbsp;
        <span className="swatch auto" /> Compilato da anagrafica / RUN
      </p>
    </div>
  )
}
