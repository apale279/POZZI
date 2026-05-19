/**
 * API Gemini per hosting Firebase (stesso comportamento di server/analyze-server.mjs).
 * Imposta: firebase functions:secrets:set GEMINI_API_KEY
 */
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const geminiKey = defineSecret('GEMINI_API_KEY')
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

Estrai SOLO i dati esplicitamente presenti nel documento. Se un campo non è indicato, NON includerlo (nessun valore predefinito, non inventare FALSE/0).
Se non sei sufficientemente sicuro di un valore, NON metterlo in columns/chiavi numeriche; se inserisci comunque una stima, segnalalo in "uncertain".
Rispondi ESCLUSIVAMENTE con JSON valido, senza markdown, con:
1) chiavi numeriche standard se presenti (ometti se assenti): ${EXTRACT_KEYS.join(', ')}
2) oggetto "columns" con chiavi = nomi colonna ESATTI del database e valori estratti. Ometti le colonne non trovate.
3) array "uncertain": elementi {"column":"NOME_COLONNA_ESATTO","value":<valore>,"reason":"motivo breve in italiano"} per ogni valore inserito di cui NON sei sicuro. Se sei sicuro, non includere il campo in uncertain.

Esempio: {"ph":7.28,"columns":{"ACEi":true},"uncertain":[{"column":"ACEi","value":true,"reason":"checkbox poco leggibile"}]}`

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

async function callGemini(apiKey, parts, model = DEFAULT_MODEL) {
  const resolved = resolveModel(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolved}:generateContent?key=${apiKey}`
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
    throw new Error(`Gemini API: ${msg}`)
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
      contentType: typeM?.[1],
      body: Buffer.from(body, 'binary'),
    })
  }
  return parts
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.status(status).set('Content-Type', 'application/json').send(JSON.stringify(data))
}

export const clinicalApi = onRequest(
  { secrets: [geminiKey], cors: true, maxInstances: 10, timeoutSeconds: 120 },
  async (req, res) => {
    const rawPath = (req.path || req.url?.split('?')[0] || '').replace(/\/$/, '')
    const path = rawPath.replace(/^\/api/, '') || rawPath

    if (req.method === 'GET' && (path === '/health' || path === 'health')) {
      sendJson(res, 200, {
        ok: true,
        gemini: Boolean(geminiKey.value()),
        model: DEFAULT_MODEL,
        allowedModels: [...ALLOWED_MODELS],
      })
      return
    }

    try {
      const apiKey = geminiKey.value()
      if (!apiKey) throw new Error('GEMINI_API_KEY non configurata su Firebase Functions')

      if (req.method === 'POST' && (path === '/analyze-text' || path === 'analyze-text')) {
        const { text, context, fieldHintsPrompt, extractCommand, model } = req.body ?? {}
        const prompt = buildPrompt(context, fieldHintsPrompt ?? '', extractCommand ?? '')
        const raw = await callGemini(apiKey, [{ text: `${prompt}\n\nTesto:\n${text}` }], model)
        const parsed = parseGeminiResponse(raw)
        sendJson(res, 200, { ...parsed, rawText: raw })
        return
      }

      if (req.method === 'POST' && (path === '/analyze-document' || path === 'analyze-document')) {
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
        const mime = docPart.contentType ?? ''
        const prompt = buildPrompt(context, fieldHintsPrompt, extractCommand)
        let geminiParts = [{ text: prompt }]

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
          if (!text) throw new Error('Nessun testo nel documento Word.')
          geminiParts = [{ text: `${prompt}\n\nTesto estratto:\n${text.slice(0, 28000)}` }]
        }

        const raw = await callGemini(apiKey, geminiParts, model)
        const parsed = parseGeminiResponse(raw)
        sendJson(res, 200, { ...parsed, rawText: raw })
        return
      }

      if (
        req.method === 'POST' &&
        (path === '/generate-field-hints' || path === 'generate-field-hints')
      ) {
        const { fields, mode } = req.body ?? {}
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
        const raw = await callGemini(apiKey, [{ text: prompt }])
        const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
        const obj = JSON.parse(cleaned)
        sendJson(res, 200, { results: obj.results ?? [] })
        return
      }

      if (req.method === 'POST' && (path === '/analyze-image' || path === 'analyze-image')) {
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
          apiKey,
          [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
          model,
        )
        const parsed = parseGeminiResponse(raw)
        sendJson(res, 200, { ...parsed, rawText: raw })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (e) {
      console.error(e)
      sendJson(res, 500, { error: e.message ?? 'Errore server' })
    }
  },
)
