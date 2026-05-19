import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import type { ConflictChoice, FieldConflict, SheetFieldRow } from '../types/ingest'
import {
  extractTextFromDocument,
  hasEnoughExtractedText,
} from '../lib/documentExtract'
import {
  loadExtractCommandScoped,
  saveExtractCommandScoped,
} from '../lib/extractCommand'
import {
  clearUncertainKey,
  mergeUncertainKeyMap,
  type GeminiUncertainField,
} from '../lib/geminiUncertainty'
import type { GeminiExtractResult } from '../lib/geminiClient'
import { uncertainFieldsForAppliedKeys } from '../lib/sheetExtract'
import {
  analyzeDocumentWithGemini,
  analyzeImageWithGemini,
  analyzeTextWithGemini,
} from '../lib/geminiClient'
import { getTargetById } from '../lib/ingestConfig'
import { isFirebaseConfigured } from '../lib/firebase'
import { savePatient, subscribePatient } from '../lib/patientFirestore'
import { getStashedPatientRecord, stashPatientRecord } from '../lib/patientSession'
import { buildFieldHintsPromptBlock, loadFieldHints } from '../lib/fieldHints'
import { findCrossDbTargets } from '../lib/crossDbLinks'
import {
  analyzeGeminiResponseForTarget,
  analyzeTextForTarget,
  applySheetEdits,
  buildSheetFieldRows,
  fieldKey,
  mergeAppliedSuggestions,
  mergeIntoProposed,
  proposedMapFromRows,
  SHEET_EDITOR_CHANNEL,
  syncRecordValuesToProposed,
} from '../lib/sheetEditor'
import { applyRecordOptimizations } from '../lib/recordOptimizations'
import { parseCellValueFromUi, type SheetCellValue } from '../lib/cellValueFormat'
import { AppBrand } from './AppBrand'
import { ExcelPasteRow } from './ExcelPasteRow'
import { ConflictResolverModal } from './ConflictResolverModal'
import { FullSheetTable } from './FullSheetTable'
import {
  SheetIngestPanel,
  type DocumentItem,
  type ImageItem,
  type TextItem,
} from './SheetIngestPanel'

type Props = {
  patientId: string
  targetId: string
  initialEcmoRun?: number
  initialRecord?: PatientRecord
  embedded?: boolean
  onClose?: () => void
  onRecordChange?: (record: PatientRecord) => void
}

function syncRows(
  record: PatientRecord,
  targetId: string,
  ecmoRun: number | undefined,
  proposed: Map<string, SheetCellValue>,
  sources: Map<string, SheetFieldRow['source']>,
): SheetFieldRow[] {
  return buildSheetFieldRows(record, targetId, ecmoRun, proposed, sources)
}

