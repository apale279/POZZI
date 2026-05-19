import { useState } from 'react'
import type { AccSheetValues, PatientRecord } from '../types/canonical'
import {
  ACC_SHEET_ORDER,
  accGroupLabel,
  getAccEditableColumns,
  groupAccColumn,
  isBooleanAccColumn,
  isNumericAccColumn,
  type AccFieldGroup,
} from '../lib/accSheets'
import { normalizeYesNoCellValue } from '../lib/cellValueFormat'

type Props = {
  record: PatientRecord
  onChange: (record: PatientRecord) => void
  onActiveSheetChange?: (sheet: string) => void
}

export function AccSheetForm({ record, onChange, onActiveSheetChange }: Props) {
  const [activeSheet, setActiveSheet] = useState<string>(ACC_SHEET_ORDER[0])

  const pickSheet = (sheet: string) => {
    setActiveSheet(sheet)
    onActiveSheetChange?.(sheet)
  }

  const sheetData = record.accSheets?.[activeSheet] ?? {}

  const setCell = (column: string, value: string | number | boolean | undefined) => {
    const nextSheet: AccSheetValues = { ...record.accSheets?.[activeSheet] }
    if (value === '' || value === undefined) {
      delete nextSheet[column]
    } else {
      nextSheet[column] = value
    }

    const patch: PatientRecord = {
      ...record,
      accSheets: { ...record.accSheets, [activeSheet]: nextSheet },
      updatedAt: new Date().toISOString(),
    }

    if (activeSheet === 'Anagrafica') {
      if (column === 'PESO' && typeof value === 'number') patch.core = { ...record.core, pesoKg: value }
      if (column === 'ALTEZZA ' && typeof value === 'number') patch.core = { ...record.core, altezzaCm: value }
      if (column === 'GENDER' && typeof value === 'string') patch.core = { ...record.core, sesso: value }
      if (column === 'DN' && typeof value === 'string') patch.core = { ...record.core, dataNascita: value }
      if (column === 'TEL' && typeof value === 'string') patch.core = { ...record.core, telefono: value }
      if (column === 'MAIL' && typeof value === 'string') patch.core = { ...record.core, email: value }
    }

    onChange(patch)
  }

  const columns = getAccEditableColumns(activeSheet)
  const byGroup = new Map<AccFieldGroup, string[]>()
  for (const col of columns) {
    const g = groupAccColumn(col)
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(col)
  }

  const groupOrder: AccFieldGroup[] = ['arrest', 'anamnesi', 'ega', 'lab', 'vent', 'neuro', 'outcome', 'altro']

  return (
    <div className="acc-panel">
      <h2>Studio ACC — tutti i fogli</h2>
      <p className="hint">
        Stessa struttura del Google Sheet / Excel: una scheda per Anamnesi, Pre-H, PS, Ammissione,
        6–12h, DAY 1–3, Outcome.
      </p>

      <nav className="sheet-tabs" role="tablist">
        {ACC_SHEET_ORDER.map((sheet) => {
          const hasData = Object.keys(record.accSheets?.[sheet] ?? {}).some(
            (k) => record.accSheets![sheet][k] !== '' && record.accSheets![sheet][k] !== undefined,
          )
          return (
            <button
              key={sheet}
              type="button"
              role="tab"
              aria-selected={activeSheet === sheet}
              className={activeSheet === sheet ? 'active' : ''}
              onClick={() => pickSheet(sheet)}
            >
              {sheet}
              {hasData ? ' •' : ''}
            </button>
          )
        })}
      </nav>

      <div className="sheet-identity">
        <span>SDO: {record.core.sdo || '—'}</span>
        <span>
          {record.core.cognome} {record.core.nome}
        </span>
        {record.acc?.anno && <span>Anno {record.acc.anno}</span>}
      </div>

      <div className="sheet-fields">
        {groupOrder.map((g) => {
          const cols = byGroup.get(g)
          if (!cols?.length) return null
          return (
            <details key={g} className="field-group" open={g === 'ega' || g === 'lab'}>
              <summary>{accGroupLabel(g)}</summary>
              <div className="field-row">
                {cols.map((col) => (
                  <FieldCell
                    key={col}
                    column={col}
                    value={sheetData[col]}
                    onChange={(v) => setCell(col, v)}
                  />
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function FieldCell({
  column,
  value,
  onChange,
}: {
  column: string
  value: string | number | boolean | undefined
  onChange: (v: string | number | boolean | undefined) => void
}) {
  if (isBooleanAccColumn(column)) {
    return (
      <label className="checkbox field-cell">
        <input
          type="checkbox"
          checked={normalizeYesNoCellValue(value) === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {column}
      </label>
    )
  }

  if (isNumericAccColumn(column)) {
    return (
      <label className="field-cell">
        {column}
        <input
          type="number"
          step="any"
          value={value === undefined || value === '' ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
        />
      </label>
    )
  }

  return (
    <label className="field-cell">
      {column}
      <input
        type="text"
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </label>
  )
}
