/** Estrae file immagine da un evento incolla (screenshot Win+Shift+S, Snipping Tool, ecc.). */
export function imageFilesFromClipboardData(data: DataTransfer | null): File[] {
  if (!data) return []

  const seen = new Set<string>()
  const out: File[] = []

  const push = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    const key = `${file.name}:${file.size}:${file.type}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(ensureScreenshotFileName(file))
  }

  if (data.files?.length) {
    for (const f of Array.from(data.files)) push(f)
  }
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file') push(item.getAsFile())
  }

  return out
}

function ensureScreenshotFileName(file: File): File {
  if (file.name && file.name !== 'image.png') return file
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  return new File([file], `screenshot-${Date.now()}.${ext}`, { type: file.type || 'image/png' })
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'),
  )
}
