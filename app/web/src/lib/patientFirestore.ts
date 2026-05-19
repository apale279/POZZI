import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import type { PatientRecord } from '../types/canonical'
import type { SheetCompletion } from '../types/ingest'
import { computeAllCompletions, overallCompletion } from './completion'
import { ensureFirebase, formatFirebaseError, isFirebaseConfigured } from './firebase'
import { applyRecordOptimizations } from './recordOptimizations'
import { COMPLETE_THRESHOLD, deriveWorkflowStatus } from './workflow'

const COLLECTION = 'patients'
const SHEETS_SUB = 'sheets'
const SCHEMA_VERSION = 2

/** Firestore non accetta `undefined` nei documenti. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function sheetDocId(study: 'ecmo' | 'acc', sheet: string): string {
  return `${study}__${encodeURIComponent(sheet)}`
}

export function parseSheetDocId(id: string): { study: 'ecmo' | 'acc'; sheet: string } | null {
  const i = id.indexOf('__')
  if (i < 0) return null
  const study = id.slice(0, i)
  if (study !== 'ecmo' && study !== 'acc') return null
  return { study, sheet: decodeURIComponent(id.slice(i + 2)) }
}

function emptyRecordFromMeta(id: string, data: Record<string, unknown>): PatientRecord {
  const embedded = data.record as PatientRecord | undefined
  if (embedded?.core) {
    return { ...embedded, id }
  }
  return {
    id,
    core: {
      sdo: (data.sdo as string) ?? '',
      cognome: (data.cognome as string) ?? '',
      nome: (data.nome as string) ?? '',
    },
    ecmo: embedded?.ecmo,
    acc: embedded?.acc,
    ecmoRuns: embedded?.ecmoRuns ?? [{ runNumber: 1 }],
    accSheets: embedded?.accSheets ?? {},
    ecmoSheets: embedded?.ecmoSheets ?? {},
    updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
  }
}

function mergeSheetDocs(
  record: PatientRecord,
  sheetDocs: { study: 'ecmo' | 'acc'; sheet: string; data: Record<string, string | number | boolean> }[],
): PatientRecord {
  if (!sheetDocs.length) return record
  const accSheets = { ...record.accSheets }
  const ecmoSheets = { ...record.ecmoSheets }
  for (const { study, sheet, data } of sheetDocs) {
    if (study === 'acc') {
      accSheets[sheet] = { ...(accSheets[sheet] ?? {}), ...data }
    } else {
      ecmoSheets[sheet] = { ...(ecmoSheets[sheet] ?? {}), ...data }
    }
  }
  return { ...record, accSheets, ecmoSheets }
}

function recordWithoutSheets(record: PatientRecord): PatientRecord {
  return {
    ...record,
    accSheets: {},
    ecmoSheets: {},
  }
}

function collectSheetWrites(record: PatientRecord): {
  study: 'ecmo' | 'acc'
  sheet: string
  data: Record<string, string | number | boolean>
}[] {
  const out: {
    study: 'ecmo' | 'acc'
    sheet: string
    data: Record<string, string | number | boolean>
  }[] = []
  if (record.ecmo?.attivo && record.ecmoSheets) {
    for (const [sheet, data] of Object.entries(record.ecmoSheets)) {
      if (data && Object.keys(data).length) out.push({ study: 'ecmo', sheet, data })
    }
  }
  if (record.acc?.attivo && record.accSheets) {
    for (const [sheet, data] of Object.entries(record.accSheets)) {
      if (data && Object.keys(data).length) out.push({ study: 'acc', sheet, data })
    }
  }
  return out
}

export interface PatientListItem {
  id: string
  sdo: string
  cognome: string
  nome: string
  accActive: boolean
  ecmoActive: boolean
  completionPercent: number
  workflowStatus: 'todo' | 'in_progress' | 'complete'
  completionBreakdown: SheetCompletion[]
  importBatchId?: string
  updatedAt: string
  record: PatientRecord
}

function toListItem(id: string, data: Record<string, unknown>, recordOverride?: PatientRecord): PatientListItem {
  const record = recordOverride ?? (data.record as PatientRecord)
  const completions = computeAllCompletions(record)
  const pct =
    typeof data.completionPercent === 'number'
      ? data.completionPercent
      : overallCompletion(completions)
  const workflowStatus =
    (data.workflowStatus as PatientListItem['workflowStatus']) ??
    record.workflowStatus ??
    deriveWorkflowStatus(record, pct)

  return {
    id,
    sdo: (data.sdo as string) ?? record?.core?.sdo ?? '',
    cognome: (data.cognome as string) ?? record?.core?.cognome ?? '',
    nome: (data.nome as string) ?? record?.core?.nome ?? '',
    accActive: Boolean(data.accActive ?? record?.acc?.attivo),
    ecmoActive: Boolean(data.ecmoActive ?? record?.ecmo?.attivo),
    completionPercent: pct,
    workflowStatus,
    completionBreakdown: completions,
    importBatchId: (data.importBatchId as string) ?? record?.importMeta?.batchId,
    updatedAt:
      (data.updatedAt as string) ??
      record?.updatedAt ??
      new Date().toISOString(),
    record: {
      ...record,
      id,
      workflowStatus,
      updatedAt: record?.updatedAt ?? new Date().toISOString(),
    },
  }
}

export function subscribePatient(
  patientId: string,
  onData: (item: PatientListItem | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let unsubMeta: Unsubscribe = () => {}
  let unsubSheets: Unsubscribe = () => {}
  let metaData: Record<string, unknown> | null = null
  let sheetDocs: { study: 'ecmo' | 'acc'; sheet: string; data: Record<string, string | number | boolean> }[] =
    []

  const emit = () => {
    if (!metaData) return
    let record = emptyRecordFromMeta(patientId, metaData)
    record = mergeSheetDocs(record, sheetDocs)
    onData(toListItem(patientId, metaData, record))
  }

  if (!isFirebaseConfigured()) {
    onError(new Error('Firebase non configurato'))
    return () => {}
  }

  ensureFirebase()
    .then(({ db }) => {
      unsubMeta = onSnapshot(
        doc(db, COLLECTION, patientId),
        (snap) => {
          if (!snap.exists()) {
            metaData = null
            sheetDocs = []
            onData(null)
            return
          }
          metaData = snap.data() as Record<string, unknown>
          emit()
        },
        (err) => onError(new Error(formatFirebaseError(err))),
      )

      unsubSheets = onSnapshot(
        collection(db, COLLECTION, patientId, SHEETS_SUB),
        (snap) => {
          sheetDocs = snap.docs
            .map((d) => {
              const parsed = parseSheetDocId(d.id)
              const payload = d.data() as DocumentData
              if (!parsed) return null
              return {
                study: parsed.study,
                sheet: parsed.sheet,
                data: (payload.data ?? {}) as Record<string, string | number | boolean>,
              }
            })
            .filter(Boolean) as typeof sheetDocs
          if (metaData) emit()
        },
        (err) => onError(new Error(formatFirebaseError(err))),
      )
    })
    .catch((err) => onError(new Error(formatFirebaseError(err))))

  return () => {
    unsubMeta()
    unsubSheets()
  }
}

export function subscribePatients(
  onData: (patients: PatientListItem[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let unsubFirestore: Unsubscribe = () => {}

  ensureFirebase()
    .then(({ db }) => {
      const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'))
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => toListItem(d.id, d.data() as Record<string, unknown>))
          onData(list)
        },
        (err) => onError(new Error(formatFirebaseError(err))),
      )
    })
    .catch((err) => onError(new Error(formatFirebaseError(err))))

  return () => unsubFirestore()
}

export async function savePatient(
  record: PatientRecord,
  options?: { skipOptimize?: boolean },
): Promise<void> {
  const { db } = await ensureFirebase()
  const base = options?.skipOptimize ? record : applyRecordOptimizations(record, { onlyEmpty: true }).record
  const completions = computeAllCompletions(base)
  const completionPercent = overallCompletion(completions)
  const workflowStatus = deriveWorkflowStatus(base, completionPercent)
  const updatedAt = new Date().toISOString()
  const enriched: PatientRecord = {
    ...base,
    workflowStatus,
    updatedAt,
  }

  const slimRecord = recordWithoutSheets(enriched)
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    sdo: enriched.core.sdo,
    cognome: enriched.core.cognome,
    nome: enriched.core.nome,
    accActive: enriched.acc?.attivo ?? false,
    ecmoActive: enriched.ecmo?.attivo ?? false,
    completionPercent,
    workflowStatus,
    importBatchId: enriched.importMeta?.batchId ?? null,
    updatedAt,
    record: stripUndefined(slimRecord),
    savedAt: serverTimestamp(),
  }

  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTION, enriched.id), stripUndefined(payload), { merge: true })

  for (const { study, sheet, data } of collectSheetWrites(enriched)) {
    batch.set(
      doc(db, COLLECTION, enriched.id, SHEETS_SUB, sheetDocId(study, sheet)),
      stripUndefined({ study, sheet, data, updatedAt }),
      { merge: true },
    )
  }

  await batch.commit()
}

export async function importPatientsBatch(records: PatientRecord[]): Promise<number> {
  let count = 0
  for (const record of records) {
    await savePatient(record)
    count++
  }
  return count
}

export async function deletePatientFromFirebase(patientId: string): Promise<void> {
  const { db } = await ensureFirebase()
  const sheetsSnap = await getDocs(collection(db, COLLECTION, patientId, SHEETS_SUB))
  const batch = writeBatch(db)
  for (const d of sheetsSnap.docs) {
    batch.delete(d.ref)
  }
  batch.delete(doc(db, COLLECTION, patientId))
  await batch.commit()
}

export async function createPatientInFirebase(record: PatientRecord): Promise<PatientRecord> {
  await savePatient(record)
  return record
}

export { COMPLETE_THRESHOLD }
