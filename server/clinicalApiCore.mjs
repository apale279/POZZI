/**
 * Logica API analisi clinica (Gemini). Usata in locale e su Vercel (/api/*).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadLocalEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

loadLocalEnv()

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro'
const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro'])

function resolveModel(requested) {
  const m = String(requested ?? '').trim()
  if (ALLOWED_MODELS.has(m)) return m
  return DEFAULT_MODEL
}

const EXTRACT_KEYS = [
  'ph', 'pao2', 'paco2', 'hco3', 'be', 'lactate', 'hb', 'ht', 'sao2', 'fio2',
  'peep', 'tv', 'rr', 'na', 'k', 'creat', 'pam', 'pas', 'pad', 'temp',
]

const PROMPT_BASE = `Sei un assistente per estrazione dati clinici da screenshot, PDF, referti Word, gasometria e monitoraggio (terapia intensiva, ECMO, arresto cardiaco).
Contesto valutazione: {{CONTEXT}}

Estrai i dati del documento utili per il foglio indicato nel contesto. Usa interpretazione clinica ragionevole: non serve essere certo al 100%.
Inserisci in "columns" ogni valore utile con chiave = nome colonna ESATTO del database (numeri, true/false per sì/no come in Excel, testo breve).
Se un valore è probabile ma non del tutto certo, inseriscilo comunque in "columns" e segnalalo anche in "uncertain" con motivo breve.
Evita solo valori inventati senza alcun indizio nel testo (non riempire a caso con FALSE/0 campi non discussi).
Per sì/no (IRC, SMOKE, ACEi, …): deduci true/false dal contesto; se ambiguo, proponi la scelta più probabile e marca "uncertain".
Rispondi ESCLUSIVAMENTE con JSON valido, senza markdown, con:
1) oggetto "columns" OBBLIGATORIO con i dati estratti per questo foglio
2) opzionalmente chiavi numeriche standard se utili: ${EXTRACT_KEYS.join(', ')}
3) array "uncertain": elementi {"column":"NOME_COLONNA_ESATTO","value":<valore>,"reason":"motivo breve in italiano"} per ogni valore in columns di cui non sei pienamente sicuro

Esempio: {"ph":7.28,"columns":{"pH":7.28,"IRC":true},"uncertain":[{"column":"IRC","value":true,"reason":"dedotto da insufficienza renale nel testo"}]}`

function buildPrompt(context, fieldHintsBlock = '', extractCommand = '') {
  let prompt = PROMPT_BASE.replace('{{CONTEXT}}', context ?? '')
  const cmd = String(extractCommand ?? '').trim()
  if (cmd) {
    prompt += `

ISTRUZIONI AGGIUNTIVE DELL'OPERATORE (seguile con priorità quando coerenti con il documento):
${cmd}`
  }
  return prompt + (fieldHintsBlock || '')
}

async function callGemini(parts, model = DEFAULT_MODEL) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY mancante. Impostala in Vercel (Environment Variables) o in .env.local per sviluppo.',
    )
  }

  const resolved = resolveModel(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolved}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json)
    throw new Error(`Gemini API (${resolved}): ${msg}`)
  }

  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
}

function parseGeminiResponse(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  const obj = JSON.parse(cleaned)
  const values = {}
  for (const k of EXTRACT_KEYS) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      const n = Number(obj[k])
      if (Number.isFinite(n)) values[k] = n
    }
  }
  const columns = {}
  if (obj.columns && typeof obj.columns === 'object') {
    for (const [k, v] of Object.entries(obj.columns)) {
      if (v === undefined || v === null || v === '') continue
      columns[k] = v
    }
  }
  const uncertain = parseUncertainList(obj)
  return { values, columns, uncertain }
}

function parseUncertainList(obj) {
  const out = []
  if (!Array.isArray(obj.uncertain)) return out
  for (const item of obj.uncertain) {
    if (!item || typeof item !== 'object') continue
    const column = String(item.column ?? item.col ?? '').trim()
    if (!column) continue
    const reason = typeof item.reason === 'string' ? item.reason.trim() : undefined
    out.push({
      column,
      value: item.value,
      reason: reason || undefined,
    })
  }
  return out
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseMultipart(buffer, boundary) {
  const parts = []
  const b = `--${boundary}`
  const sections = buffer.toString('binary').split(b).slice(1, -1)
  for (const section of sections) {
    const idx = section.indexOf('\r\n\r\n')
    if (idx < 0) continue
    const head = section.slice(0, idx)
    const body = section.slice(idx + 4, section.length - 2)
    const nameM = head.match(/name="([^"]+)"/)
    const fileM = head.match(/filename="([^"]+)"/)
    const typeM = head.match(/Content-Type:\s*(\S+)/i)
    parts.push({
      name: nameM?.[1],
      filename: fileM?.[1],
      contentType: typeM?.[1],
      body: Buffer.from(body, 'binary'),
    })
  }
  return parts
}

/** Normalizza req.url per il router (Vercel espone path senza prefisso /api completo). */
export function apiPathname(reqUrl, fallbackPath) {
  const raw = reqUrl ?? fallbackPath
  const pathOnly = raw.split('?')[0]
  if (pathOnly.startsWith('/api/')) return pathOnly
  if (pathOnly.startsWith('/')) return `/api${pathOnly}`
  return fallbackPath
}

