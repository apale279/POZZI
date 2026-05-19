# Pubblicare l’app online (ospedale)

L’app usa **Firebase Hosting** (interfaccia) + **Firestore** (pazienti) + **Cloud Functions** (analisi screenshot con Gemini).

## 1. Progetto Firebase

1. [Console Firebase](https://console.firebase.google.com) → **Crea progetto**
2. **Authentication** → **Accesso anonimo** → Abilita
3. **Firestore** → Crea database (regione EU se possibile)
4. **Impostazioni** → App Web → Registra → copia la config SDK

## 2. Variabili locali (build)

In `app/web/.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

GEMINI_API_KEY=...   # per sviluppo locale (npm run dev)
```

## 3. CLI Firebase

```bash
npm install -g firebase-tools
firebase login
cd c:\App_mie\ECMO\app\web
firebase use --add
```

Scegli il progetto creato sopra.

## 4. Chiave Gemini su Cloud Functions

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Incolla la chiave da [Google AI Studio](https://aistudio.google.com/apikey).

## 5. Regole Firestore

Pubblica `firestore.rules` (solo utenti autenticati, anche anonimi):

```bash
firebase deploy --only firestore:rules
```

## 6. Build e deploy completo

```bash
cd c:\App_mie\ECMO\app\web
npm install
cd functions && npm install && cd ..
npm run build
firebase deploy
```

Al termine vedrai un URL tipo:

`https://TUO-PROGETTO.web.app`

Aprilo dal browser dell’ospedale (stesso account Firebase anonimo per dispositivo).

## 7. Sviluppo locale

```bash
npm run dev
```

Vite + API locale sulla porta 3001 (proxy `/api`).

## Note

- I **screenshot non vengono salvati**: passano solo a Gemini in memoria.
- Per **import lista pazienti**: tab Elenco → «Importa lista da Excel».
- Quando mi invii la struttura definitiva del file Excel, aggiorniamo il mapping colonne.
