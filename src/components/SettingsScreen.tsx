import { useCallback, useEffect, useMemo, useState } from 'react'
import { SettingsFieldCatalog } from './SettingsFieldCatalog'
import { importDbMetadata, mergeImportIntoFieldHints } from '../lib/dbMetadataImport'
import { clearColumnConventions, mergeColumnConventions } from '../lib/excelColumnAnalysis'
import {
  buildFieldCatalog,
  getHint,
  loadFieldHints,
  normalizeFieldHintsStore,
  saveFieldHints,
  type FieldCatalogEntry,
  type FieldHintsStore,
} from '../lib/fieldHints'
import {
  applyFieldHintsConventionsLocally,
  loadFieldHintsFromFirebase,
  mergeFirebaseFieldHints,
  saveFieldHintsToFirebase,
} from '../lib/fieldHintsFirestore'
import { generateFieldHintsBatch } from '../lib/generateFieldHints'
import { formatFirebaseError, isFirebaseConfigured } from '../lib/firebase'
import {
  clearSheetSchemaOverride,
  orderedSheets,
  saveSheetSchemaOverride,
  sheetSchemaSource,
} from '../lib/sheetSchema'

type StudyFilter = 'all' | 'ecmo' | 'acc'

async function persistStore(
  store: FieldHintsStore,
  setSaveMsg: (msg: string | null) => void,
): Promise<FieldHintsStore> {
  const next = { ...store, updatedAt: new Date().toISOString() }
  saveFieldHints(next)
  applyFieldHintsConventionsLocally(next)
  if (!isFirebaseConfigured()) {
    setSaveMsg('Salvato in questo browser.')
    return next
  }
  try {
    await saveFieldHintsToFirebase(next)
    setSaveMsg('Salvato in browser e su Firebase (condiviso tra sessioni e team).')
  } catch (e) {
    setSaveMsg(`Salvato in browser. Firebase: ${formatFirebaseError(e)}`)
  }
  return next
}

