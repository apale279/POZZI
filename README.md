# P.O.Z.Z.I. (ECMO / ACC)

Repository del progetto clinico. **L’app da deployare è solo in [`app/web`](app/web).**

## Deploy su Vercel

1. Collega questo repo a Vercel.
2. **Settings → General → Root Directory** → imposta **`app/web`** (obbligatorio).
3. Aggiungi le variabili d’ambiente (`VITE_FIREBASE_*`, `GEMINI_API_KEY`) — vedi [`app/web/DEPLOY.md`](app/web/DEPLOY.md).

Non serve un `vercel.json` nella root del repo: la configurazione è in `app/web/vercel.json`.

## Cosa c’è nelle altre cartelle

| Percorso | Serve al deploy? | Uso |
|----------|------------------|-----|
| **`app/web/`** | **Sì** | App React, API, Firebase |
| `app/docs/`, `app/scripts/` | No | Mapping campi, script Python di supporto |
| `app/File di prova_Local/` | No | File di test locali |
| `*.xlsx` in root | No | Database Excel di riferimento (import in Impostazioni) |

Per avere **solo l’app su GitHub** si può usare Root Directory `app/web` su Vercel senza spostare file, oppure creare un repo che contenga unicamente il contenuto di `app/web`.
