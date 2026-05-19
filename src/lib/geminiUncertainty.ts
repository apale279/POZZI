import { cellKey } from './workSession'

export type GeminiUncertainField = {
  column: string
  value?: string | number | boolean
  reason?: string
}

export const DEFAULT_UNCERTAIN_REASON =
  'L’IA non è sufficientemente sicura di questo valore: verifica manualmente.'

export function uncertainReasonText(reason?: string): string {
  const t = reason?.trim()
  return t || DEFAULT_UNCERTAIN_REASON
}

/** Mappa chiave cella → motivo incertezza IA. */
export function uncertainFieldsToKeyMap(
  study: 'ecmo' | 'acc',
  sheet: string,
  items: GeminiUncertainField[],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const u of items) {
    map[cellKey(study, sheet, u.column)] = uncertainReasonText(u.reason)
  }
  return map
}

export function mergeUncertainKeyMap(
  prev: Record<string, string>,
  study: 'ecmo' | 'acc',
  sheet: string,
  items: GeminiUncertainField[],
): Record<string, string> {
  return { ...prev, ...uncertainFieldsToKeyMap(study, sheet, items) }
}

export function clearUncertainKey(
  map: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in map)) return map
  const next = { ...map }
  delete next[key]
  return next
}
