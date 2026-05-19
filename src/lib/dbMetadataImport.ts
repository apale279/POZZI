import {
  absentConventionLabel,
  analyzeWorkbookConventions,
  type AbsentValueConvention,
  type ColumnConventionEntry,
  type ColumnConventionMap,
} from './excelColumnAnalysis'
import type { FieldCatalogEntry, FieldHintsStore } from './fieldHints'
import { importDbFiles, sampleColumnValues } from './excelSchemaImport'
import type { SheetSchema } from './sheetSchema'
import { applyTendineSlimToEcmoKeys, parseTendineSlimAllowedValues } from './tendineSlimImport'

export type DbImportResult = {
  schema: SheetSchema
  schemaMsg: string
  samples: Record<string, string[]>
  conventions: ColumnConventionMap
  allowedValues: Record<string, string[]>
  tendineColumns: string[]
}

function conventionToDefault(convention: AbsentValueConvention): string {
  switch (convention) {
    case 'false':
      return 'FALSE'
    case 'zero':
      return '0'
    default:
      return ''
  }
}

/** Suggerisce predefinito da convenzione assente o valore più frequente nei campioni. */
export function inferDefaultFromSamples(
  samples: string[] | undefined,
  convention?: AbsentValueConvention,
): string {
  const fromConv = convention ? conventionToDefault(convention) : ''
  if (fromConv) return fromConv
  if (!samples?.length) return ''
  const counts = new Map<string, number>()
  for (const s of samples) {
    const k = s.trim()
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = v
    }
  }
  if (bestN >= 2 && bestN / samples.length >= 0.5) return best
  return ''
}

export async function importDbMetadata(
  accFile: File | null,
  ecmoFile: File | null,
): Promise<DbImportResult> {
  const schema = await importDbFiles(accFile, ecmoFile)
  const samples: Record<string, string[]> = {}
  if (accFile) Object.assign(samples, await sampleColumnValues(accFile))
  if (ecmoFile) Object.assign(samples, await sampleColumnValues(ecmoFile))

  let conventions: ColumnConventionMap = {}
  if (accFile) Object.assign(conventions, await analyzeWorkbookConventions(accFile, 'acc'))
  if (ecmoFile) Object.assign(conventions, await analyzeWorkbookConventions(ecmoFile, 'ecmo'))

  let allowedValues: Record<string, string[]> = {}
  let tendineColumns: string[] = []
  if (ecmoFile) {
    const tendine = await parseTendineSlimAllowedValues(ecmoFile)
    tendineColumns = Object.keys(tendine)
    allowedValues = applyTendineSlimToEcmoKeys(tendine)
  }

  const accN = Object.keys(schema.acc).length
  const ecmoN = Object.keys(schema.ecmo).length
  const convN = Object.keys(conventions).length
  const tendineNote =
    tendineColumns.length > 0
      ? ` Valori ammessi da TENDINE SLIM: ${tendineColumns.length} colonne.`
      : ecmoFile
        ? ' Foglio TENDINE SLIM non trovato nel file ECMO.'
        : ''

  return {
    schema,
    schemaMsg: `Struttura: ${accN} fogli ACC, ${ecmoN} fogli ECMO. Analisi assenza: ${convN} colonne.${tendineNote}`,
    samples,
    conventions,
    allowedValues,
    tendineColumns,
  }
}

export function conventionsForFirestore(
  map: ColumnConventionMap,
): FieldHintsStore['conventions'] {
  const out: FieldHintsStore['conventions'] = {}
  for (const [key, entry] of Object.entries(map)) {
    out[key] = { convention: entry.convention, reason: entry.reason }
  }
  return out
}

export function conventionsToColumnMap(
  conv: FieldHintsStore['conventions'],
): ColumnConventionMap {
  const out: ColumnConventionMap = {}
  for (const [key, v] of Object.entries(conv ?? {})) {
    const parts = key.split(':')
    if (parts.length < 3) continue
    const study = parts[0]
    if (study !== 'ecmo' && study !== 'acc') continue
    const column = parts[parts.length - 1]
    const sheet = parts.slice(1, -1).join(':')
    out[key] = {
      study,
      sheet,
      column,
      convention: v.convention,
      reason: v.reason,
      stats: { rows: 0, empty: 0, trueCount: 0, falseCount: 0, zeroCount: 0, other: 0 },
    } as ColumnConventionEntry
  }
  return out
}

/** Compila solo i predefiniti vuoti da campioni DB e regole «se assente». */
export function populateDefaultsFromDbAnalysis(
  store: FieldHintsStore,
  catalog: FieldCatalogEntry[],
  samples: Record<string, string[]>,
  options: { overwrite?: boolean } = {},
): { store: FieldHintsStore; filled: number } {
  const defaults = { ...store.defaults }
  let filled = 0
  for (const entry of catalog) {
    if (!options.overwrite && defaults[entry.key]?.trim()) continue
    const sampleKey = `${entry.sheet}:${entry.column}`
    const conv =
      store.conventions[entry.key] ??
      undefined
    const inferred = inferDefaultFromSamples(samples[sampleKey], conv?.convention)
    if (!inferred) continue
    defaults[entry.key] = inferred
    filled++
  }
  return {
    store: { ...store, defaults },
    filled,
  }
}

export function mergeImportIntoFieldHints(
  store: FieldHintsStore,
  catalog: FieldCatalogEntry[],
  importResult: DbImportResult,
): FieldHintsStore {
  const hints = { ...store.hints }
  const allowedValues = { ...store.allowedValues, ...importResult.allowedValues }
  const conventions = {
    ...store.conventions,
    ...conventionsForFirestore(importResult.conventions),
  }

  for (const entry of catalog) {
    const conv = importResult.conventions[entry.key]
    if (conv && !hints[entry.key]?.trim()) {
      hints[entry.key] =
        `Se non trovato nel referto: lasciare vuoto (non usare ${absentConventionLabel(conv.convention)} automaticamente). ${conv.reason}`
    }
  }

  return {
    ...store,
    hints,
    allowedValues,
    conventions,
    updatedAt: new Date().toISOString(),
  }
}
