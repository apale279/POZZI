import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSheetColumnsList } from '../lib/completion'
import { formatCellValueForUi, parseCellValueFromUi, type SheetCellValue } from '../lib/cellValueFormat'
import {
  extractTextFromDocument,
  hasEnoughExtractedText,
} from '../lib/documentExtract'
import { findCrossDbTargets } from '../lib/crossDbLinks'
import { getColumnConvention } from '../lib/excelColumnAnalysis'
import {
  buildFieldHintsPromptBlockForSheet,
  fieldHintKey,
  formatAllowedValuesList,
  getAllowedValues,
  getStoredConvention,
  loadFieldHints,
} from '../lib/fieldHints'
import {
  analyzeDocumentWithGemini,
  analyzeImageWithGemini,
  analyzeTextWithGemini,
} from '../lib/geminiClient'
import { loadExtractCommand, saveExtractCommand } from '../lib/extractCommand'
import {
  combineGeminiExtractColumns,
  mergeGeminiColumnsForSheet,
  sheetContextLabel,
  uncertainFieldsForAppliedKeys,
} from '../lib/sheetExtract'
import {
  clearUncertainKey,
  mergeUncertainKeyMap,
  type GeminiUncertainField,
} from '../lib/geminiUncertainty'
import {
  confirmPropagation,
  loadConfirmedPropagations,
  loadSkippedPropagations,
  resetPropagationsForSource,
  skipPropagation,
} from '../lib/crossPropagateSession'
import type { CrossDbTarget } from '../lib/crossDbLinks'
import {
  cellKey,
  loadWorkCells,
  parseCellKey,
  saveWorkCells,
  setWorkCell,
} from '../lib/workSession'
import { ExcelPasteRow } from './ExcelPasteRow'
import { SheetFieldsTable, type SheetColumnRow, type SheetFieldSource } from './SheetFieldsTable'
import {
  SheetIngestPanel,
  type DocumentItem,
  type ImageItem,
  type TextItem,
} from './SheetIngestPanel'

type Props = {
  study: 'ecmo' | 'acc'
  sheet: string
}

