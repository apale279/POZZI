# P.O.Z.Z.I. — ECMO / ACC

App per compilazione fogli database ECMO e ACC con estrazione IA (Gemini), impostazioni su Firebase e export Excel.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local   # compila chiavi Firebase + GEMINI_API_KEY
npm run dev
```

- Interfaccia: http://localhost:5173/
- API analisi: http://localhost:3001/

## Deploy

Vedi [DEPLOY.md](DEPLOY.md) (Firebase Hosting o **Vercel**).

Su Vercel: collega questo repo, **Root Directory vuota** (la root è già l’app), variabili `VITE_FIREBASE_*` e `GEMINI_API_KEY`.

## Cartella `reference/`

File non usati in produzione: Excel DB di esempio, script Python di mapping, file di prova. Opzionale in locale.
