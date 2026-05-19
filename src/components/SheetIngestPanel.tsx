import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  imageFilesFromClipboardData,
  isEditablePasteTarget,
} from '../lib/clipboardImages'
import {
  DOCUMENT_ACCEPT,
  formatFileSize,
  isDocumentFile,
} from '../lib/documentExtract'

export type TextItem = { id: string; text: string }
export type ImageItem = { id: string; file: File; preview: string }
export type DocumentItem = { id: string; file: File }

type IngestSectionId = 'text' | 'screenshot' | 'documents'

type Props = {
  textItems: TextItem[]
  onTextItemsChange: (items: TextItem[]) => void
  imageItems: ImageItem[]
  onImageItemsChange: (items: ImageItem[]) => void
  documentItems: DocumentItem[]
  onDocumentItemsChange: (items: DocumentItem[]) => void
  onAnalyzeText: () => void
  onAnalyzeImages: () => void
  onAnalyzeDocuments: () => void
  loading: boolean
  extractCommand: string
  onExtractCommandChange: (value: string) => void
}

function fileInputChange(
  e: ChangeEvent<HTMLInputElement>,
  onFiles: (files: FileList) => void,
) {
  if (e.target.files?.length) onFiles(e.target.files)
  e.target.value = ''
}

type AccordionSectionProps = {
  id: IngestSectionId
  open: boolean
  onToggle: () => void
  icon: string
  title: string
  summary: ReactNode
  badge?: string
  children: ReactNode
}

function IngestAccordionSection({
  id,
  open,
  onToggle,
  icon,
  title,
  summary,
  badge,
  children,
}: AccordionSectionProps) {
  const panelId = `ingest-panel-${id}`
  const triggerId = `ingest-trigger-${id}`

  return (
    <article className={`ingest-accordion-item${open ? ' ingest-accordion-item--open' : ''}`}>
      <button
        type="button"
        className="ingest-accordion-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        id={triggerId}
        onClick={onToggle}
      >
        <span className="ingest-accordion-icon" aria-hidden>
          {icon}
        </span>
        <span className="ingest-accordion-heading">
          <span className="ingest-accordion-title">{title}</span>
          <span className="ingest-accordion-summary">{summary}</span>
        </span>
        {badge ? <span className="ingest-accordion-badge">{badge}</span> : null}
        <span className="ingest-accordion-chevron" aria-hidden />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="ingest-accordion-panel"
        hidden={!open}
      >
        {children}
      </div>
    </article>
  )
}

