import { useMemo, useState } from 'react'
import { absentConventionLabel } from '../lib/excelColumnAnalysis'
import {
  formatAllowedValuesList,
  getAllowedValues,
  getHint,
  getStoredConvention,
  isAiGenerated,
  type FieldCatalogEntry,
  type FieldHintsStore,
} from '../lib/fieldHints'
import { orderedSheets } from '../lib/sheetSchema'

type Props = {
  catalog: FieldCatalogEntry[]
  store: FieldHintsStore
  columnSamples: Record<string, string[]>
  studyFilter: 'all' | 'ecmo' | 'acc'
  sheetFilter: string
  search: string
  onHintChange: (entry: FieldCatalogEntry, hint: string) => void
}

function formatDbSamples(samples: string[] | undefined): string {
  if (!samples?.length) return ''
  if (samples.length <= 6) return samples.join(' · ')
  return `${samples.slice(0, 6).join(' · ')} …`
}

export function SettingsFieldCatalog({
  catalog,
  store,
  columnSamples,
  studyFilter,
  sheetFilter,
  search,
  onHintChange,
}: Props) {
  const [openSheets, setOpenSheets] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const studies: ('ecmo' | 'acc')[] =
      studyFilter === 'all' ? ['ecmo', 'acc'] : [studyFilter]

    const out: { study: 'ecmo' | 'acc'; sheet: string; entries: FieldCatalogEntry[] }[] = []

    for (const study of studies) {
      for (const sheet of orderedSheets(study)) {
        if (sheetFilter !== 'all' && sheet !== sheetFilter) continue
        const entries = catalog.filter((e) => {
          if (e.study !== study || e.sheet !== sheet) return false
          if (!q) return true
          return (
            e.column.toLowerCase().includes(q) ||
            e.sheet.toLowerCase().includes(q) ||
            getHint(store, e).toLowerCase().includes(q)
          )
        })
        if (entries.length) out.push({ study, sheet, entries })
      }
    }
    return out
  }, [catalog, studyFilter, sheetFilter, search, store])

  const toggleSheet = (key: string) => {
    setOpenSheets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!grouped.length) {
    return <p className="hint">Nessun campo corrisponde ai filtri.</p>
  }

  return (
    <div className="settings-catalog">
      {grouped.map(({ study, sheet, entries }) => {
        const sectionKey = `${study}:${sheet}`
        const open = openSheets[sectionKey] ?? (sheetFilter !== 'all' || studyFilter !== 'all')
        const withHint = entries.filter((e) => getHint(store, e).trim()).length
        return (
          <section key={sectionKey} className="settings-sheet-section">
            <button
              type="button"
              className="settings-sheet-head"
              onClick={() => toggleSheet(sectionKey)}
              aria-expanded={open}
            >
              <span className="settings-sheet-title">
                <strong>{study.toUpperCase()}</strong>
                <code>{sheet}</code>
              </span>
              <span className="settings-sheet-meta">
                {entries.length} colonne · {withHint} con significato IA
              </span>
              <span className="settings-sheet-chevron">{open ? '▼' : '▶'}</span>
            </button>
            {open && (
              <div className="settings-table-wrap settings-table-wrap--wide">
                <table className="settings-table settings-table--catalog">
                  <thead>
                    <tr>
                      <th className="col-field-name">Colonna</th>
                      <th className="col-ai-meaning">Cosa capisce l’IA (significato)</th>
                      <th className="col-db-samples">Esempi nel DB</th>
                      <th className="col-allowed">Valori ammessi</th>
                      <th className="col-absent">Nota analisi DB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const sampleKey = `${entry.sheet}:${entry.column}`
                      return (
                        <FieldMetaRow
                          key={entry.key}
                          entry={entry}
                          hint={getHint(store, entry)}
                          dbSamples={formatDbSamples(columnSamples[sampleKey])}
                          allowed={getAllowedValues(store, entry)}
                          convention={getStoredConvention(store, entry)}
                          aiGenerated={isAiGenerated(store, entry)}
                          onHintChange={onHintChange}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function FieldMetaRow({
  entry,
  hint,
  dbSamples,
  allowed,
  convention,
  aiGenerated,
  onHintChange,
}: {
  entry: FieldCatalogEntry
  hint: string
  dbSamples: string
  allowed: string[]
  convention?: { convention: 'empty' | 'false' | 'zero'; reason: string }
  aiGenerated: boolean
  onHintChange: (entry: FieldCatalogEntry, hint: string) => void
}) {
  return (
    <tr
      className={[hint.trim() ? 'has-hint' : '', aiGenerated && hint.trim() ? 'hint-ai-generated' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <td className="col-field-name">
        <code>{entry.column}</code>
      </td>
      <td className="col-ai-meaning">
        <textarea
          rows={3}
          value={hint}
          placeholder="Significato per l’estrazione. Se il dato non c’è nel referto → lasciare vuoto."
          onChange={(e) => onHintChange(entry, e.target.value)}
        />
        {aiGenerated && hint.trim() && <span className="tag-ai-ok">IA</span>}
      </td>
      <td className="col-db-samples">
        {dbSamples ? (
          <span className="settings-db-samples" title={dbSamples}>
            {dbSamples}
          </span>
        ) : (
          <span className="hint">—</span>
        )}
      </td>
      <td className="settings-allowed-cell col-allowed">
        {allowed.length > 0 ? (
          <span className="settings-allowed-list" title={allowed.join('\n')}>
            {formatAllowedValuesList(allowed)}
          </span>
        ) : (
          <span className="hint">—</span>
        )}
      </td>
      <td className="settings-absent-cell col-absent">
        {convention ? (
          <span className="hint" title={convention.reason}>
            Nel DB spesso: {absentConventionLabel(convention.convention)} — in app si lascia{' '}
            <strong>vuoto</strong> se non trovato
          </span>
        ) : (
          <span className="hint">—</span>
        )}
      </td>
    </tr>
  )
}
