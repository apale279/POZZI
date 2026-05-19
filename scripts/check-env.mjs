import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = resolve(root, '.env.local')
if (!existsSync(path)) {
  console.log('MISSING .env.local')
  process.exit(1)
}
const lines = readFileSync(path, 'utf8').split(/\r?\n/)
for (const line of lines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (!m) continue
  const key = m[1].trim()
  const val = m[2].trim().replace(/^["']|["']$/g, '')
  console.log(`${key}: ${val ? `ok (${val.length} chars)` : 'EMPTY'}`)
}
