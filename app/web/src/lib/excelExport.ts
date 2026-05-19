import * as XLSX from 'xlsx'
import type { PatientRecord } from '../types/canonical'
import type { StudyExport } from './schemas'
import { getSheetColumns } from './schemas'
import { ACC_SHEET_ORDER } from './accSheets'
import {
  collectValuesForSheet,
  type ExportBridgeContext,
} from './fieldBridge'

export interface SheetExportRow {
  study: StudyExport
  sheet: string
  columns: string[]
  values: (string | number | boolean | null)[]
  /** Oggetto colonna → valore per anteprima */
  cells: Record<string, unknown>
}

export interface ExportBundle {
  generatedAt: string
  patientLabel: string
  rows: SheetExportRow[]
}

function formatCell(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v
  return v as string | number
}

function applyEcmoIdentity(
  sheet: string,
  record: PatientRecord,
  ctx: ExportBridgeContext,
): Record<string, unknown> {
  const run = ctx.ecmoRunNumber ?? record.ecmoRuns?.[0]?.runNumber ?? 1
  const e = record.ecmo
  const base: Record<string, unknown> = {
    'ECMO LENS': e?.ecmoLens,
    ELSO: e?.numeroElso,
    ANNO: e?.anno,
    RUN: run,
  }
  if (sheet === 'ANAGRAFICA') {
    return {
      ...base,
      SEX: record.core.sesso,
      PESO: record.core.pesoKg,
      ALTEZZA: record.core.altezzaCm,
      DN: record.core.dataNascita,
      'NUMERO ELSO': e?.numeroElso,
      DIAGNOSI: e?.diagnosi,
      TEL: record.core.telefono,
      MAIL: record.core.email,
      'DATA INGRESSO H': e?.dataIngressoOspedale,
      'ORA INGRESSO H': e?.oraIngressoOspedale,
      'DATA INGRESSO ICU': e?.dataIngressoIcu,
      'ORA INGRESSO ICU': e?.oraIngressoIcu,
    }
  }
  if (sheet === 'RUN') {
    const r = record.ecmoRuns?.find((x) => x.runNumber === run) ?? record.ecmoRuns?.[0]
    return {
      ...base,
      'START DATE': r?.startDate,
      'START TIME': r?.startTime,
      'END DATE': r?.endDate,
      'END TIME': r?.endTime,
      MODE: r?.mode,
    }
  }
  return base
}

function applyAccIdentity(record: PatientRecord): Record<string, unknown> {
  return {
    ANNO: record.acc?.anno,
    DN: record.core.dataNascita,
    GENDER: record.core.sesso,
    PESO: record.core.pesoKg,
    'ALTEZZA ': record.core.altezzaCm,
    TEL: record.core.telefono,
    MAIL: record.core.email,
  }
}

/** Costruisce una riga nell'ordine esatto delle colonne del foglio Excel originale. */
export function buildSheetRow(
  study: StudyExport,
  sheet: string,
  record: PatientRecord,
  ctx: ExportBridgeContext = {},
): SheetExportRow {
  const columns = getSheetColumns(study, sheet)
  const cells: Record<string, unknown> = {}

  if (study === 'ecmo') {
    Object.assign(cells, applyEcmoIdentity(sheet, record, ctx))
  } else {
    Object.assign(cells, applyAccIdentity(record))
  }

  Object.assign(cells, collectValuesForSheet(study, sheet, record, ctx))

  if (study === 'acc' && record.accSheets?.[sheet]) {
    Object.assign(cells, record.accSheets[sheet])
  }
  if (study === 'ecmo' && record.ecmoSheets?.[sheet]) {
    Object.assign(cells, record.ecmoSheets[sheet])
  }

  const values = columns.map((col) => formatCell(cells[col]))

  return { study, sheet, columns, values, cells }
}

export type ExportPlan = {
  study: StudyExport
  sheet: string
  ctx?: ExportBridgeContext
}[]

/** Piano export predefinito in base agli studi attivi del paziente. */
export function defaultExportPlan(record: PatientRecord): ExportPlan {
  const plan: ExportPlan = []
  if (record.ecmo?.attivo) {
    const run = record.ecmoRuns?.[0]?.runNumber ?? 1
    const ctx = { ecmoRunNumber: run }
    plan.push(
      { study: 'ecmo', sheet: 'ANAGRAFICA' },
      { study: 'ecmo', sheet: 'RUN', ctx },
      { study: 'ecmo', sheet: '24HRS ECLS ASSESSMENT', ctx },
    )
    if (record.outcome) {
      plan.push({ study: 'ecmo', sheet: 'OUTCOME', ctx })
    }
  }
  if (record.acc?.attivo) {
    for (const sheet of ACC_SHEET_ORDER) {
      plan.push({ study: 'acc', sheet })
    }
  }
  return plan
}

export function buildExportBundle(
  record: PatientRecord,
  plan: ExportPlan = defaultExportPlan(record),
): ExportBundle {
  const rows = plan.map(({ study, sheet, ctx }) =>
    buildSheetRow(study, sheet, record, ctx ?? {}),
  )
  return {
    generatedAt: new Date().toISOString(),
    patientLabel: record.id,
    rows,
  }
}

/** TSV: una riga pronta per incollare in Excel (stesso ordine colonne). */
export function rowToTsv(row: SheetExportRow): string {
  return row.values
    .map((v) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return s.includes('\t') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    })
    .join('\t')
}

/** Intestazione + riga per incollare sotto le colonne esistenti. */
export function rowToTsvWithHeader(row: SheetExportRow): string {
  return `${row.columns.join('\t')}\n${rowToTsv(row)}`
}

export async function copyRowToClipboard(row: SheetExportRow, includeHeader = false): Promise<void> {
  const text = includeHeader ? rowToTsvWithHeader(row) : rowToTsv(row)
  await navigator.clipboard.writeText(text)
}

/** Scarica un .xlsx con un foglio per ogni riga del piano (solo righe nuove). */
export function downloadExportWorkbook(bundle: ExportBundle, filename?: string): void {
  const wb = XLSX.utils.book_new()
  for (const row of bundle.rows) {
    const ws = XLSX.utils.aoa_to_sheet([row.columns, row.values])
    const safeName = row.sheet.slice(0, 31).replace(/[\\/?*[\]]/g, '_')
    const prefix = row.study === 'ecmo' ? 'E' : 'A'
    XLSX.utils.book_append_sheet(wb, ws, `${prefix}_${safeName}`.slice(0, 31))
  }
  const name =
    filename ??
    `export_${bundle.patientLabel.replace(/[^\w.-]+/g, '_')}_${bundle.generatedAt.slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, name)
}

/** CSV singolo foglio (alternativa leggera). */
export function downloadSheetCsv(row: SheetExportRow): void {
  const lines = [row.columns.join(';'), row.values.map((v) => (v == null ? '' : String(v))).join(';')]
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${row.study}_${row.sheet.replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
