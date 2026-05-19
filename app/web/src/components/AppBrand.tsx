import { useCallback, useEffect, useState } from 'react'

type Props = {
  compact?: boolean
}

const LOGO_SRC = '/logo.png'
const LOGO_ALT =
  'P.O.Z.Z.I. — Procedura ottimizzata per zero zavorre informatiche, app salva-specializzando'

export function AppBrand({ compact }: Props) {
  const [enlarged, setEnlarged] = useState(false)

  const close = useCallback(() => setEnlarged(false), [])
  const open = useCallback(() => setEnlarged(true), [])

  useEffect(() => {
    if (!enlarged) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [enlarged, close])

  const logoButton = (
    <button
      type="button"
      className={compact ? 'app-brand-logo-btn compact' : 'app-brand-logo-btn'}
      onClick={open}
      aria-label="Ingrandisci logo P.O.Z.Z.I."
      title="Clicca per ingrandire"
    >
      <img
        src={LOGO_SRC}
        alt={LOGO_ALT}
        className={compact ? 'app-brand-logo-compact' : 'app-brand-logo-round'}
      />
    </button>
  )

  return (
    <>
      <div className={compact ? 'app-brand compact' : 'app-brand'}>{logoButton}</div>

      {enlarged && (
        <div
          className="logo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Logo P.O.Z.Z.I. ingrandito"
          onClick={close}
        >
          <button type="button" className="logo-lightbox-close" onClick={close} aria-label="Chiudi">
            ×
          </button>
          <img
            src={LOGO_SRC}
            alt={LOGO_ALT}
            className="logo-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="logo-lightbox-hint">Clicca fuori o premi Esc per chiudere</p>
        </div>
      )}
    </>
  )
}
