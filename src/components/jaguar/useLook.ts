import { useEffect, useRef, useState } from 'react'

/** Dirección (-1..1) desde el centro de un elemento hacia el puntero: para que la mascota "mire" el cursor. */
export function useLook<T extends HTMLElement | SVGElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })
  useEffect(() => {
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)
        const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)
        setLook({ x: Math.max(-1, Math.min(1, dx * 1.6)), y: Math.max(-1, Math.min(1, dy * 1.6)) })
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])
  return { ref, look }
}
