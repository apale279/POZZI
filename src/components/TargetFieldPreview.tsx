import { useMemo } from 'react'
import type { PatientRecord } from '../types/canonical'
import { getTargetById } from '../lib/ingestConfig'
import { getTargetFieldInfos } from '../lib/targetFields'
import { resolveWrites } from '../lib/targetWrites'

type Props = {
  targetId: string
  record: PatientRecord
}

export function TargetFieldPreview({ targetId, record }: Props) {
  const target = getTargetById(targetId)

  const { fields, destinations } = useMemo(() => {
    if (!target) return { fields: [], destinations: [] }
    const fields = getTargetFieldInfos(record, target)
    const writes = resolveWrites(target)
    const destinations = writes.map(
      (w) => `${w.study.toUpperCase()} → foglio «${w.sheet}»`,
    )
    return { fields, destinations }
  }, [target, record, targetId])

  if (!target) return null

  const extractable = fields.filter((f) => f.fromExtraction)
  const other = fields.filter((f) => !f.fromExtraction)

  return (
    <div className="target-field-preview">
      <h3>Destinazioni e campi di questo foglio</h3>
      <p className="hint">
        <strong>Dove finiranno i dati:</strong> {destinations.join(' · ')}
      </p>

      {extractable.length > 0 && (
        <>
          <h4>Campi che puoi compilare con estrazione (testo / screenshot)</h4>
          <ul className="field-chip-list extractable">
            {extractable.map((f) => (
              <li key={f.column} className={f.alreadyFilled ? 'filled' : ''}>
                <code>{f.column}</code>
                {f.alreadyFilled && (
                  <span className="chip-val"> = {String(f.currentValue)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {other.length > 0 && (
        <>
          <h4>Altri campi del foglio (inserimento manuale in ACC manuale)</h4>
          <p className="hint small">
            Mostrati i primi 25. Totale foglio: {fields.length} campi utili.
          </p>
          <ul className="field-chip-list other">
            {other.slice(0, 25).map((f) => (
              <li key={f.column} className={f.alreadyFilled ? 'filled' : ''}>
                <code>{f.column}</code>
              </li>
            ))}
            {other.length > 25 && <li>… +{other.length - 25} campi</li>}
          </ul>
        </>
      )}
    </div>
  )
}
