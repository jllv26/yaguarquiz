import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JaguarRunner } from './JaguarRunner'
import { Paw } from './JaguarFx'

const RUN_IN = 1.15
const LEAP = 0.95
const RUN_OUT = 1.0
const TOTAL = RUN_IN + LEAP + RUN_OUT
const CYCLES_PER_SEC = 2.2

const ease = (u: number) => u * u * (3 - 2 * u)

/** Posición del jaguar en el tiempo t (s): x en % del ancho, y en % del alto (negativo = arriba). */
function track(t: number) {
  if (t < RUN_IN) return { x: -30 + (t / RUN_IN) * 66, y: 0, leap: 0 }
  if (t < RUN_IN + LEAP) {
    const u = (t - RUN_IN) / LEAP
    return { x: 36 + u * 34, y: -Math.sin(Math.PI * u) * 24, leap: Math.sin(Math.PI * Math.min(1, u * 1.15)) }
  }
  const u = Math.min(1, (t - RUN_IN - LEAP) / RUN_OUT)
  return { x: 70 + ease(u) * 65, y: 0, leap: 0 }
}

const PRINTS = [6, 16, 26, 74, 84, 94]

/**
 * Entrada: un jaguar cruza la pantalla corriendo, salta rugiendo y sale, dejando huellas.
 * No bloquea la página (pointer-events: none). Respeta "reducir movimiento".
 */
export function JaguarIntro({ onDone, onLanded }: { onDone?: () => void; onLanded?: () => void }) {
  const [t, setT] = useState(0)
  const start = useRef<number | null>(null)
  const landed = useRef(false)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduce) {
      onDone?.()
      return
    }
    let raf = 0
    const tick = (now: number) => {
      if (start.current == null) start.current = now
      const el = (now - start.current) / 1000
      setT(el)
      if (!landed.current && el > RUN_IN + LEAP) {
        landed.current = true
        onLanded?.()
      }
      if (el < TOTAL + 1.2) raf = requestAnimationFrame(tick)
      else onDone?.()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (reduce) return null
  const p = track(Math.min(t, TOTAL))
  const phase = (t * CYCLES_PER_SEC) % 1
  const inLeap = t > RUN_IN && t < RUN_IN + LEAP
  const fadeAll = t > TOTAL ? Math.max(0, 1 - (t - TOTAL) / 1.2) : 1

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" style={{ opacity: fadeAll }}>
      {/* huellas que deja al pasar */}
      {PRINTS.map((x, i) => {
        const shown = p.x + 8 > x || t > TOTAL
        return (
          <span
            key={x}
            className="absolute text-[#8A5A1B] transition-opacity duration-700 dark:text-uap-gold"
            style={{ left: `${x}%`, bottom: `calc(11vh + ${i % 2 ? 0 : 14}px)`, opacity: shown ? 0.45 : 0 }}
          >
            <Paw className="size-6 sm:size-8" style={{ transform: 'rotate(90deg)' }} />
          </span>
        )
      })}

      <div className="absolute" style={{ left: `${p.x}%`, bottom: '12vh', transform: `translate(-50%, ${p.y}vh)` }}>
        {/* sombra en el suelo */}
        <div
          className="absolute left-1/2 top-full h-4 -translate-x-1/2 -translate-y-3 rounded-[50%] bg-black/25 blur-sm dark:bg-black/50"
          style={{ width: `${70 - Math.abs(p.y) * 1.6}%`, transform: `translate(-50%, ${-p.y}vh)`, opacity: 1 - Math.abs(p.y) / 40 }}
        />
        <JaguarRunner phase={phase} leap={p.leap} roar={inLeap} className="w-[min(56vw,420px)] drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]" />
        {inLeap && (
          <div className="absolute -top-6 right-0 font-display text-2xl font-black tracking-wider text-uap-gold drop-shadow sm:text-4xl" style={{ opacity: p.leap }}>
            ¡GRRR!
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
