/** Blocco prompt per istruzioni facoltative dell'operatore prima dell'estrazione. */
export function buildExtractCommandBlock(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return ''
  return `

ISTRUZIONI AGGIUNTIVE DELL'OPERATORE (seguile con priorità quando coerenti con il documento):
${trimmed}`
}

function storageKey(scope: string): string {
  return `pozzi:extract-command:${scope}`
}

export function extractCommandScope(study: string, sheet: string): string {
  return `${study}:${sheet}`
}

export function loadExtractCommandScoped(scope: string): string {
  try {
    return sessionStorage.getItem(storageKey(scope)) ?? ''
  } catch {
    return ''
  }
}

export function saveExtractCommandScoped(scope: string, command: string): void {
  try {
    sessionStorage.setItem(storageKey(scope), command)
  } catch {
    /* ignore */
  }
}

export function loadExtractCommand(study: string, sheet: string): string {
  return loadExtractCommandScoped(extractCommandScope(study, sheet))
}

export function saveExtractCommand(study: string, sheet: string, command: string): void {
  saveExtractCommandScoped(extractCommandScope(study, sheet), command)
}
