export type GeminiUncertainField = {
  column: string
  value?: string | number | boolean
  reason?: string
}

/** Messaggio per window.alert quando l’IA segnala bassa confidenza. */
export function formatExtractUncertaintyAlert(
  items: GeminiUncertainField[],
  contextLabel: string,
): string {
  if (!items.length) return ''
  const lines = items.map((u) => {
    const val =
      u.value === undefined || u.value === null || u.value === ''
        ? '—'
        : String(u.value)
    const why = u.reason?.trim() ? `\n   Motivo: ${u.reason.trim()}` : ''
    return `• ${u.column} = ${val}${why}`
  })
  return (
    `ATTENZIONE — Verifica manuale richiesta (${contextLabel})\n\n` +
    `L’IA non è sufficientemente sicura su ${items.length} valore/i inseriti:\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `Controlla questi campi nella tabella prima di copiare la riga in Excel.`
  )
}
