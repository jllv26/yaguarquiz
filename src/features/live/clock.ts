import confetti from 'canvas-confetti'
import { useEffect, useState } from 'react'

/** Duración de la cuenta regresiva antes de cada pregunta. */
export const COUNTDOWN_MS = 3000

/** Hora actual del servidor (según el desfase medido), refrescada varias veces por segundo. */
export function useServerNow(offset: number, active = true, everyMs = 200) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now() + offset)
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, everyMs)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [offset, active, everyMs])
  return now
}

export function secondsLeft(endsAt: string | null | undefined, now: number) {
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000))
}

export function celebrate(big = false) {
  const colors = ['#1B7339', '#C9A23A', '#1F3864', '#FF3355', '#2D7DFF', '#FFC233']
  void confetti({ particleCount: big ? 160 : 80, spread: big ? 100 : 70, origin: { y: 0.6 }, colors, disableForReducedMotion: true })
  if (big) {
    setTimeout(() => void confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0 }, colors, disableForReducedMotion: true }), 300)
    setTimeout(() => void confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1 }, colors, disableForReducedMotion: true }), 500)
  }
}
