import { useState } from 'react'
import { unlockSettings } from '../lib/settingsAuth'

type Props = {
  onUnlocked: () => void
}

export function SettingsGate({ onUnlocked }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (unlockSettings(password)) {
      setError(null)
      onUnlocked()
    } else {
      setError('Password non corretta.')
    }
  }

  return (
    <div className="settings-gate">
      <div className="settings-gate-card">
        <h2>Impostazioni protette</h2>
        <p className="hint">Inserisci la password per accedere alla configurazione del database e dell’IA.</p>
        <form onSubmit={submit}>
          <label className="settings-gate-label">
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              autoFocus
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
            />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn-primary">
            Accedi
          </button>
        </form>
      </div>
    </div>
  )
}
