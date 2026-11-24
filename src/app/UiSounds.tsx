import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { sfx } from '../lib/sound'

/**
 * Sonidos de toda la página: un clic suave al tocar botones, enlaces y casillas, y un «whoosh» al cambiar de pantalla.
 * Un elemento con data-sfx="off" (o dentro de uno) no suena: lo usan los juegos que ya tienen su propio sonido.
 */
export function UiSounds() {
  const loc = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    sfx.whoosh()
  }, [loc.pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const el = t?.closest<HTMLElement>('button, a[href], [role="button"], [role="tab"], summary, label, select, input[type="checkbox"], input[type="radio"]')
      if (!el || el.closest('[data-sfx="off"]')) return
      if (el instanceof HTMLButtonElement && el.disabled) return
      sfx.click()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
