import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

function resolveConfig() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const authDomain =
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
    (projectId ? `${projectId}.firebaseapp.com` : undefined)

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain,
    projectId,
    storageBucket:
      (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
      (projectId ? `${projectId}.firebasestorage.app` : undefined),
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  }
}

const firebaseConfig = resolveConfig()

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}

export function formatFirebaseError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : ''

  if (code === 'auth/configuration-not-found') {
    return (
      'Authentication non attiva su Firebase. Apri la Console Firebase → Authentication → ' +
      'clicca «Inizia» (o «Get started»), poi in «Metodi di accesso» abilita «Accesso anonimo». ' +
      'Attendi 1–2 minuti e ricarica questa pagina.'
    )
  }
  if (code === 'auth/operation-not-allowed') {
    return (
      'Accesso anonimo non abilitato. Console Firebase → Authentication → Metodi di accesso → ' +
      'Accesso anonimo → Abilita.'
    )
  }
  if (code === 'permission-denied' || String(err).includes('insufficient permissions')) {
    return (
      'Permesso Firestore negato per Impostazioni (config/fieldHints). ' +
      'In Console Firebase → Firestore → Regole, verifica accesso in lettura/scrittura per utenti autenticati ' +
      'sul path config/*. Da terminale: firebase deploy --only firestore:rules (cartella app/web). ' +
      'Le modifiche restano salvate in questo browser anche se il cloud fallisce.'
    )
  }
  if (
    String(err).includes("Database '(default)' not found") ||
    String(err).includes('not-found') && String(err).includes('Firestore')
  ) {
    return (
      'Database Firestore non creato. Console Firebase → Firestore → Crea database (modalità produzione o test). ' +
      'Fino ad allora l’app usa i dati in memoria / sessione del browser.'
    )
  }

  return err instanceof Error ? err.message : 'Errore Firebase'
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let initPromise: Promise<void> | null = null

export async function ensureFirebase(): Promise<{ db: Firestore; auth: Auth }> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase non configurato. In app/web/.env.local servono almeno VITE_FIREBASE_API_KEY, ' +
        'VITE_FIREBASE_PROJECT_ID e VITE_FIREBASE_APP_ID (copiali dalla config SDK Web in Console Firebase).',
    )
  }

  if (initPromise) {
    try {
      await initPromise
      return { db: db!, auth: auth! }
    } catch {
      initPromise = null
    }
  }

  initPromise = (async () => {
    app = initializeApp(firebaseConfig as Record<string, string>)
    auth = getAuth(app)
    db = getFirestore(app)
    if (!auth.currentUser) {
      await signInAnonymously(auth)
    }
  })()

  try {
    await initPromise
  } catch (e) {
    initPromise = null
    throw new Error(formatFirebaseError(e))
  }

  return { db: db!, auth: auth! }
}

export function getDb(): Firestore | null {
  return db
}
