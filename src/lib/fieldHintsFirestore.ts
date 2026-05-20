import { doc, getDoc, setDoc } from 'firebase/firestore'
import { conventionsToColumnMap } from './dbMetadataImport'
import { mergeColumnConventions } from './excelColumnAnalysis'
import { ensureFirebase, formatFirebaseError } from './firebase'
import {
  mergeHintsPreferRicher,
  normalizeFieldHintsStore,
  type FieldHintsStore,
} from './fieldHints'

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
  if (!remote) return normalizeFieldHintsStore(local)

  const remoteTs = new Date(remote.updatedAt).getTime()
  const localTs = new Date(local.updatedAt).getTime()
  const mergedHints = mergeHintsPreferRicher(
    local.hints,
    remote.hints,
    local.aiGenerated,
    remote.aiGenerated,
  )

  return normalizeFieldHintsStore({
    hints: mergedHints,
    defaults: { ...remote.defaults, ...local.defaults },
    aiGenerated: { ...remote.aiGenerated, ...local.aiGenerated },
    defaultsAiGenerated: {
      ...remote.defaultsAiGenerated,
      ...local.defaultsAiGenerated,
    },
    allowedValues: { ...remote.allowedValues, ...local.allowedValues },
    conventions: { ...remote.conventions, ...local.conventions },
    updatedAt: new Date(Math.max(localTs, remoteTs, Date.now())).toISOString(),
  })
}

/** Allinea localStorage convenzioni colonne con quanto salvato su Firebase. */
export function applyFieldHintsConventionsLocally(store: FieldHintsStore): void {
  const map = conventionsToColumnMap(store.conventions)
  if (Object.keys(map).length > 0) mergeColumnConventions(map)
}

export { formatFirebaseError }
