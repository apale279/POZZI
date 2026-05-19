import { getTargetById } from './ingestConfig'
import { getSheetColumnsList } from './completion'
import { absentConventionLabel, type AbsentValueConvention } from './excelColumnAnalysis'
import { orderedSheets } from './sheetSchema'
import { resolveWrites } from './targetWrites'

const STORAGE_KEY = 'pozzi:field-hints'

export interface FieldCatalogEntry {
  key: string
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
}

export interface FieldConventionStored {
  convention: AbsentValueConvention
  reason: string
}

export interface FieldHintsStore {
  hints: Record<string, string>
  defaults: Record<string, string>
  aiGenerated: Record<string, boolean>
  /** Predefinito generato da IA (vs inserito a mano o da DB). */
  defaultsAiGenerated: Record<string, boolean>
  /** Valori ammessi (es. da foglio TENDINE SLIM ECMO). */
  allowedValues: Record<string, string[]>
  /** Regole vuoto/FALSE/0 da analisi Excel, sincronizzate su Firebase. */
  conventions: Record<string, FieldConventionStored>
  updatedAt: string
}

/** Suggerimenti predefiniti (modificabili in Impostazioni). */
const DEFAULT_HINTS: Record<string, string> = {
  'acc:Anamnesi:ACEi':
    'Il paziente era in terapia con farmaci ACE-inibitori? (TRUE=sì, FALSE=no; lascia vuoto se non detto)',
  'acc:Anamnesi:ARB':
    'Terapia con antagonisti dei recettori dell’angiotensina II? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:BETABLOCK': 'Terapia con beta-bloccanti? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:AED': 'Terapia antiepilettica? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:P2Y12': 'Terapia antiaggregante P2Y12 (clopidogrel/ticagrelor ecc.)? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:IMMUNOSOP': 'Terapia immunosoppressiva? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:PRIOR MI': 'Pregresso infarto miocardico? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:CHF': 'Scompenso cardiaco congestizio in anamnesi? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:IRC': 'Insufficienza renale cronica? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:DIABETE': 'Diabete mellito? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:COPD': 'BPCO / malattia polmonare ostruttiva cronica? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:SMOKE': 'Fumatore attivo o ex-fumatore? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:ILLICIT DRUG': 'Uso di sostanze stupefacenti? (TRUE=sì, FALSE=no)',
  'acc:Anamnesi:LIVE ALONE': 'Vive da solo/a? (TRUE=sì, FALSE=no)',
}

export function fieldHintKey(study: 'ecmo' | 'acc', sheet: string, column: string): string {
  return `${study}:${sheet}:${column}`
}

export function parseFieldHintKey(key: string): FieldCatalogEntry | null {
  const parts = key.split(':')
  if (parts.length < 3) return null
  const study = parts[0]
  if (study !== 'ecmo' && study !== 'acc') return null
  const sheet = parts.slice(1, -1).join(':')
  const column = parts[parts.length - 1]
  return { key, study, sheet, column }
}

/** Catalogo in ordine Excel: studio → foglio → colonna A→ */
export function buildFieldCatalog(): FieldCatalogEntry[] {
  const out: FieldCatalogEntry[] = []

  for (const study of ['ecmo', 'acc'] as const) {
    for (const sheet of orderedSheets(study)) {
      for (const column of getSheetColumnsList(study, sheet)) {
        const key = fieldHintKey(study, sheet, column)
        out.push({ key, study, sheet, column })
      }
    }
  }

  return out
}

/** Unisce hint senza cancellare testi locali con stringhe vuote da Firebase. */
export function mergeHintRecords(
  local: Record<string, string>,
  remote: Record<string, string> | undefined,
): Record<string, string> {
  const out = { ...local }
  if (!remote) return out
  for (const [k, v] of Object.entries(remote)) {
    const t = String(v ?? '').trim()
    if (t) out[k] = t
  }
  return out
}

export function normalizeFieldHintsStore(parsed: Partial<FieldHintsStore>): FieldHintsStore {
  const hints: Record<string, string> = { ...DEFAULT_HINTS }
  for (const [k, v] of Object.entries(parsed.hints ?? {})) {
    const t = String(v ?? '').trim()
    if (t) hints[k] = t
    else if (!(k in DEFAULT_HINTS)) hints[k] = ''
  }
  return {
    hints,
    defaults: { ...parsed.defaults },
    aiGenerated: { ...parsed.aiGenerated },
    defaultsAiGenerated: { ...parsed.defaultsAiGenerated },
    allowedValues: { ...parsed.allowedValues },
    conventions: { ...parsed.conventions },
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  }
}

export function loadFieldHints(): FieldHintsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return normalizeFieldHintsStore(JSON.parse(raw) as FieldHintsStore)
    }
  } catch {
    /* ignore */
  }
  return normalizeFieldHintsStore({})
}