export function SheetWorkbench({ study, sheet }: Props) {
  const [cells, setCells] = useState(loadWorkCells)
  const [sources, setSources] = useState<Record<string, SheetFieldSource>>({})
  const [textItems, setTextItems] = useState<TextItem[]>([{ id: crypto.randomUUID(), text: '' }])
  const [imageItems, setImageItems] = useState<ImageItem[]>([])
  const [documentItems, setDocumentItems] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState<'all' | 'missing' | 'filled'>('all')
  const [ecmoRun, setEcmoRun] = useState(1)
  const [extractCommand, setExtractCommand] = useState(() => loadExtractCommand(study, sheet))
  const [skippedPropagations, setSkippedPropagations] = useState(loadSkippedPropagations)
  const [confirmedPropagations, setConfirmedPropagations] = useState(loadConfirmedPropagations)
  const [uncertainByKey, setUncertainByKey] = useState<Record<string, string>>({})
  const editSnapshotRef = useRef<Record<string, string>>({})

  const columns = useMemo(() => getSheetColumnsList(study, sheet), [study, sheet])
  const hasRunCol = columns.some((c) => c.trim().toUpperCase() === 'RUN')
  const contextLabel = sheetContextLabel(study, sheet, study === 'ecmo' && hasRunCol ? ecmoRun : undefined)

  const fieldHintsBlock = useMemo(
    () => buildFieldHintsPromptBlockForSheet(study, sheet, loadFieldHints()),
    [study, sheet],
  )

  const geminiOptions = useMemo(
    () => ({
      fieldHintsPrompt: fieldHintsBlock,
      extractCommand,
    }),
    [fieldHintsBlock, extractCommand],
  )

  useEffect(() => {
    setExtractCommand(loadExtractCommand(study, sheet))
    setUncertainByKey({})
  }, [study, sheet])

  useEffect(() => {
    saveExtractCommand(study, sheet, extractCommand)
  }, [study, sheet, extractCommand])

  useEffect(() => {
    saveWorkCells(cells)
  }, [cells])

  const valuesMap = useMemo(() => {
    const m = new Map<string, SheetCellValue>()
    for (const col of columns) {
      const v = cells[cellKey(study, sheet, col)]
      if (v !== undefined && v !== '') m.set(cellKey(study, sheet, col), v)
    }
    return m
  }, [cells, columns, study, sheet])

  const tableRows: SheetColumnRow[] = useMemo(
    () =>
      columns.map((column) => {
        const key = cellKey(study, sheet, column)
        const value = cells[key]
        const filled = value !== undefined && value !== null && value !== ''
        const hintsStore = loadFieldHints()
        const entryKey = fieldHintKey(study, sheet, column)
        const storedConv = getStoredConvention(hintsStore, {
          key: entryKey,
          study,
          sheet,
          column,
        })
        const conv = storedConv ?? getColumnConvention(study, sheet, column)
        const allowed = getAllowedValues(hintsStore, {
          key: entryKey,
          study,
          sheet,
          column,
        })
        const uncertainReason = uncertainByKey[key]
        return {
          column,
          value: filled ? value : undefined,
          source: sources[key] ?? (filled ? 'saved' : 'empty'),
          crossDb: findCrossDbTargets(study, sheet, column, true),
          absentConvention: conv?.convention,
          absentReason: 'reason' in (conv ?? {}) ? (conv as { reason?: string }).reason : undefined,
          allowedValuesHint: allowed.length ? formatAllowedValuesList(allowed) : undefined,
          aiUncertain: filled && Boolean(uncertainReason),
          aiUncertainReason: uncertainReason,
        }
      }),
    [columns, cells, sources, study, sheet, uncertainByKey],
  )

  const missingCount = tableRows.filter((r) => r.value === undefined || r.value === '').length

  const applyExtracted = useCallback((incoming: Map<string, SheetCellValue>) => {
    if (!incoming.size) return 0
    setCells((prev) => {
      let next = { ...prev }
      for (const [key, val] of incoming) {
        const loc = parseCellKey(key)
        if (!loc) continue
        if (next[key] !== undefined && next[key] !== '') continue
        next = setWorkCell(next, loc.study, loc.sheet, loc.column, val, { propagate: false })
      }
      return next
    })
    setSources((prev) => {
      const nextSources = { ...prev }
      for (const key of incoming.keys()) nextSources[key] = 'extract'
      return nextSources
    })
    return incoming.size
  }, [])

  const mergeGemini = useCallback(
    (gemini: { columns?: Record<string, string | number>; uncertain?: GeminiUncertainField[] }) => {
      const draft = new Map<string, SheetCellValue>()
      for (const col of columns) {
        const k = cellKey(study, sheet, col)
        const v = cells[k]
        if (v !== undefined && v !== '') draft.set(k, v)
      }
      mergeGeminiColumnsForSheet(
        study,
        sheet,
        combineGeminiExtractColumns(study, sheet, gemini),
        draft,
        true,
      )
      const onlyNew = new Map<string, SheetCellValue>()
      for (const col of columns) {
        const k = cellKey(study, sheet, col)
        const before = cells[k]
        const after = draft.get(k)
        if ((before === undefined || before === '') && after !== undefined) {
          onlyNew.set(k, after)
        }
      }
      const count = applyExtracted(onlyNew)
      const uncertain = uncertainFieldsForAppliedKeys(study, sheet, gemini.uncertain, onlyNew.keys())
      return { count, uncertain }
    },
    [applyExtracted, cells, columns, sheet, study],
  )

  const markUncertainExtracted = useCallback(
    (items: GeminiUncertainField[]) => {
      if (!items.length) return
      setUncertainByKey((prev) => mergeUncertainKeyMap(prev, study, sheet, items))
    },
    [study, sheet],
  )

  const runTextAnalysis = async () => {
    setLoading(true)
    setError(null)
    let total = 0
    const allUncertain: GeminiUncertainField[] = []
    try {
      for (const item of textItems) {
        if (!item.text.trim()) continue
        const gemini = await analyzeTextWithGemini(
          item.text.slice(0, 12000),
          contextLabel,
          geminiOptions,
        )
        const { count, uncertain } = mergeGemini(gemini)
        total += count
        allUncertain.push(...uncertain)
      }
      if (total === 0) {
        setError('Nessun valore riconosciuto per questo foglio. Controlla le istruzioni IA in Impostazioni.')
      } else {
        markUncertainExtracted(allUncertain)
        const warn =
          allUncertain.length > 0 ? ` · ${allUncertain.length} da verificare (⚠ in Stato)` : ''
        setMsg(`${total} campi compilati dall’analisi testo${warn}.`)
        setTimeout(() => setMsg(null), 6000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi testo')
    } finally {
      setLoading(false)
    }
  }

  const runImageAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      let total = 0
      const allUncertain: GeminiUncertainField[] = []
      for (const item of imageItems) {
        const gemini = await analyzeImageWithGemini(item.file, contextLabel, geminiOptions)
        const { count, uncertain } = mergeGemini(gemini)
        total += count
        allUncertain.push(...uncertain)
      }
      if (total === 0) setError('Nessun valore estratto dalle immagini.')
      else {
        markUncertainExtracted(allUncertain)
        const warn =
          allUncertain.length > 0 ? ` · ${allUncertain.length} da verificare (⚠ in Stato)` : ''
        setMsg(`${total} campi da immagini${warn}.`)
        setTimeout(() => setMsg(null), 6000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi immagini')
    } finally {
      setLoading(false)
    }
  }

  const runDocumentAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      let total = 0
      const allUncertain: GeminiUncertainField[] = []
      for (const item of documentItems) {
        const file = item.file
        let extracted: string | null = null
        try {
          extracted = (await extractTextFromDocument(file)).text
        } catch {
          extracted = null
        }

        if (extracted && hasEnoughExtractedText(extracted)) {
          const gemini = await analyzeTextWithGemini(
            extracted.slice(0, 12000),
            contextLabel,
            geminiOptions,
          )
          const merged = mergeGemini(gemini)
          total += merged.count
          allUncertain.push(...merged.uncertain)
        } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          const gemini = await analyzeDocumentWithGemini(file, contextLabel, geminiOptions)
          const merged = mergeGemini(gemini)
          total += merged.count
          allUncertain.push(...merged.uncertain)
        } else {
          throw new Error(`«${file.name}»: testo insufficiente.`)
        }
      }
      if (total === 0) setError('Nessun valore estratto dai documenti.')
      else {
        markUncertainExtracted(allUncertain)
        const warn =
          allUncertain.length > 0 ? ` · ${allUncertain.length} da verificare (⚠ in Stato)` : ''
        setMsg(`${total} campi da documenti${warn}.`)
        setTimeout(() => setMsg(null), 6000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore analisi documenti')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (column: string, raw: string) => {
    const parsed = parseCellValueFromUi(raw)
    const key = cellKey(study, sheet, column)
    setCells((prev) => {
      const next = setWorkCell(prev, study, sheet, column, parsed, { propagate: false })
      return next
    })
    setSources((prev) => {
      const next = { ...prev }
      if (parsed === undefined) delete next[key]
      else next[key] = 'manual'
      return next
    })
    setUncertainByKey((prev) => clearUncertainKey(prev, key))
  }

  const handleEditFocus = (column: string) => {
    const key = cellKey(study, sheet, column)
    const v = cells[key]
    editSnapshotRef.current[key] = v === undefined ? '' : formatCellValueForUi(v)
  }

  const handleEditCommit = (column: string, raw: string) => {
    const key = cellKey(study, sheet, column)
    const parsed = parseCellValueFromUi(raw)
    const nextDisplay = parsed === undefined ? '' : formatCellValueForUi(parsed)
    const before = editSnapshotRef.current[key] ?? ''
    if (before !== nextDisplay) {
      const reset = resetPropagationsForSource(key, confirmedPropagations, skippedPropagations)
      setConfirmedPropagations(reset.confirmed)
      setSkippedPropagations(reset.skipped)
    }
    delete editSnapshotRef.current[key]
  }

  const handleConfirmPropagate = (
    sourceColumn: string,
    value: SheetCellValue,
    target: CrossDbTarget,
  ) => {
    const sourceKey = cellKey(study, sheet, sourceColumn)
    const targetKey = cellKey(target.study, target.sheet, target.column)
    setCells((prev) => ({ ...prev, [targetKey]: value }))
    setSources((prev) => ({ ...prev, [targetKey]: 'propagated' }))
    setConfirmedPropagations((prev) => confirmPropagation(sourceKey, target, prev))
    setMsg(`Valore copiato in ${target.study.toUpperCase()} → ${target.sheet} → ${target.column}`)
    setTimeout(() => setMsg(null), 4000)
  }

  const handleSkipPropagate = (sourceColumn: string, target: CrossDbTarget) => {
    const sourceKey = cellKey(study, sheet, sourceColumn)
    setSkippedPropagations((prev) => skipPropagation(sourceKey, target, prev))
  }

  const studyLabel = study === 'ecmo' ? 'ECMO' : 'ACC'

  return (
    <div className="sheet-workbench">
      <header className="workbench-head">
        <h2>
          {studyLabel} — <span className="sheet-title">{sheet}</span>
        </h2>
        <p className="hint">
          Carica referti o testo, poi compila i campi vuoti (evidenziati in giallo). Per ogni riga in
          «Utile anche in» devi scegliere «Sì, copia» o «No»: niente copia automatica. «✓ Copiato»
          compare solo dopo la tua conferma.
        </p>
        <p className="workbench-stats">
          {columns.length - missingCount} / {columns.length} campi compilati
          {missingCount > 0 && (
            <span className="warn-inline"> · {missingCount} da completare</span>
          )}
        </p>
      </header>

      {study === 'ecmo' && hasRunCol && (
        <label className="run-picker">
          RUN ECMO
          <input
            type="number"
            min={1}
            value={ecmoRun}
            onChange={(e) => setEcmoRun(Math.max(1, Number(e.target.value) || 1))}
          />
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

      {error && <p className="error-msg">{error}</p>}
      {msg && <p className="ok-inline">{msg}</p>}

      <div className="workbench-toolbar">
        <label>
          Mostra
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value as typeof tableFilter)}
          >
            <option value="all">Tutti i campi</option>
            <option value="missing">Solo vuoti</option>
            <option value="filled">Solo compilati</option>
          </select>
        </label>
      </div>

      <SheetFieldsTable
        rows={tableRows}
        study={study}
        sheet={sheet}
        cells={cells}
        confirmedPropagations={confirmedPropagations}
        skippedPropagations={skippedPropagations}
        onEdit={handleEdit}
        onEditFocus={handleEditFocus}
        onEditCommit={handleEditCommit}
        onConfirmPropagate={handleConfirmPropagate}
        onSkipPropagate={handleSkipPropagate}
        filter={tableFilter}
      />

      <ExcelPasteRow
        study={study}
        sheet={sheet}
        values={valuesMap}
        ecmoRun={hasRunCol ? ecmoRun : undefined}
      />
    </div>
  )
}
