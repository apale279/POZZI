import type { CrossDbTarget } from './crossDbLinks'
import { cellKey } from './workSession'

const SKIPPED_KEY = 'pozzi:cross-propagate-skipped'
const CONFIRMED_KEY = 'pozzi:cross-propagate-confirmed'

export function propagationLinkKey(sourceKey: string, target: CrossDbTarget): string {
  return `${sourceKey}->${cellKey(target.study, target.sheet, target.column)}`
}

function loadSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}

function saveSet(key: string, set: Set<string>): void {
  sessionStorage.setItem(key, JSON.stringify([...set]))
}

export function loadSkippedPropagations(): Set<string> {
  return loadSet(SKIPPED_KEY)
}

export function loadConfirmedPropagations(): Set<string> {
  return loadSet(CONFIRMED_KEY)
}

export function skipPropagation(sourceKey: string, target: CrossDbTarget, skipped: Set<string>): Set<string> {
  const next = new Set(skipped)
  next.add(propagationLinkKey(sourceKey, target))
  saveSet(SKIPPED_KEY, next)
  return next
}

export function confirmPropagation(
  sourceKey: string,
  target: CrossDbTarget,
  confirmed: Set<string>,
): Set<string> {
  const next = new Set(confirmed)
  const link = propagationLinkKey(sourceKey, target)
  next.add(link)
  saveSet(CONFIRMED_KEY, next)
  const skipped = loadSkippedPropagations()
  if (skipped.has(link)) {
    const s2 = new Set(skipped)
    s2.delete(link)
    saveSet(SKIPPED_KEY, s2)
  }
  return next
}

export function isPropagationConfirmed(
  sourceKey: string,
  target: CrossDbTarget,
  confirmed: Set<string>,
): boolean {
  return confirmed.has(propagationLinkKey(sourceKey, target))
}

export function isPropagationSkipped(
  sourceKey: string,
  target: CrossDbTarget,
  skipped: Set<string>,
): boolean {
  return skipped.has(propagationLinkKey(sourceKey, target))
}

/** Se cambi il valore sorgente, le scelte precedenti non valgono più. */
export function resetPropagationsForSource(
  sourceKey: string,
  confirmed: Set<string>,
  skipped: Set<string>,
): { confirmed: Set<string>; skipped: Set<string> } {
  const keepConfirmed = new Set([...confirmed].filter((k) => !k.startsWith(`${sourceKey}->`)))
  const keepSkipped = new Set([...skipped].filter((k) => !k.startsWith(`${sourceKey}->`)))
  saveSet(CONFIRMED_KEY, keepConfirmed)
  saveSet(SKIPPED_KEY, keepSkipped)
  return { confirmed: keepConfirmed, skipped: keepSkipped }
}

export function clearCrossPropagateSession(): void {
  sessionStorage.removeItem(SKIPPED_KEY)
  sessionStorage.removeItem(CONFIRMED_KEY)
}

/** @deprecated use clearCrossPropagateSession */
export function clearSkippedPropagations(): void {
  clearCrossPropagateSession()
}
