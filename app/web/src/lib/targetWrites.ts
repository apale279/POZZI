import type { IngestTarget } from '../types/ingest'
import { getTargetById } from './ingestConfig'
import { getParseTargetId } from './sheetTargets'

export interface ResolvedWrite {
  study: 'ecmo' | 'acc'
  sheet: string
  parseTargetId: string
  requiresRun?: boolean
}

export function resolveWrites(target: IngestTarget): ResolvedWrite[] {
  if (target.linkedWrites?.length) {
    return target.linkedWrites.map((w) => ({
      study: w.study,
      sheet: w.sheet,
      parseTargetId: w.parseTargetId,
      requiresRun: w.requiresRun,
    }))
  }
  return [
    {
      study: target.study,
      sheet: target.sheet,
      parseTargetId: getParseTargetId(target.study, target.sheet),
      requiresRun: target.requiresRun,
    },
  ]
}

export function getTargetOrThrow(id: string): IngestTarget {
  const t = getTargetById(id)
  if (!t) throw new Error('Target non trovato')
  return t
}
