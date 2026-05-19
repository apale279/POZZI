import { readFileSync, writeFileSync } from 'node:fs'
const files = [
  'src/components/SheetEditorWindow.tsx',
  'src/components/ConflictResolverModal.tsx',
  'src/components/DataExtractScreen.tsx',
  'src/components/PatientScreen.tsx',
]
for (const f of files) {
  let t = readFileSync(f, 'utf8')
  t = t.replaceAll('</motion>', '</div>')
  writeFileSync(f, t)
}
