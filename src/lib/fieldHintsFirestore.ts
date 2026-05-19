import { doc, getDoc, setDoc } from 'firebase/firestore'
import { conventionsToColumnMap } from './dbMetadataImport'
import { mergeColumnConventions } from './excelColumnAnalysis'
import { ensureFirebase, formatFirebaseError } from './firebase'
import { mergeHintRecords, normalizeFieldHintsStore, type FieldHintsStore } from './fieldHints'

const DOC_PATH = ['config', 'fieldHints'] as const

export async function loadFieldHintsFromFirebase(): Promise<FieldHintsStore | null> {
  try {
    const { db } = await ensureFirebase()
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]))
    if (!snap.exists()) return null
    const data = snap.data() as Partial<FieldHintsStore>
    if (!data.hints && !data.defaults) return null
    return {
      hints: data.hints ?? {},
      defaults: data.defaults ?? {},
      aiGenerated: data.aiGenerated ?? {},
      defaultsAiGenerated: data.defaultsAiGenerated ?? {},
      allowedValues: data.allowedValues ?? {},
      conventions: data.conventions ?? {},
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function saveFieldHintsToFirebase(store: FieldHintsStore): Promise<void> {
  const { db } = await ensureFirebase()
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    {
      hints: store.hints,
      defaults: store.defaults,
      aiGenerated: store.aiGenerated,
      defaultsAiGenerated: store.defaultsAiGenerated,
      allowedValues: store.allowedValues,
      conventions: store.conventions,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

export function mergeFirebaseFieldHints(
  local: FieldHintsStore,
  remote: FieldHintsStore | null,
): FieldHintsStore {
  if (!remote) return local
  const remoteTs = new Date(remote.updatedAt).getTime()
  const localTs = new Date(local.updatedAt).getTime()
  if (remoteTs >= localTs) {
    return normalizeFieldHintsStore({
      hints: mergeHintRecords(local.hints, remote.hints),
      defaults: { ...local.defaults, ...remote.defaults },
      aiGenerated: { ...local.aiGenerated, ...remote.aiGenerated },
      defaultsAiGenerated: {
        ...local.defaultsAiGenerated,
        ...remote.defaultsAiGenerated,
      },
      allowedValues: { ...local.allowedValues, ...remote.allowedValues },
      conventions: { ...local.conventions, ...remote.conventions },
      updatedAt: remote.updatedAt,
    })
  }
  return normalizeFieldHintsStore(local)
}

/** Allinea localStorage convenzioni colonne con quanto salvato su Firebase. */
export function applyFieldHintsConventionsLocally(store: FieldHintsStore): void {
  const map = conventionsToColumnMap(store.conventions)
  if (Object.keys(map).length > 0) mergeColumnConventions(map)
}

export { formatFirebaseError }
