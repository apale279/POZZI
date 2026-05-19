export const GEMINI_MODEL_FLASH = 'gemini-2.5-flash' as const
export const GEMINI_MODEL_PRO = 'gemini-2.5-pro' as const

export type GeminiModelId = typeof GEMINI_MODEL_FLASH | typeof GEMINI_MODEL_PRO

const STORAGE_KEY = 'pozzi:gemini-model'

export const GEMINI_MODEL_OPTIONS: { id: GeminiModelId; label: string }[] = [
  { id: GEMINI_MODEL_FLASH, label: '2.5 Flash' },
  { id: GEMINI_MODEL_PRO, label: '2.5 Pro' },
]

export function isGeminiModelId(value: string): value is GeminiModelId {
  return value === GEMINI_MODEL_FLASH || value === GEMINI_MODEL_PRO
}

export function loadGeminiModel(): GeminiModelId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isGeminiModelId(raw)) return raw
  } catch {
    /* ignore */
  }
  return GEMINI_MODEL_PRO
}

export function saveGeminiModel(model: GeminiModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, model)
  } catch {
    /* ignore */
  }
}