export function saveFieldHints(store: FieldHintsStore): void {
  const payload = normalizeFieldHintsStore({
    ...store,
    updatedAt: new Date().toISOString(),
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pozzi:field-hints-updated'))
  }
}

export function getHint(store: FieldHintsStore, entry: FieldCatalogEntry): string {
  return store.hints[entry.key] ?? ''
}

/** Testo mostrato in tabella / Impostazioni: cosa l’IA è istruita a capire per la colonna. */
export function getFieldAiInterpretation(
  store: FieldHintsStore,
  study: 'ecmo' | 'acc',
  sheet: string,
  column: string,
): string {
  const entry: FieldCatalogEntry = { key: fieldHintKey(study, sheet, column), study, sheet, column }
  const hint = getHint(store, entry).trim()
  if (hint) return hint

  const allowed = getAllowedValues(store, entry)
  if (allowed.length) {
    return `Valori ammessi (DB / TENDINE SLIM): ${formatAllowedValuesList(allowed)}. Estrarre solo se presenti nel documento.`
  }

  const conv = getStoredConvention(store, entry)
  if (conv) {
    const reason = conv.reason?.trim()
    return `Se assente nel documento: ${absentConventionLabel(conv.convention)}.${reason ? ` ${reason}` : ''}`
  }

  return 'Nessuna definizione in Impostazioni — l’IA usa solo il nome colonna e le regole generali di estrazione.'
}

export function getDefault(store: FieldHintsStore, entry: FieldCatalogEntry): string {
  const v = store.defaults[entry.key]
  return v === undefined ? '' : String(v)
}

export function isAiGenerated(store: FieldHintsStore, entry: FieldCatalogEntry): boolean {
  return !!store.aiGenerated[entry.key]
}

export function isDefaultAiGenerated(store: FieldHintsStore, entry: FieldCatalogEntry): boolean {
  return !!store.defaultsAiGenerated[entry.key]
}

export function getAllowedValues(store: FieldHintsStore, entry: FieldCatalogEntry): string[] {
  return store.allowedValues[entry.key] ?? []
}

export function getStoredConvention(
  store: FieldHintsStore,
  entry: FieldCatalogEntry,
): FieldConventionStored | undefined {
  return store.conventions[entry.key]
}

export function formatAllowedValuesList(values: string[]): string {
  if (!values.length) return ''
  if (values.length <= 8) return values.join('; ')
  return `${values.slice(0, 8).join('; ')} … (+${values.length - 8})`
}

export function hintsForTarget(
  targetId: string,
  store: FieldHintsStore,
): { column: string; sheet: string; study: 'ecmo' | 'acc'; hint: string }[] {
  const target = getTargetById(targetId)
  if (!target) return []

  const out: { column: string; sheet: string; study: 'ecmo' | 'acc'; hint: string }[] = []
  const seen = new Set<string>()

  for (const w of resolveWrites(target)) {
    for (const column of getSheetColumnsList(w.study, w.sheet)) {
      const key = fieldHintKey(w.study, w.sheet, column)
      if (seen.has(key)) continue
      const hint = store.hints[key]?.trim()
      if (!hint) continue
      seen.add(key)
      out.push({ column, sheet: w.sheet, study: w.study, hint })
    }
  }
  return out
}

export function defaultsForTarget(
  targetId: string,
  store: FieldHintsStore,
): Map<string, string> {
  const target = getTargetById(targetId)
  const out = new Map<string, string>()
  if (!target) return out

  for (const w of resolveWrites(target)) {
    for (const column of getSheetColumnsList(w.study, w.sheet)) {
      const key = fieldHintKey(w.study, w.sheet, column)
      const def = store.defaults[key]
      if (def !== undefined && def !== '') out.set(key, def)
    }
  }
  return out
}

export function allHintsWithText(store: FieldHintsStore): { key: string; column: string; hint: string }[] {
  return buildFieldCatalog()
    .map((e) => ({ key: e.key, column: e.column, hint: store.hints[e.key]?.trim() ?? '' }))
    .filter((x) => x.hint.length > 0)
}

export function buildFieldHintsPromptBlockForSheet(
  study: 'ecmo' | 'acc',
  sheet: string,
  store: FieldHintsStore,
): string {
  const lines: string[] = []
  for (const column of getSheetColumnsList(study, sheet)) {
    const key = fieldHintKey(study, sheet, column)
    const entry = { key, study, sheet, column }
    const hint = store.hints[key]?.trim()
    const allowed = getAllowedValues(store, entry)
    const allowedPart = allowed.length
      ? ` Valori ammessi (TENDINE SLIM / DB): ${formatAllowedValuesList(allowed)}.`
      : ''
    if (hint) {
      lines.push(`- Colonna "${column}": ${hint}${allowedPart} Se non trovato nel testo: ometti (lascia vuoto).`)
    } else if (allowed.length) {
      lines.push(`- Colonna "${column}":${allowedPart} Se non trovato: ometti.`)
    } else {
      lines.push(`- Colonna "${column}": estrai solo se esplicitamente nel documento.`)
    }
  }
  if (!lines.length) return ''
  return `

DEFINIZIONE COLONNE del foglio ${study.toUpperCase()} → ${sheet} (usa nomi colonna ESATTI nell'oggetto JSON "columns"):
${lines.join('\n')}

Per colonne sì/no usa true o false (come TRUE/FALSE in Excel); non usare 0 o 1; ometti se non menzionato.`
}

export function buildFieldHintsPromptBlock(
  targetId: string | undefined,
  store: FieldHintsStore,
): string {
  const items = targetId
    ? hintsForTarget(targetId, store)
    : (allHintsWithText(store)
        .map((x) => {
          const p = parseFieldHintKey(x.key)
          return p
            ? { column: p.column, sheet: p.sheet, study: p.study, hint: x.hint }
            : null
        })
        .filter(Boolean) as { column: string; sheet: string; study: string; hint: string }[])

  if (!items.length) return ''

  const lines = items.map(
    (i) => `- Colonna "${i.column}" (foglio ${i.study.toUpperCase()} → ${i.sheet}): ${i.hint}`,
  )
  return `

DEFINIZIONE COLONNE (interpreta il testo/documento secondo queste istruzioni; usa i nomi colonna ESATTI nell'oggetto JSON "columns"):
${lines.join('\n')}

Per colonne sì/no usa i valori booleani JSON true o false (come TRUE/FALSE in Excel); non usare 0 o 1; ometti se non menzionato.
Includi nell'JSON anche le chiavi numeriche abituali (ph, pao2, …) se presenti.`
}
