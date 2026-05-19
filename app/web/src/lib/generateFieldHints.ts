const API_BASE = import.meta.env.VITE_API_URL ?? ''

export type FieldHintGenerateInput = {
  key: string
  study: 'ecmo' | 'acc'
  sheet: string
  column: string
  samples?: string[]
  allowedValues?: string[]
  absentConvention?: 'empty' | 'false' | 'zero'
  inferredDefault?: string
  /** Significato già noto — utile in modalità solo predefiniti. */
  hint?: string
}

export type FieldHintGenerateResult = {
  key: string
  hint: string
  defaultValue?: string
  confidence: 'high' | 'low'
}

export type FieldDefaultGenerateResult = {
  key: string
  defaultValue: string
  confidence: 'high' | 'low'
}

const BATCH = 28

async function postGenerate(
  fields: FieldHintGenerateInput[],
  mode: 'full' | 'defaultsOnly',
): Promise<FieldHintGenerateResult[]> {
  const res = await fetch(`${API_BASE}/api/generate-field-hints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, mode }),
  })
  const data = (await res.json()) as { results?: FieldHintGenerateResult[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Errore server (${res.status})`)
  return data.results ?? []
}

export async function generateFieldHintsBatch(
  fields: FieldHintGenerateInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<FieldHintGenerateResult[]> {
  const out: FieldHintGenerateResult[] = []
  for (let i = 0; i < fields.length; i += BATCH) {
    const chunk = fields.slice(i, i + BATCH)
    out.push(...(await postGenerate(chunk, 'full')))
    onProgress?.(Math.min(i + BATCH, fields.length), fields.length)
  }
  return out
}

/** IA solo per valori predefiniti (non modifica il significato). */
export async function generateFieldDefaultsBatch(
  fields: FieldHintGenerateInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<FieldDefaultGenerateResult[]> {
  const out: FieldDefaultGenerateResult[] = []
  for (let i = 0; i < fields.length; i += BATCH) {
    const chunk = fields.slice(i, i + BATCH)
    const results = await postGenerate(chunk, 'defaultsOnly')
    for (const r of results) {
      if (r.defaultValue === undefined) continue
      out.push({
        key: r.key,
        defaultValue: r.defaultValue,
        confidence: r.confidence,
      })
    }
    onProgress?.(Math.min(i + BATCH, fields.length), fields.length)
  }
  return out
}
