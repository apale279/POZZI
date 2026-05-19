import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
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
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const imageItemsRef = useRef(imageItems)
  imageItemsRef.current = imageItems

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
    if (added.length) onDocumentItemsChange([...documentItems, ...added])
  }

  const addImages = (files: FileList) => {
    appendImageFiles(Array.from(files))
  }

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

      <div className="ingest-grid">
        <article className="ingest-card">
          <div className="ingest-card-icon" aria-hidden>
            T
          </div>
          <h3>Testo</h3>
          <p className="ingest-card-desc">Incolla gasometria, referti o note cliniche.</p>
          <div className="ingest-card-body">
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
            <div className="ingest-card-actions">
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
          </div>
        </article>

        <article className="ingest-card">
          <div className="ingest-card-icon ingest-card-icon--image" aria-hidden>
            📷
          </div>
          <h3>Screenshot</h3>
          <p className="ingest-card-desc">
            Foto o cattura schermo. Con il focus fuori dai campi testo, premi{' '}
            <kbd>Ctrl</kbd>+<kbd>V</kbd> per incollare lo screenshot dagli appunti.
          </p>
          <div className="ingest-card-body ingest-card-body--paste">
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
          </div>
        </article>

        <article className="ingest-card ingest-card--wide">
          <div className="ingest-card-icon ingest-card-icon--doc" aria-hidden>
            PDF
          </div>
          <h3>PDF e Word</h3>
          <p className="ingest-card-desc">
            Estrae il testo dal file; se è una scansione senza testo, usa Gemini sul PDF.
          </p>
          <div className="ingest-card-body">
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
          </div>
        </article>
      </div>
    </section>
  )
}