export function SheetIngestPanel({
  textItems,
  onTextItemsChange,
  imageItems,
  onImageItemsChange,
  documentItems,
  onDocumentItemsChange,
  onAnalyzeText,
  onAnalyzeImages,
  onAnalyzeDocuments,
  loading,
  extractCommand,
  onExtractCommandChange,
}: Props) {
  const [openSections, setOpenSections] = useState<Record<IngestSectionId, boolean>>({
    text: false,
    screenshot: false,
    documents: false,
  })
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const imageItemsRef = useRef(imageItems)
  imageItemsRef.current = imageItems

  const toggleSection = (id: IngestSectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const appendImageFiles = useCallback(
    (files: Iterable<File>) => {
      const added: ImageItem[] = []
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        added.push({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
        })
      }
      if (!added.length) return 0
      onImageItemsChange([...imageItemsRef.current, ...added])
      return added.length
    },
    [onImageItemsChange],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditablePasteTarget(e.target)) return
      const files = imageFilesFromClipboardData(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      const n = appendImageFiles(files)
      if (n > 0) {
        setPasteHint(n === 1 ? 'Screenshot incollato' : `${n} screenshot incollati`)
        setOpenSections((prev) => ({ ...prev, screenshot: true }))
        window.setTimeout(() => setPasteHint(null), 2500)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [appendImageFiles])

  const addDocuments = (files: FileList) => {
    const added: DocumentItem[] = []
    for (const file of Array.from(files)) {
      if (!isDocumentFile(file)) continue
      added.push({ id: crypto.randomUUID(), file })
    }
    if (added.length) {
      onDocumentItemsChange([...documentItems, ...added])
      setOpenSections((prev) => ({ ...prev, documents: true }))
    }
  }

  const addImages = (files: FileList) => {
    const n = appendImageFiles(Array.from(files))
    if (n > 0) setOpenSections((prev) => ({ ...prev, screenshot: true }))
  }

  const textFilled = textItems.filter((t) => t.text.trim()).length

  return (
    <section className="ingest-panel">
      <header className="ingest-panel-head">
        <h2>Inserisci dati</h2>
        <p className="hint">
          Testo libero, screenshot (<strong>Ctrl+V</strong> per incollare), <strong>PDF</strong> o{' '}
          <strong>Word (.docx)</strong>. I file non vengono salvati nel cloud.
        </p>
      </header>

      <label className="ingest-command">
        <span className="ingest-command-label">Comando facoltativo prima dell’estrazione</span>
        <textarea
          rows={2}
          value={extractCommand}
          placeholder="Es.: Usa solo i valori del 15/03/2026 · Ignora la riga di intestazione · RUN 2"
          onChange={(e) => onExtractCommandChange(e.target.value)}
        />
        <span className="hint ingest-command-hint">
          Vale per testo, screenshot e documenti del foglio corrente. Lasciare vuoto se non serve.
        </span>
      </label>

      <div className="ingest-accordion">
        <IngestAccordionSection
          id="text"
          open={openSections.text}
          onToggle={() => toggleSection('text')}
          icon="T"
          title="Testo"
          summary="Incolla gasometria, referti o note cliniche."
          badge={textFilled > 0 ? `${textFilled} blocco/i` : undefined}
        >
          {textItems.map((item, idx) => (
            <div key={item.id} className="ingest-row">
              <textarea
                rows={3}
                value={item.text}
                placeholder="pH 7.28, PaO2 72, lactato 4.2…"
                onChange={(e) =>
                  onTextItemsChange(
                    textItems.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)),
                  )
                }
              />
              {textItems.length > 1 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onTextItemsChange(textItems.filter((_, i) => i !== idx))}
                >
                  Rimuovi
                </button>
              )}
            </div>
          ))}
          <div className="ingest-accordion-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                onTextItemsChange([...textItems, { id: crypto.randomUUID(), text: '' }])
              }
            >
              + Altro testo
            </button>
            <button type="button" className="btn-primary" onClick={onAnalyzeText} disabled={loading}>
              Analizza testi
            </button>
          </div>
        </IngestAccordionSection>

        <IngestAccordionSection
          id="screenshot"
          open={openSections.screenshot}
          onToggle={() => toggleSection('screenshot')}
          icon="IMG"
          title="Screenshot"
          summary={
            <>
              Foto o cattura schermo. Con il focus fuori dai campi testo, premi <kbd>Ctrl</kbd>+
              <kbd>V</kbd> per incollare dagli appunti.
            </>
          }
          badge={imageItems.length > 0 ? `${imageItems.length} file` : undefined}
        >
          <label className="file-drop file-drop--paste" tabIndex={0}>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => fileInputChange(e, addImages)}
            />
            <span>Trascina, scegli file o incolla con Ctrl+V</span>
          </label>
          {pasteHint && <p className="ok-inline ingest-paste-ok">{pasteHint}</p>}
          {imageItems.length > 0 && (
            <div className="thumb-grid">
              {imageItems.map((img) => (
                <figure key={img.id}>
                  <img src={img.preview} alt="" />
                  <button
                    type="button"
                    className="thumb-remove"
                    onClick={() => onImageItemsChange(imageItems.filter((x) => x.id !== img.id))}
                    aria-label="Rimuovi"
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!imageItems.length || loading}
            onClick={onAnalyzeImages}
          >
            {loading ? 'Analisi…' : `Analizza ${imageItems.length} immagine/i`}
          </button>
        </IngestAccordionSection>

        <IngestAccordionSection
          id="documents"
          open={openSections.documents}
          onToggle={() => toggleSection('documents')}
          icon="DOC"
          title="PDF e Word"
          summary="Estrae il testo; sulle scansioni senza testo usa Gemini sul PDF."
          badge={documentItems.length > 0 ? `${documentItems.length} file` : undefined}
        >
          <label className="file-drop">
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              multiple
              hidden
              onChange={(e) => fileInputChange(e, addDocuments)}
            />
            <span>PDF o .docx (max consigliato ~15 MB)</span>
          </label>
          {documentItems.length > 0 && (
            <ul className="doc-list">
              {documentItems.map((doc) => (
                <li key={doc.id}>
                  <span className="doc-name">{doc.file.name}</span>
                  <span className="doc-meta">{formatFileSize(doc.file.size)}</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      onDocumentItemsChange(documentItems.filter((x) => x.id !== doc.id))
                    }
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!documentItems.length || loading}
            onClick={onAnalyzeDocuments}
          >
            {loading ? 'Analisi…' : `Analizza ${documentItems.length} documento/i`}
          </button>
        </IngestAccordionSection>
      </div>
    </section>
  )
}
