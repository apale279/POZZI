import type { GeminiModelId } from './geminiModel'
import type { GeminiUncertainField } from './geminiUncertainty'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface GeminiExtractResult {
  values: Record<string, number>
  columns?: Record<string, string | number>
  uncertain?: GeminiUncertainField[]
  rawText?: string
  error?: string
}

export type GeminiAnalyzeOptions = {
  fieldHintsPrompt?: string
  extractCommand?: string
  model?: GeminiModelId
}

export async function analyzeImageWithGemini(
  file: File,
  contextLabel: string,
  options: GeminiAnalyzeOptions = {},
): Promise<GeminiExtractResult> {
  const form = new FormData()
  form.append('image', file)
  form.append('context', contextLabel)
  if (options.fieldHintsPrompt) form.append('fieldHints', options.fieldHintsPrompt)
  if (options.extractCommand?.trim()) form.append('extractCommand', options.extractCommand.trim())
  if (options.model) form.append('model', options.model)

  const res = await fetch(`${API_BASE}/api/analyze-image`, {
    method: 'POST',
    body: form,
  })

  const data = (await res.json()) as GeminiExtractResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Errore server (${res.status})`)
  }
  return data
}

/** PDF (scansione) o documento senza testo estraibile — invio file a Gemini. */
export async function analyzeDocumentWithGemini(
  file: File,
  contextLabel: string,
  options: GeminiAnalyzeOptions = {},
): Promise<GeminiExtractResult> {
  const form = new FormData()
  form.append('document', file)
  form.append('context', contextLabel)
  if (options.fieldHintsPrompt) form.append('fieldHints', options.fieldHintsPrompt)
  if (options.extractCommand?.trim()) form.append('extractCommand', options.extractCommand.trim())
  if (options.model) form.append('model', options.model)

  const res = await fetch(`${API_BASE}/api/analyze-document`, {
    method: 'POST',
    body: form,
  })

  const data = (await res.json()) as GeminiExtractResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Errore server (${res.status})`)
  }
  return data
}

export async function analyzeTextWithGemini(
  text: string,
  contextLabel: string,
  options: GeminiAnalyzeOptions = {},
): Promise<GeminiExtractResult> {
  const res = await fetch(`${API_BASE}/api/analyze-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      context: contextLabel,
      fieldHintsPrompt: options.fieldHintsPrompt ?? '',
      extractCommand: options.extractCommand?.trim() ?? '',
      model: options.model ?? '',
    }),
  })

  const data = (await res.json()) as GeminiExtractResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Errore server (${res.status})`)
  }
  return data
}

export function isGeminiConfigured(): boolean {
  return true
}
