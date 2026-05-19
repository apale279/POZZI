/**
 * API locale per analisi screenshot/testo con Gemini.
 * Avvio: npm run api  (oppure npm run dev con concurrently)
 */
import { createServer } from 'node:http'
import { handleClinicalApi } from './clinicalApiCore.mjs'

const PORT = Number(process.env.API_PORT ?? 3001)

const server = createServer((req, res) => handleClinicalApi(req, res))

server.listen(PORT, () => {
  console.log(`API analisi clinica: http://localhost:${PORT}`)
  console.log(`Gemini key: ${process.env.GEMINI_API_KEY ? 'ok' : 'MANCANTE — vedi .env.local'}`)
})
