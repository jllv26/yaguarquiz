import { useEffect, useRef } from 'react'
import { haptic, sfx } from './sound'

/**
 * Sonidos del reloj de una actividad o examen:
 * aviso al quedar 5 minutos y 1 minuto, tic suave en los últimos 30 segundos y tic-tac urgente en los últimos 10.
 */
export function useTimerSounds(left: number | null, notify?: (title: string) => void) {
  const last = useRef<number | null>(null)
  const cb = useRef(notify)
  cb.current = notify
  useEffect(() => {
    if (left === null) return
    const sec = Math.ceil(left / 1000)
    const prev = last.current
    last.current = sec
    if (prev === null || sec === prev || sec <= 0) return
    if (prev > 300 && sec <= 300 && sec > 60) {
      sfx.warning()
      haptic([80, 60, 80])
      cb.current?.('⏰ Te quedan 5 minutos')
    } else if (prev > 60 && sec <= 60) {
      sfx.warning()
      haptic([120, 80, 120])
      cb.current?.('⏰ Te queda 1 minuto')
    }
    if (sec <= 10) sfx.urgent(sec)
    else if (sec <= 30) sfx.tick()
  }, [left])
}