/** Handler Node (req, res) — compatibile con server locale e Vercel Serverless. */
export async function handleClinicalApi(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const path = apiPathname(req.url, req.apiPath ?? '/api/health')

  if (req.method === 'GET' && path === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        gemini: Boolean(process.env.GEMINI_API_KEY),
        model: DEFAULT_MODEL,
        allowedModels: [...ALLOWED_MODELS],
      }),
    )
    return
  }

  try {
    if (req.method === 'POST' && path === '/api/analyze-text') {
      const buf = await readBody(req)
      const { text, context, fieldHintsPrompt, extractCommand, model } = JSON.parse(buf.toString('utf8'))
      const prompt = buildPrompt(context, fieldHintsPrompt ?? '', extractCommand ?? '')
      const raw = await callGemini([{ text: `${prompt}\n\nTesto:\n${text}` }], model)
      const parsed = parseGeminiResponse(raw)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...parsed, rawText: raw }))
      return
    }

    if (req.method === 'POST' && path === '/api/analyze-document') {
      const buf = await readBody(req)
      const ct = req.headers['content-type'] ?? ''
      const boundaryM = ct.match(/boundary=(.+)/)
      if (!boundaryM) throw new Error('multipart boundary mancante')

      const parts = parseMultipart(buf, boundaryM[1].trim())
      const docPart = parts.find((p) => p.name === 'document')
      const contextPart = parts.find((p) => p.name === 'context')
      if (!docPart) throw new Error('Documento mancante')

      const context = contextPart?.body?.toString('utf8') ?? ''
      const hintsPart = parts.find((p) => p.name === 'fieldHints')
      const cmdPart = parts.find((p) => p.name === 'extractCommand')
      const modelPart = parts.find((p) => p.name === 'model')
      const fieldHintsPrompt = hintsPart?.body?.toString('utf8') ?? ''
      const extractCommand = cmdPart?.body?.toString('utf8') ?? ''
      const model = modelPart?.body?.toString('utf8') ?? ''
      const mime = docPart.contentType ?? 'application/octet-stream'
      const prompt = buildPrompt(context, fieldHintsPrompt, extractCommand)
      const geminiParts = [{ text: prompt }]

      if (mime === 'application/pdf' || docPart.filename?.toLowerCase().endsWith('.pdf')) {
        geminiParts.push({
          inline_data: {
            mime_type: 'application/pdf',
            data: docPart.body.toString('base64'),
          },
        })
      } else {
        const { default: mammoth } = await import('mammoth')
        const extracted = await mammoth.extractRawText({ buffer: docPart.body })
        const text = extracted.value?.trim() ?? ''
        if (!text) {
          throw new Error('Nessun testo nel documento Word. Prova PDF o screenshot.')
        }
        geminiParts[0] = {
          text: `${prompt}\n\nTesto estratto dal documento:\n${text.slice(0, 28000)}`,
        }
      }

      const raw = await callGemini(geminiParts, model)
      const parsed = parseGeminiResponse(raw)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...parsed, rawText: raw }))
      return
    }

    if (req.method === 'POST' && path === '/api/analyze-image') {
      const buf = await readBody(req)
      const ct = req.headers['content-type'] ?? ''
      const boundaryM = ct.match(/boundary=(.+)/)
      if (!boundaryM) throw new Error('multipart boundary mancante')

      const parts = parseMultipart(buf, boundaryM[1].trim())
      const imagePart = parts.find((p) => p.name === 'image')
      const contextPart = parts.find((p) => p.name === 'context')
      if (!imagePart) throw new Error('Immagine mancante')

      const context = contextPart?.body?.toString('utf8') ?? ''
      const hintsPart = parts.find((p) => p.name === 'fieldHints')
      const cmdPart = parts.find((p) => p.name === 'extractCommand')
      const modelPart = parts.find((p) => p.name === 'model')
      const fieldHintsPrompt = hintsPart?.body?.toString('utf8') ?? ''
      const extractCommand = cmdPart?.body?.toString('utf8') ?? ''
      const model = modelPart?.body?.toString('utf8') ?? ''
      const mime = imagePart.contentType ?? 'image/png'
      const b64 = imagePart.body.toString('base64')
      const prompt = buildPrompt(context, fieldHintsPrompt, extractCommand)

      const raw = await callGemini(
        [
          { text: prompt },
          { inline_data: { mime_type: mime, data: b64 } },
        ],
        model,
      )
      const parsed = parseGeminiResponse(raw)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...parsed, rawText: raw }))
      return
    }

    if (req.method === 'POST' && path === '/api/generate-field-hints') {
      const buf = await readBody(req)
      const { fields, mode } = JSON.parse(buf.toString('utf8'))
      if (!Array.isArray(fields) || !fields.length) {
        throw new Error('Elenco campi mancante')
      }
      const fieldLines = fields
        .map((f) => {
          const parts = [
            `key="${f.key}"`,
            `studio=${f.study}`,
            `foglio="${f.sheet}"`,
            `colonna="${f.column}"`,
          ]
          if (f.hint?.trim()) parts.push(`significato="${f.hint.trim().slice(0, 200)}"`)
          if (f.samples?.length) parts.push(`esempi_db=${JSON.stringify(f.samples.slice(0, 6))}`)
          if (f.allowedValues?.length)
            parts.push(`valori_ammessi=${JSON.stringify(f.allowedValues.slice(0, 12))}`)
          if (f.absentConvention) parts.push(`se_assente=${f.absentConvention}`)
          if (f.inferredDefault) parts.push(`predefinito_suggerito="${f.inferredDefault}"`)
          return `- ${parts.join(' ')}`
        })
        .join('\n')
      const prompt =
        mode === 'defaultsOnly'
          ? `Sei un esperto di database clinici ECMO e arresto cardiaco (ACC).
Per ogni campo sotto determina SOLO il valore predefinito da usare in Excel quando il dato non è trovato nel referto.
NON modificare il significato del campo. Usa esempi_db, valori_ammessi, se_assente, significato se presente.
Valori tipici: "" (vuoto), "FALSE", "0", o un valore testuale dai campioni / elenco chiuso.

Rispondi SOLO JSON valido:
{"results":[{"key":"...","defaultValue":"...","confidence":"high"|"low"}]}

confidence=high se il predefinito è chiaro; low se ambiguo.

Campi:
${fieldLines}`
          : `Sei un esperto di database clinici ECMO e arresto cardiaco (ACC).
Per ogni campo sotto, analizza il database già compilato (esempi, valori ammessi, regola se assente) e produci:
1) hint: UNA breve istruzione in italiano per estrazione da referti (significato, formato, TRUE/FALSE per sì/no come Excel). Specifica che se il dato non è nel referto la colonna va lasciata vuota (omettere).

Rispondi SOLO JSON valido:
{"results":[{"key":"...","hint":"...","confidence":"high"|"low"}]}

confidence=high se il significato è chiaro dai dati; low se ambiguo.

Campi:
${fieldLines}`
      const raw = await callGemini([{ text: prompt }])
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
      const obj = JSON.parse(cleaned)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results: obj.results ?? [] }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', path }))
  } catch (e) {
    console.error(e)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message ?? 'Errore server' }))
  }
}
