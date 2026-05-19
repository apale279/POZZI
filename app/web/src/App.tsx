import { useCallback, useMemo, useState } from 'react'
import { AppBrand } from './components/AppBrand'
import { SettingsGate } from './components/SettingsGate'
import { SettingsScreen } from './components/SettingsScreen'
import { isSettingsUnlocked } from './lib/settingsAuth'
import { SheetWorkbench } from './components/SheetWorkbench'
import { clearColumnConventions } from './lib/excelColumnAnalysis'
import { clearCrossPropagateSession } from './lib/crossPropagateSession'
import { clearAllWorkCells } from './lib/workSession'
import { orderedSheets, sheetSchemaSource } from './lib/sheetSchema'
import './App.css'

type Study = 'ecmo' | 'acc'
type View = 'sheet' | 'settings'

function parseLocation(): { view: View; study: Study; sheet: string } {
  const q = new URLSearchParams(window.location.search)
  const view = q.get('view') === 'settings' ? 'settings' : 'sheet'
  const study = q.get('study') === 'acc' ? 'acc' : 'ecmo'
  const sheets = orderedSheets(study)
  const sheet = q.get('sheet') && sheets.includes(q.get('sheet')!) ? q.get('sheet')! : sheets[0] ?? ''
  return { view, study, sheet }
}

function pushLocation(view: View, study: Study, sheet: string) {
  const q = new URLSearchParams()
  if (view === 'settings') {
    q.set('view', 'settings')
  } else {
    q.set('study', study)
    q.set('sheet', sheet)
  }
  const url = `${window.location.pathname}?${q}`
  window.history.replaceState(null, '', url)
}

export default function App() {
  const initial = useMemo(() => parseLocation(), [])
  const [view, setView] = useState<View>(initial.view)
  const [study, setStudy] = useState<Study>(initial.study)
  const [sheet, setSheet] = useState(initial.sheet)
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => isSettingsUnlocked())

  const ecmoSheets = useMemo(() => orderedSheets('ecmo'), [])
  const accSheets = useMemo(() => orderedSheets('acc'), [])
  const activeSheets = study === 'ecmo' ? ecmoSheets : accSheets

  const goSheet = useCallback((s: Study, sh: string) => {
    setView('sheet')
    setStudy(s)
    setSheet(sh)
    pushLocation('sheet', s, sh)
  }, [])

  const goSettings = useCallback(() => {
    setView('settings')
    pushLocation('settings', study, sheet)
  }, [study, sheet])

  const switchStudy = useCallback(
    (s: Study) => {
      const first = orderedSheets(s)[0] ?? ''
      goSheet(s, first)
    },
    [goSheet],
  )

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <header className="sidebar-brand" aria-label="P.O.Z.Z.I.">
          <AppBrand compact />
          <h1 className="sidebar-app-name">P.O.Z.Z.I.</h1>
          <p className="sidebar-app-motto">
            PROCEDURA OTTIMIZZATA per ZERO ZAVORRE INFORMATICHE
          </p>
        </header>
        <p className="sidebar-tagline">Compilazione database ECMO / ACC</p>

        <div className="sidebar-study-toggle">
          <button
            type="button"
            className={study === 'ecmo' && view === 'sheet' ? 'active' : ''}
            onClick={() => switchStudy('ecmo')}
          >
            ECMO
          </button>
          <button
            type="button"
            className={study === 'acc' && view === 'sheet' ? 'active' : ''}
            onClick={() => switchStudy('acc')}
          >
            ACC
          </button>
        </div>

        <nav className="sidebar-sheets" aria-label="Fogli Excel">
          {activeSheets.map((name) => (
            <button
              key={name}
              type="button"
              className={view === 'sheet' && sheet === name ? 'active' : ''}
              onClick={() => goSheet(study, name)}
            >
              {name}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className={view === 'settings' ? 'active' : ''} onClick={goSettings}>
            Impostazioni
          </button>
          <button
            type="button"
            className="btn-ghost sidebar-clear"
            onClick={() => {
              if (window.confirm('Cancellare tutti i valori compilati in questa sessione?')) {
                clearAllWorkCells()
                clearColumnConventions()
                clearCrossPropagateSession()
                window.location.reload()
              }
            }}
          >
            Svuota dati sessione
          </button>
          {sheetSchemaSource() === 'uploaded' && (
            <p className="hint">Struttura da Excel caricato</p>
          )}
        </div>
      </aside>

      <main className="app-main app-main-wide">
        {view === 'settings' ? (
          settingsUnlocked ? (
            <SettingsScreen />
          ) : (
            <SettingsGate onUnlocked={() => setSettingsUnlocked(true)} />
          )
        ) : sheet ? (
          <SheetWorkbench key={`${study}:${sheet}`} study={study} sheet={sheet} />
        ) : (
          <p className="hint">Nessun foglio disponibile. Carica la struttura DB in Impostazioni.</p>
        )}
      </main>
    </div>
  )
}