export function SettingsScreen() {
  const catalog = useMemo(() => buildFieldCatalog(), [])
  const [store, setStore] = useState<FieldHintsStore>(() => loadFieldHints())
  const [studyFilter, setStudyFilter] = useState<StudyFilter>('all')
  const [sheetFilter, setSheetFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<string | null>(null)
  const [accDbFile, setAccDbFile] = useState<File | null>(null)
  const [ecmoDbFile, setEcmoDbFile] = useState<File | null>(null)
  const [schemaMsg, setSchemaMsg] = useState<string | null>(null)
  const [columnSamples, setColumnSamples] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      applyFieldHintsConventionsLocally(loadFieldHints())
      return
    }
    setLoading(true)
    loadFieldHintsFromFirebase()
      .then((remote) => {
        const merged = mergeFirebaseFieldHints(loadFieldHints(), remote)
        setStore(merged)
        saveFieldHints(merged)
        applyFieldHintsConventionsLocally(merged)
      })
      .finally(() => setLoading(false))
  }, [])

  const sheets = useMemo(() => {
    const list: string[] = []
    const studies: ('ecmo' | 'acc')[] =
      studyFilter === 'all' ? ['ecmo', 'acc'] : [studyFilter]
    for (const study of studies) {
      for (const sheet of orderedSheets(study)) {
        if (!list.includes(sheet)) list.push(sheet)
      }
    }
    return ['all', ...list]
  }, [studyFilter])

  const withHintCount = useMemo(
    () => catalog.filter((e) => getHint(store, e).trim().length > 0).length,
    [catalog, store],
  )

  const setHint = useCallback((entry: FieldCatalogEntry, hint: string) => {
    setStore((prev) => {
      const next = {
        ...prev,
        hints: { ...prev.hints, [entry.key]: hint },
        aiGenerated: { ...prev.aiGenerated, [entry.key]: false },
      }
      saveFieldHints(next)
      return next
    })
  }, [])

  const handleSave = async () => {
    const next = await persistStore(store, setSaveMsg)
    setStore(next)
    setTimeout(() => setSaveMsg(null), 8000)
  }

  const handleImportDb = async () => {
    if (!accDbFile && !ecmoDbFile) {
      setSchemaMsg('Seleziona almeno un file Excel (ACC o ECMO).')
      return
    }
    try {
      const result = await importDbMetadata(accDbFile, ecmoDbFile)
      saveSheetSchemaOverride(result.schema)
      mergeColumnConventions(result.conventions)
      setColumnSamples(result.samples)
      let base = store
      if (isFirebaseConfigured()) {
        const remote = await loadFieldHintsFromFirebase()
        base = mergeFirebaseFieldHints(loadFieldHints(), remote)
      }
      const merged = mergeImportIntoFieldHints(base, catalog, result)
      const saved = await persistStore(merged, setSaveMsg)
      setStore(saved)
      setSchemaMsg(
        `${result.schemaMsg}${isFirebaseConfigured() ? ' Salvato su Firebase.' : ' Salvato in locale.'}`,
      )
    } catch (e) {
      setSchemaMsg(e instanceof Error ? e.message : 'Errore lettura Excel')
    }
  }

  const handleResetSchema = () => {
    clearSheetSchemaOverride()
    clearColumnConventions()
    setColumnSamples({})
    setSchemaMsg('Ripristinata struttura predefinita. Ricarica la pagina.')
  }

  const handleReloadFromFirebase = async () => {
    if (!isFirebaseConfigured()) {
      setSaveMsg('Firebase non configurato.')
      return
    }
    setLoading(true)
    try {
      const remote = await loadFieldHintsFromFirebase()
      if (!remote) {
        setSaveMsg('Nessun documento config/fieldHints su Firebase.')
        return
      }
      const merged = normalizeFieldHintsStore(remote)
      const saved = await persistStore(merged, setSaveMsg)
      setStore(saved)
      applyFieldHintsConventionsLocally(saved)
      setGenProgress(null)
    } catch (e) {
      setSaveMsg(formatFirebaseError(e))
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateHints = async (overwriteAll = false) => {
    const targets = overwriteAll
      ? catalog
      : catalog.filter((e) => !getHint(store, e).trim())
    if (!targets.length) {
      setGenProgress(
        overwriteAll
          ? 'Nessun campo nel catalogo.'
          : 'Tutti i campi hanno già un testo. Usa «Rigenera tutti» per sovrascrivere.',
      )
      return
    }
    if (
      overwriteAll &&
      !window.confirm(
        `Rigenerare i significati IA per ${targets.length} campi? I testi esistenti verranno sostituiti.`,
      )
    ) {
      return
    }
    setGenerating(true)
    setGenProgress('IA: analisi significato campi dal DB…')
    try {
      const inputs = targets.map((e) => {
        const sampleKey = `${e.sheet}:${e.column}`
        return {
          key: e.key,
          study: e.study,
          sheet: e.sheet,
          column: e.column,
          samples: columnSamples[sampleKey],
          allowedValues: store.allowedValues[e.key],
        }
      })
      const results = await generateFieldHintsBatch(inputs, (done, total) => {
        setGenProgress(`IA: ${done}/${total} campi…`)
      })
      const nextStore: FieldHintsStore = {
        ...store,
        hints: { ...store.hints },
        aiGenerated: { ...store.aiGenerated },
      }
      for (const r of results) {
        if (r.hint?.trim()) {
          nextStore.hints[r.key] = r.hint.trim()
          nextStore.aiGenerated[r.key] = r.confidence === 'high'
        }
      }
      const saved = await persistStore(nextStore, setSaveMsg)
      setStore(saved)
      const high = results.filter((r) => r.confidence === 'high').length
      setGenProgress(
        `Completato: ${results.length} campi (${high} ad alta confidenza). Salvato su Firebase.`,
      )
    } catch (e) {
      setGenProgress(e instanceof Error ? e.message : 'Errore generazione IA')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="settings-screen">
      <header className="settings-head">
        <h2>Impostazioni</h2>
        <p className="hint">
          Catalogo di tutti i campi per <strong>DB ECMO</strong> e <strong>DB ACC</strong>, organizzato
          per foglio. Salvataggio su <strong>Firebase</strong> (documento{' '}
          <code>config/fieldHints</code>): non viene cancellato con «Svuota dati sessione». Carica i
          file Excel: l’app studia le righe già compilate, importa i valori
          ammessi da <strong>TENDINE SLIM</strong> (ECMO). Se un dato non è nel referto si lascia{' '}
          <strong>vuoto</strong> (nessun valore predefinito). Salvataggio su <strong>Firebase</strong>.
        </p>
        <p className="hint">
          {withHintCount} / {catalog.length} campi con significato IA
          {loading && ' · caricamento da Firebase…'}
          {sheetSchemaSource() === 'uploaded' && ' · struttura da file Excel caricati'}
        </p>
      </header>

      <section className="settings-panel">
        <h3>Database Excel</h3>
        <p className="hint">
          Carica i .xlsx dei due DB. Verranno analizzate le righe dati (fino a 500 per foglio), le
          regole «se assente» (vuoto / FALSE / 0) e l’elenco valori dal foglio{' '}
          <strong>TENDINE SLIM</strong> nel file ECMO.
        </p>
        <div className="settings-db-upload">
          <label className="file-pick">
            File ACC
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setAccDbFile(e.target.files?.[0] ?? null)}
            />
            {accDbFile && <span className="file-name">{accDbFile.name}</span>}
          </label>
          <label className="file-pick">
            File ECMO
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setEcmoDbFile(e.target.files?.[0] ?? null)}
            />
            {ecmoDbFile && <span className="file-name">{ecmoDbFile.name}</span>}
          </label>
          <button type="button" className="btn-secondary" onClick={handleImportDb}>
            Carica e analizza DB
          </button>
          <button type="button" className="btn-ghost" onClick={handleResetSchema}>
            Ripristina predefinita
          </button>
        </div>
        {schemaMsg && <p className="ok-inline">{schemaMsg}</p>}
        {saveMsg && <p className="ok-inline">{saveMsg}</p>}
        <div className="settings-generate-row">
          <button
            type="button"
            className="btn-primary"
            disabled={generating || loading}
            onClick={() => handleGenerateHints(false)}
          >
            {generating ? 'Generazione…' : 'Genera significati (solo vuoti)'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={generating || loading}
            onClick={() => handleGenerateHints(true)}
          >
            Rigenera tutti (sovrascrive)
          </button>
          {isFirebaseConfigured() && (
            <button
              type="button"
              className="btn-ghost"
              disabled={loading}
              onClick={handleReloadFromFirebase}
            >
              Ripristina da Firebase
            </button>
          )}
          {genProgress && <p className="hint settings-gen-progress">{genProgress}</p>}
        </div>
      </section>

      <div className="settings-toolbar">
        <label>
          Database
          <select
            value={studyFilter}
            onChange={(e) => {
              setStudyFilter(e.target.value as StudyFilter)
              setSheetFilter('all')
            }}
          >
            <option value="all">ECMO + ACC</option>
            <option value="ecmo">Solo ECMO</option>
            <option value="acc">Solo ACC</option>
          </select>
        </label>
        <label>
          Foglio
          <select value={sheetFilter} onChange={(e) => setSheetFilter(e.target.value)}>
            {sheets.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'Tutti i fogli' : s}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-search">
          Cerca colonna
          <input
            type="search"
            placeholder="ACEi, Diagnosi, pH…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary" onClick={handleSave}>
          Salva su Firebase
        </button>
      </div>

      <SettingsFieldCatalog
        catalog={catalog}
        store={store}
        columnSamples={columnSamples}
        studyFilter={studyFilter}
        sheetFilter={sheetFilter}
        search={search}
        onHintChange={setHint}
      />
    </div>
  )
}
