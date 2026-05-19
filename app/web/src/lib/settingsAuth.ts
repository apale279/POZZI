const STORAGE_KEY = 'pozzi:settings-auth'
const SETTINGS_PASSWORD = 'Bicocca2027!'

export function isSettingsUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function unlockSettings(password: string): boolean {
  if (password !== SETTINGS_PASSWORD) return false
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
  return true
}

export function lockSettings(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
