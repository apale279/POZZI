import { useMemo } from 'react'

import type { PatientRecord } from '../types/canonical'

import { computeAllCompletions, overallCompletion } from '../lib/completion'



type Props = {

  record: PatientRecord

  onOpenSheet?: (targetId: string) => void

}



function barColor(pct: number): string {

  if (pct >= 80) return '#0f766e'

  if (pct >= 40) return '#ca8a04'

  return '#dc2626'

}



function SheetList({

  items,

  onOpenSheet,

}: {

  items: ReturnType<typeof computeAllCompletions>

  onOpenSheet?: (targetId: string) => void

}) {

  return (

    <ul className="completion-list">

      {items.map((c) => (

        <li key={c.targetId}>

          <div className="completion-item">

            <div className="completion-item-head">

              <span className="completion-label">{c.sheet}</span>

              <span className="completion-pct" style={{ color: barColor(c.percent) }}>

                {c.percent}%

              </span>

            </div>

            <span className="completion-meta">

              {c.filledFields}/{c.totalFields} campi

            </span>

            <div className="progress-track">

              <div

                className="progress-fill"

                style={{ width: `${c.percent}%`, background: barColor(c.percent) }}

              />

            </div>

            <button

              type="button"

              className="btn-primary open-sheet-btn"

              onClick={() => onOpenSheet?.(c.targetId)}

            >

              Apri foglio

            </button>

            {c.percent < 100 && c.missingColumns.length > 0 && (

              <details className="missing-cols">

                <summary>Mancano {c.missingColumns.length} campi</summary>

                <p>

                  {c.missingColumns.slice(0, 12).join(', ')}

                  {c.missingColumns.length > 12 ? '…' : ''}

                </p>

              </details>

            )}

          </div>

        </li>

      ))}

    </ul>

  )

}



export function CompletionOverview({ record, onOpenSheet }: Props) {

  const completions = useMemo(() => computeAllCompletions(record), [record])

  const overall = overallCompletion(completions)



  const accSheets = useMemo(

    () => completions.filter((c) => c.study === 'acc'),

    [completions],

  )

  const ecmoSheets = useMemo(

    () => completions.filter((c) => c.study === 'ecmo'),

    [completions],

  )



  if (!completions.length) {

    return <p className="hint">Attiva ACC o ECMO nel tab Paziente per vedere i fogli Excel.</p>

  }



  return (

    <div className="completion-overview">

      <div className="completion-overall">

        <span>Completamento medio (tutti i fogli)</span>

        <strong>{overall}%</strong>

        <div className="progress-track large">

          <div

            className="progress-fill"

            style={{ width: `${overall}%`, background: barColor(overall) }}

          />

        </div>

      </div>



      <p className="hint">

        Ogni voce corrisponde a un <strong>foglio del database Excel</strong> (stesso nome e ordine

        colonne). I dati in comune si propagano automaticamente tra ACC e ECMO quando salvi.

      </p>



      {record.acc?.attivo && accSheets.length > 0 && (

        <section className="completion-study-block">

          <h3 className="completion-study-title">Database ACC</h3>

          <SheetList items={accSheets} onOpenSheet={onOpenSheet} />

        </section>

      )}



      {record.ecmo?.attivo && ecmoSheets.length > 0 && (

        <section className="completion-study-block">

          <h3 className="completion-study-title">Database ECMO / ELSO</h3>

          <SheetList items={ecmoSheets} onOpenSheet={onOpenSheet} />

        </section>

      )}

    </div>

  )

}

