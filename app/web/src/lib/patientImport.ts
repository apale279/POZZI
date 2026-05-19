import * as XLSX from 'xlsx'
import type { PatientRecord } from '../types/canonical'
import { createEmptyRecord } from './demoRecord'

export type ImportField =
  | 'sdo'
  | 'cognome'
  | 'nome'
  | 'dataNascita'
  | 'sesso'
  | 'acc'
  | 'ecmo'
  | 'note'
  | 'skip'

export interface ImportRow {
  rowIndex: number
  sdo: string
  cognome: string
  nome: string
  dataNascita?: string
  sesso?: string
  acc?: boolean
  ecmo?: boolean
  note?: string
  raw: Record<string, string>
}

export interface ParsedImportSheet {
  headers: string[]
  rows: string[][]
  suggestedMapping: Record<number, ImportField>
}

const ALIASES: Record<ImportField, string[]> = {
  sdo: ['sdo', 'nosdo', 'n° sdo', 'n sdo', 'numero sdo', 'id paziente', 'id'],
  cognome: ['cognome', 'surname', 'last name', 'lastname'],
  nome: ['nome', 'name', 'first name', 'firstname'],
  dataNascita: ['dn', 'data nascita', 'datanascita', 'nascita', 'birth'],
  sesso: ['sex', 'sesso', 'genere', 'm/f'],
  acc: ['acc', 'arresto', 'studio acc'],
  ecmo: ['ecmo', 'studio ecmo', 'venoarteriosa'],
  note: ['note', 'commenti', 'osservazioni'],
  skip: [],
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function guessField(header: string): ImportField {
  const n = normHeader(header)
  if (!n) return 'skip'
  for (const [field, list] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    if (field === 'skip') continue
    if (list.some((a) => n === a || n.includes(a))) return field
  }
  return 'skip'
}

function cellStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function parseBool(v: string): boolean | undefined {
  const n = v.trim().toLowerCase()
  if (!n) return undefined
  if (['1', 'si', 'sì', 's', 'yes', 'y', 'true', 'x'].includes(n)) return true
  if (['0', 'no', 'n', 'false'].includes(n)) return false
  return undefined
}

/** Prima riga con almeno 2 intestazioni riconosciute = header. */
function findHeaderRow(rows: string[][]): number {
  let best = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const score = rows[i].filter((c) => guessField(c) !== 'skip').length
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return bestScore >= 2 ? best : 0
}

export function parseTableRows(rows: string[][]): ParsedImportSheet {
  const headerIdx = findHeaderRow(rows)
  const headers = rows[headerIdx].map((h, i) => cellStr(h) || `Colonna ${i + 1}`)
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => cellStr(c)))

  const suggestedMapping: Record<number, ImportField> = {}
  headers.forEach((h, i) => {
    suggestedMapping[i] = guessField(h)
  })

  return { headers, rows: dataRows, suggestedMapping }
}

export function parseExcelFile(file: ArrayBuffer): ParsedImportSheet {
  const wb = XLSX.read(file, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  const rows = raw.map((r) => r.map(cellStr))
  return parseTableRows(rows)
}

export function parseTsvPaste(text: string): ParsedImportSheet {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const rows = lines.map((line) => line.split(/\t|;/).map((c) => c.trim()))
  return parseTableRows(rows)
}

export function buildImportRows(
  parsed: ParsedImportSheet,
  mapping: Record<number, ImportField>,
): ImportRow[] {
  const col = (field: ImportField): number | undefined => {
    const idx = Object.entries(mapping).find(([, f]) => f === field)?.[0]
    return idx !== undefined ? Number(idx) : undefined
  }

  const iSdo = col('sdo')
  const iCognome = col('cognome')
  const iNome = col('nome')
  const iDn = col('dataNascita')
  const iSex = col('sesso')
  const iAcc = col('acc')
  const iEcmo = col('ecmo')
  const iNote = col('note')

  const out: ImportRow[] = []
  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r]
    const get = (i: number | undefined) => (i === undefined ? '' : cellStr(row[i]))
    const sdo = get(iSdo)
    const cognome = get(iCognome)
    const nome = get(iNome)
    if (!sdo && !cognome && !nome) continue

    const raw: Record<string, string> = {}
    parsed.headers.forEach((h, i) => {
      raw[h] = get(i)
    })

    out.push({
      rowIndex: r + 2,
      sdo,
      cognome,
      nome,
      dataNascita: get(iDn) || undefined,
      sesso: get(iSex) || undefined,
      acc: parseBool(get(iAcc)),
      ecmo: parseBool(get(iEcmo)),
      note: get(iNote) || undefined,
      raw,
    })
  }
  return out
}

export function importRowToPatient(
  row: ImportRow,
  batchId: string,
): PatientRecord {
  const record = createEmptyRecord()
  record.core = {
    sdo: row.sdo,
    cognome: row.cognome,
    nome: row.nome,
    dataNascita: row.dataNascita,
    sesso: row.sesso,
  }
  record.acc = { attivo: row.acc ?? false }
  record.ecmo = { attivo: row.ecmo ?? false }
  record.importMeta = {
    batchId,
    importedAt: new Date().toISOString(),
    sourceRow: row.rowIndex,
    note: row.note,
  }
  record.workflowStatus = 'todo'
  return record
}

export function findDuplicateSdos(
  rows: ImportRow[],
  existingSdos: Set<string>,
): { duplicatesInFile: string[]; duplicatesExisting: string[] } {
  const seen = new Set<string>()
  const duplicatesInFile: string[] = []
  const duplicatesExisting: string[] = []

  for (const row of rows) {
    const sdo = row.sdo.trim()
    if (!sdo) continue
    if (seen.has(sdo)) duplicatesInFile.push(sdo)
    else seen.add(sdo)
    if (existingSdos.has(sdo)) duplicatesExisting.push(sdo)
  }
  return { duplicatesInFile, duplicatesExisting }
}
