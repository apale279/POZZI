import { useEffect, useRef, useState } from 'react'
import type { PatientRecord } from '../types/canonical'
import { isFirebaseConfigured } from '../lib/firebase'
import { savePatient } from '../lib/patientFirestore'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function usePatientAutosave(
  record: PatientRecord,
  enabled: boolean,
): { status: SaveStatus; lastError: string | null; saveNow: () => Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordRef = useRef(record)
  recordRef.current = record

  const saveNow = async () => {
    if (!isFirebaseConfigured() || !enabled || !record.id) return
    setStatus('saving')
    setLastError(null)
    try {
      await savePatient(recordRef.current)
      setStatus('saved')
    } catch (e) {
      setStatus('error')
      setLastError(e instanceof Error ? e.message : 'Errore salvataggio')
    }
  }

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured() || !record.id) {
      setStatus('idle')
      return
    }

    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void saveNow()
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [record, enabled])

  return { status, lastError, saveNow }
}
