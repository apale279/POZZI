import sheetColumnsBase from '../data/sheet_columns.json'
import { filterSheetColumns } from './sheetColumns'

export type SheetSchema = { ecmo: Record<string, string[]>; acc: Record<string, string[]> }

const STORAGE_KEY = 'pozzi:sheet-schema'

let cached: SheetSchema | null = null

function normalizeSchema(schema: SheetSchema): SheetSchema {
  const out: SheetSchema = { ecmo: {}, acc: {} }
  for (const study of ['ecmo', 'acc'] as const) {
    for (const [sheet, cols] of Object.entries(schema[study])) {
      out[study][sheet] = filterSheetColumns(cols)
    }
  }
  return out
}

function loadOverride(): Partial<SheetSchema> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<SheetSchema>
  } catch {
    return null
  }
}

export function getSheetSchema(): SheetSchema {
  if (cached) return cached
  const base = normalizeSchema(sheetColumnsBase as SheetSchema)
  const override = loadOverride()
  if (!override) {
    cached = base
    return base
  }
  cached = normalizeSchema({
    ecmo: { ...base.ecmo, ...override.ecmo },
    acc: { ...base.acc, ...override.acc },
  })
  return cached
}

export function saveSheetSchemaOverride(partial: Partial<SheetSchema>): void {
  const current = loadOverride() ?? {}
  const next = {
    ecmo: { ...current.ecmo, ...partial.ecmo },
    acc: { ...current.acc, ...partial.acc },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  cached = null
}

export function clearSheetSchemaOverride(): void {
  localStorage.removeItem(STORAGE_KEY)
  cached = null
}

export function sheetSchemaSource(): 'builtin' | 'uploaded' {
  return loadOverride() ? 'uploaded' : 'builtin'
}

/** Fogli ECMO solo elenco valori ammessi — non compaiono nel menu laterale. */
const ECMO_NAV_HIDDEN = new Set(['TENDINE SLIM', 'TENDE SLIM'].map((s) => s.toUpperCase()))

/** Foglio tecnico Excel ACC — non usato in compilazione. */
const ACC_NAV_HIDDEN = new Set(['PIVOT'])

export function isSheetHiddenFromNav(study: 'ecmo' | 'acc', sheetName: string): boolean {
  const key = sheetName.trim().toUpperCase()
  if (study === 'ecmo') return ECMO_NAV_HIDDEN.has(key)
  return ACC_NAV_HIDDEN.has(key)
}

/** Tutti i fogli dello schema (anche lookup nascosti al menu). */
export function allSheets(study: 'ecmo' | 'acc'): string[] {
  return Object.keys(getSheetSchema()[study])
}

/** Fogli visibili nel menu e nella navigazione. */
export function orderedSheets(study: 'ecmo' | 'acc'): string[] {
  return allSheets(study).filter((name) => !isSheetHiddenFromNav(study, name))
}