export function SheetEditorWindow({
  patientId,
  targetId,
  initialEcmoRun = 1,
  initialRecord,
  embedded,
  onClose,
  onRecordChange,
}: Props) {
  const [record, setRecord] = useState<PatientRecord | null>(null)
  const [ecmoRun, setEcmoRun] = useState(initialEcmoRun)
  const [textItems, setTextItems] = useState<TextItem[]>([{ id: crypto.randomUUID(), text: '' }])
  const [imageItems, setImageItems] = useState<ImageItem[]>([])
  const [documentItems, setDocumentItems] = useState<DocumentItem[]>([])
  const [proposed, setProposed] = useState<Map<string, SheetCellValue>>(new Map())
  const [sources, setSources] = useState<Map<string, SheetFieldRow['source']>>(new Map())
  const [conflicts, setConflicts] = useState<FieldConflict[]>([])
  const [tableFilter, setTableFilter] = useState<'all' | 'missing' | 'filled'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [optimizeMsg, setOptimizeMsg] = useState<string | null>(null)
  const [extractCommand, setExtractCommand] = useState(() =>
    loadExtractCommandScoped(`target:${targetId}`),
  )
  const [uncertainByKey, setUncertainByKey] = useState<Record<string, string>>({})
  const localEditAt = useRef(0)
  const dirtyRef = useRef(false)
  const seededKeyRef = useRef<string | null>(null)

  const target = getTargetById(targetId)
  const runs = record?.ecmoRuns?.length ? record.ecmoRuns : [{ runNumber: 1 }]

  useEffect(() => {
    const seedKey = `${patientId}:${targetId}`
    if (seededKeyRef.current === seedKey) return
    seededKeyRef.current = seedKey
    dirtyRef.current = false
    localEditAt.current = 0

    const seed = initialRecord ?? getStashedPatientRecord(patientId)
    if (seed) {
      const { record: optimized, applied } = applyRecordOptimizations(seed, { onlyEmpty: true })
      const nextProposed = new Map<string, SheetCellValue>()
      const nextSources = new Map<string, SheetFieldRow['source']>()
      syncRecordValuesToProposed(optimized, targetId, nextProposed, nextSources)
      mergeAppliedSuggestions(applied, targetId, nextProposed, nextSources)
      setRecord(optimized)
      setProposed(nextProposed)
      setSources(nextSources)
    }
  }, [patientId, targetId, initialRecord])

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      if (!getStashedPatientRecord(patientId) && !initialRecord) {
        setLoadError('Firebase non configurato e nessun dato locale per questo paziente.')
      }
      return
    }
    const unsub = subscribePatient(
      patientId,
      (item) => {
        if (item) {
          const remoteTs = new Date(item.record.updatedAt).getTime()
          if (remoteTs < localEditAt.current) return

          const { record: optimized, applied } = applyRecordOptimizations(item.record, { onlyEmpty: true })
          setRecord(optimized)

          if (!dirtyRef.current) {
            const nextProposed = new Map<string, SheetCellValue>()
            const nextSources = new Map<string, SheetFieldRow['source']>()
            syncRecordValuesToProposed(optimized, targetId, nextProposed, nextSources)
            mergeAppliedSuggestions(applied, targetId, nextProposed, nextSources)
            setProposed(nextProposed)
            setSources(nextSources)
          }
          setLoadError(null)
        } else if (!getStashedPatientRecord(patientId) && !initialRecord) {
          setLoadError('Paziente non trovato su Firebase.')
        }
      },
      (e) => {
        if (!getStashedPatientRecord(patientId) && !initialRecord) {
          setLoadError(e.message)
        }
      },
    )
    return unsub
  }, [patientId, initialRecord, targetId])

  const bothStudies = !!(record?.acc?.attivo && record?.ecmo?.attivo)

  const rows = useMemo(() => {
    if (!record) return []
    return syncRows(record, targetId, target?.requiresRun ? ecmoRun : undefined, proposed, sources)
  }, [record, targetId, ecmoRun, proposed, sources, target?.requiresRun])

  const crossDbForRow = useCallback(
    (row: SheetFieldRow) => findCrossDbTargets(row.studyId, row.sheet, row.column, bothStudies),
    [bothStudies],
  )

  const getUncertainReason = useCallback(
    (row: SheetFieldRow) => uncertainByKey[fieldKey(row.studyId, row.sheet, row.column)],
    [uncertainByKey],
  )

  const markUncertainExtracted = useCallback(
    (items: GeminiUncertainField[]) => {
      if (!target || !items.length) return
      setUncertainByKey((prev) => mergeUncertainKeyMap(prev, target.study, target.sheet, items))
    },
    [target],
  )

  const refreshCalculated = useCallback(() => {
    if (!record || !target) return
    localEditAt.current = Date.now()
    const { record: optimized, applied } = applyRecordOptimizations(record, { onlyEmpty: true })
    const nextProposed = new Map(proposed)
    const nextSources = new Map(sources)
    syncRecordValuesToProposed(optimized, targetId, nextProposed, nextSources)
    const onSheet = mergeAppliedSuggestions(applied, targetId, nextProposed, nextSources)
    setRecord(optimized)
    setProposed(nextProposed)
    setSources(nextSources)
    stashPatientRecord(optimized)
    onRecordChange?.(optimized)

    if (onSheet.length > 0) {
      setOptimizeMsg(
        `Su questa scheda: ${onSheet.length} campi compilati (${onSheet.map((s) => s.column).slice(0, 4).join(', ')}${onSheet.length > 4 ? '…' : ''}). Totale record: ${applied.length}.`,
      )
    } else if (applied.length > 0) {
      setOptimizeMsg(
        `${applied.length} campi aggiornati su altri fogli (ANNO, identità…). Su «${target.label}» non ci sono campi automatici vuoti — usa PDF/testo per anamnesi e parametri clinici.`,
      )
    } else {
      setOptimizeMsg('Nessuna cella vuota da ottimizzare con i dati attuali.')
    }
    setTimeout(() => setOptimizeMsg(null), 8000)
  }, [record, target, targetId, proposed, sources, onRecordChange])

  const applyMerge = useCallback(
    (preview: ReturnType<typeof analyzeTextForTarget>) => {
      if (!record || !preview || 'error' in preview) {
        setError(preview && 'error' in preview ? preview.error : 'Errore analisi')
        return
      }
      const run = target?.requiresRun ? ecmoRun : undefined
      const newConflicts: FieldConflict[] = []

      setProposed((prev) => {
        const next = new Map(prev)
        newConflicts.push(...mergeIntoProposed(record, targetId, run, preview, next))
        return next
      })
      setSources((prev) => {
        const src = new Map(prev)
        for (const row of preview.rows) {
          if (row.autoFilled) continue
          const studyId = row.study === 'ECMO' ? 'ecmo' : 'acc'
          src.set(fieldKey(studyId, row.sheet, row.column), 'extract')
        }
        return src
      })

      dirtyRef.current = true
      localEditAt.current = Date.now()
      if (newConflicts.length) setConflicts((c) => [...c, ...newConflicts])
      setError(null)

      const filled = preview.rows.filter((r) => !r.autoFilled).length
      if (filled > 0) {
        setOptimizeMsg(`${filled} valori proposti in tabella — verifica e Salva.`)
        setTimeout(() => setOptimizeMsg(null), 6000)
      }
    },
    [record, targetId, ecmoRun, target?.requiresRun],
  )

  const applyGeminiExtract = useCallback(
    (gemini: GeminiExtractResult): { uncertain: GeminiUncertainField[]; filled: number } => {
      if (!record || !target) return { uncertain: [], filled: 0 }
      const run = target.requiresRun ? ecmoRun : undefined
      const preview = analyzeGeminiResponseForTarget(targetId, gemini, record, run)
      if ('error' in preview) {
        setError(preview.error)
        return { uncertain: [], filled: 0 }
      }
      applyMerge(preview)
      const filledRows = preview.rows.filter((r) => !r.autoFilled)
      const filledKeys = filledRows.map((r) =>
        fieldKey(r.study === 'ECMO' ? 'ecmo' : 'acc', r.sheet, r.column),
      )
      return {
        uncertain: uncertainFieldsForAppliedKeys(
          target.study,
          target.sheet,
          gemini.uncertain,
          filledKeys,
        ),
        filled: filledRows.length,
      }
    },
    [applyMerge, ecmoRun, record, target, targetId],
  )

  const fieldHintsBlock = useMemo(
    () => buildFieldHintsPromptBlock(targetId, loadFieldHints()),
    [targetId],
  )

  const geminiOptions = useMemo(
    () => ({
      fieldHintsPrompt: fieldHintsBlock,
      extractCommand,
    }),
    [fieldHintsBlock, extractCommand],
  )

  useEffect(() => {
    setExtractCommand(loadExtractCommandScoped(`target:${targetId}`))
  }, [targetId])

  useEffect(() => {
    saveExtractCommandScoped(`target:${targetId}`, extractCommand)
  }, [targetId, extractCommand])

  const runTextAnalysis = async () => {
    if (!record || !target) return
    const run = target.requiresRun ? ecmoRun : undefined
    setLoading(true)
    setError(null)
    let merged = 0
    let geminiFailed = false
    const allUncertain: GeminiUncertainField[] = []
    try {
      for (const item of textItems) {
        if (!item.text.trim()) continue
        const local = analyzeTextForTarget(targetId, item.text, record, run, 'text')
        if (!('error' in local) && local.rows.some((r) => !r.autoFilled)) {
          applyMerge(local)
          merged += local.rows.filter((r) => !r.autoFilled).length
        }
        try {
          const gemini = await analyzeTextWithGemini(
            item.text.slice(0, 12000),
            target.label,
            geminiOptions,
          )
          const { uncertain, filled } = applyGeminiExtract(gemini)
          allUncertain.push(...uncertain)
          merged += filled
        } catch {
          geminiFailed = true
        }
      }
      if (merged > 0) markUncertainExtracted(allUncertain)
      if (merged === 0 && geminiFailed) {
        setError('Analisi IA non disponibile. Avvia l’app con npm run dev (serve API su porta 3001).')
      } else if (merged === 0) {
        setError(
          'Nessun parametro riconosciuto. Configura le spiegazioni in Impostazioni oppure usa etichette come pH, PaO2, ACEi nel testo.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi testo')
    } finally {
      setLoading(false)
    }
  }

  const runImageAnalysis = async () => {
    if (!record || !target) return
    setLoading(true)
    setError(null)
    try {
      const allUncertain: GeminiUncertainField[] = []
      for (const item of imageItems) {
        const gemini = await analyzeImageWithGemini(item.file, target.label, geminiOptions)
        const { uncertain, filled } = applyGeminiExtract(gemini)
        allUncertain.push(...uncertain)
        if (filled > 0) {
          setOptimizeMsg(`${filled} valori proposti in tabella — verifica e Salva.`)
        }
      }
      markUncertainExtracted(allUncertain)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi immagini')
    } finally {
      setLoading(false)
    }
  }

  const runDocumentAnalysis = async () => {
    if (!record || !target) return
    setLoading(true)
    setError(null)
    try {
      const run = target.requiresRun ? ecmoRun : undefined
      const docUncertain: GeminiUncertainField[] = []
      for (const item of documentItems) {
        const file = item.file
        let extracted: string | null = null
        try {
          const result = await extractTextFromDocument(file)
          extracted = result.text
        } catch (extractErr) {
          if (!file.name.toLowerCase().endsWith('.pdf')) throw extractErr
          extracted = null
        }

        if (extracted && hasEnoughExtractedText(extracted)) {
          const local = analyzeTextForTarget(targetId, extracted, record, run, 'text')
          applyMerge(local)
          try {
            const snippet = extracted.slice(0, 12000)
            const gemini = await analyzeTextWithGemini(snippet, target.label, geminiOptions)
            const { uncertain } = applyGeminiExtract(gemini)
            docUncertain.push(...uncertain)
          } catch {
            /* parser locale sufficiente */
          }
        } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          const gemini = await analyzeDocumentWithGemini(file, target.label, geminiOptions)
          const { uncertain } = applyGeminiExtract(gemini)
          docUncertain.push(...uncertain)
        } else {
          throw new Error(
            `«${file.name}»: testo insufficiente. Salva come PDF con testo selezionabile o usa screenshot.`,
          )
        }
      }
      markUncertainExtracted(docUncertain)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi documenti')
    } finally {
      setLoading(false)
    }
  }

  const resolveConflict = (key: string, choice: ConflictChoice) => {
    const c = conflicts.find((x) => x.key === key)
    if (!c) return
    const next = new Map(proposed)
    const src = new Map(sources)
    if (choice === 'use_new') {
      next.set(key, c.newValue)
      src.set(key, c.source === 'gemini' ? 'extract' : 'extract')
    }
    setProposed(next)
    setSources(src)
    setConflicts((list) => list.filter((x) => x.key !== key))
  }

  const resolveAllConflicts = (choice: ConflictChoice) => {
    const next = new Map(proposed)
    const src = new Map(sources)
    for (const c of conflicts) {
      if (choice === 'use_new') {
        next.set(c.key, c.newValue)
        src.set(c.key, 'extract')
      }
    }
    setProposed(next)
    setSources(src)
    setConflicts([])
  }

  const handleEdit = (key: string, value: string) => {
    dirtyRef.current = true
    localEditAt.current = Date.now()
    setUncertainByKey((prev) => clearUncertainKey(prev, key))
    setProposed((prev) => {
      const next = new Map(prev)
      const parsed = parseCellValueFromUi(value)
      if (parsed === undefined) {
        next.delete(key)
      } else {
        next.set(key, parsed)
      }
      return next
    })
    setSources((prev) => {
      const src = new Map(prev)
      if (value.trim() === '') src.delete(key)
      else src.set(key, 'manual')
      return src
    })
  }

  const handleSave = async () => {
    if (!record) return
    const values = proposedMapFromRows(rows)
    const next = applySheetEdits(record, targetId, values)
    try {
      const { record: saved } = applyRecordOptimizations(next, { onlyEmpty: true })
      stashPatientRecord(saved)
      if (isFirebaseConfigured()) {
        await savePatient(saved)
      }
      setRecord(saved)
      onRecordChange?.(saved)
      dirtyRef.current = false
      localEditAt.current = new Date(saved.updatedAt).getTime()
      const nextProposed = new Map<string, SheetCellValue>()
      const nextSources = new Map<string, SheetFieldRow['source']>()
      syncRecordValuesToProposed(saved, targetId, nextProposed, nextSources)
      setProposed(nextProposed)
      setSources(nextSources)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      window.opener?.postMessage(
        { type: SHEET_EDITOR_CHANNEL, patientId, record: saved },
        window.location.origin,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio')
    }
  }

  if (loadError) {
    return (
      <div className="sheet-editor-popup">
        <p className="error-msg">{loadError}</p>
      </div>
    )
  }

  if (!record || !target) {
    return (
      <div className="sheet-editor-popup">
        <p className="hint">Caricamento scheda…</p>
      </div>
    )
  }

  const missingCount = rows.filter((r) => r.displayValue === undefined || r.displayValue === '').length

  return (
    <div className={`sheet-editor-popup${loading ? ' is-loading' : ''}`}>
      {loading && (
        <div className="sheet-loading-overlay" aria-live="polite">
          <span className="spinner" />
          Analisi in corso…
        </div>
      )}
      <header className="sheet-editor-header">
        <div>
          <AppBrand compact />
          <h1>
            {target.study === 'ecmo' ? 'ECMO' : 'ACC'} — {target.sheet}
          </h1>
          <p>
            {record.core.cognome} {record.core.nome} — SDO {record.core.sdo}
          </p>
        </div>
        <div className="sheet-editor-header-actions">
          <button type="button" className="btn-primary" onClick={handleSave}>
            Salva
          </button>
          {saved && <span className="ok">Salvato</span>}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (embedded && onClose) onClose()
              else window.close()
            }}
          >
            {embedded ? 'Torna all’elenco schede' : 'Chiudi finestra'}
          </button>
        </div>
      </header>

      {target.requiresRun && (
        <label className="run-select">
          RUN ECMO
          <select value={ecmoRun} onChange={(e) => setEcmoRun(Number(e.target.value))}>
            {runs.map((r) => (
              <option key={r.runNumber} value={r.runNumber}>
                RUN {r.runNumber}
              </option>
            ))}
          </select>
        </label>
      )}

      <SheetIngestPanel
        textItems={textItems}
        onTextItemsChange={setTextItems}
        imageItems={imageItems}
        onImageItemsChange={setImageItems}
        documentItems={documentItems}
        onDocumentItemsChange={setDocumentItems}
        onAnalyzeText={runTextAnalysis}
        onAnalyzeImages={runImageAnalysis}
        onAnalyzeDocuments={runDocumentAnalysis}
        loading={loading}
        extractCommand={extractCommand}
        onExtractCommandChange={setExtractCommand}
      />

      <div className="calc-row sheet-editor-tools">
        <button type="button" className="btn-secondary" onClick={refreshCalculated}>
          Ottimizza record (P.O.Z.Z.I.)
        </button>
        {optimizeMsg && <p className="hint ok-inline">{optimizeMsg}</p>}
        {error && <p className="error-msg">{error}</p>}
      </div>

      <section className="sheet-editor-table-section">
        <div className="table-toolbar">
          <h2>
            Tutti i campi della scheda ({rows.length - missingCount}/{rows.length} compilati)
          </h2>
          <div className="table-filters">
            <button
              type="button"
              className={tableFilter === 'all' ? 'active' : ''}
              onClick={() => setTableFilter('all')}
            >
              Tutti
            </button>
            <button
              type="button"
              className={tableFilter === 'missing' ? 'active' : ''}
              onClick={() => setTableFilter('missing')}
            >
              Vuoti ({missingCount})
            </button>
            <button
              type="button"
              className={tableFilter === 'filled' ? 'active' : ''}
              onClick={() => setTableFilter('filled')}
            >
              Compilati
            </button>
          </div>
        </div>
        {bothStudies && (
          <p className="hint cross-db-legend">
            Le righe evidenziate in <strong>verde</strong> hanno lo stesso dato su ACC e ECMO: al salvataggio
            il valore si copia nei fogli indicati nella colonna «Propagazione».
          </p>
        )}
        <FullSheetTable
          rows={rows}
          filter={tableFilter}
          onEdit={handleEdit}
          crossDbForRow={crossDbForRow}
          bothStudies={bothStudies}
          getUncertainReason={getUncertainReason}
        />
      </section>

      <ExcelPasteRow
        study={target.study}
        sheet={target.sheet}
        values={proposedMapFromRows(rows)}
        ecmoRun={target.requiresRun ? ecmoRun : undefined}
      />

      {conflicts.length > 0 && (
        <ConflictResolverModal
          conflicts={conflicts}
          onResolve={resolveConflict}
          onResolveAll={resolveAllConflicts}
          onClose={() => setConflicts([])}
        />
      )}
    </div>
  )
}
