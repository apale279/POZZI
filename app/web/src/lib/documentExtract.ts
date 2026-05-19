import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export const DOCUMENT_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface DocumentExtractResult {
  text: string
  pages?: number
  source: 'pdf-text' | 'docx' | 'gemini'
  fileName: string
}

const MIN_TEXT_CHARS = 50

export function isDocumentFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    n.endsWith('.pdf') ||
    n.endsWith('.docx') ||
    file.type === 'application/pdf' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function extractPdfText(file: File): Promise<{ text: string; pages: number }> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const chunks: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) chunks.push(line)
  }
  return { text: chunks.join('\n\n'), pages: pdf.numPages }
}

async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value.replace(/\s+/g, ' ').trim()
}

/** Estrae testo da PDF o Word (.docx). */
export async function extractTextFromDocument(file: File): Promise<DocumentExtractResult> {
  const fileName = file.name
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.doc')) {
    throw new Error(
      'I file .doc (Word vecchio) non sono supportati. Apri il file in Word e salva come .docx o esporta in PDF.',
    )
  }

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const { text, pages } = await extractPdfText(file)
    return { text, pages, source: 'pdf-text', fileName }
  }

  if (
    lower.endsWith('.docx') ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await extractDocxText(file)
    return { text, source: 'docx', fileName }
  }

  throw new Error('Formato non supportato. Usa PDF o Word (.docx).')
}

export function hasEnoughExtractedText(text: string): boolean {
  return text.replace(/\s/g, '').length >= MIN_TEXT_CHARS
}
