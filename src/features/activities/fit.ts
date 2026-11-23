import { useLayoutEffect, useRef, useState } from 'react'

/**
 * En la PC (pantalla ancha y apaisada) los tableros deben caber en la pantalla sin bajar con la rueda:
 * en el laboratorio las pantallas son de 1366×768 o menos (y con Windows al 125 % quedan en ~1093×510 útiles).
 *
 * Devuelve una ref para el elemento del tablero y, solo en la PC, cuánto alto queda desde su borde superior
 * hasta el final de la ventana (menos `reserve` px para lo que va debajo) y su ancho.
 * En el celular o la tablet vertical devuelve `room: null` y el juego usa su diseño normal (con desplazamiento).
 */
export function isWideScreen() {
  return typeof window !== 'undefined' && window.innerWidth >= 900 && window.innerWidth > window.innerHeight * 1.15
}

export function useFit<T extends HTMLElement>(reserve = 24, min = 240) {
  const ref = useRef<T>(null)
  const [fit, setFit] = useState<{ room: number | null; width: number }>({
    room: null,
    width: 0,
  })

  useLayoutEffect(() => {
    let frame = 0
    const calc = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const width = Math.round(r.width)
        const room = isWideScreen() ? Math.max(min, Math.floor(window.innerHeight - (r.top + window.scrollY) - reserve)) : null
        setFit((f) => (f.room === room && f.width === width ? f : { room, width }))
      })
    }
    calc()
    window.addEventListener('resize', calc)
    // el encabezado puede cambiar de alto (fuentes que terminan de cargar, racha, etc.)
    const ro = new ResizeObserver(calc)
    if (ref.current) ro.observe(ref.current)
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', calc)
      ro.disconnect()
    }
  }, [reserve, min])

  return [ref, fit.room, fit.width] as const
}
