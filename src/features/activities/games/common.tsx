import { useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import type { Progress } from '../types'

/** Elemento actual: empieza en el primero sin resolver y sabe pasar al siguiente pendiente. */
export function useCursor(keys: string[], progress: Record<string, Progress>) {
  const first = keys.findIndex((k) => !progress[k]?.done)
  const [cur, setCur] = useState(first < 0 ? 0 : first)
  const curRef = useRef(cur)
  curRef.current = cur
  const next = (from = curRef.current) => {
    for (let s = 1; s <= keys.length; s++) {
      const j = (from + s) % keys.length
      if (!progress[keys[j]]?.done) return setCur(j)
    }
  }
  return { cur: Math.min(cur, Math.max(0, keys.length - 1)), setCur, next, curRef }
}

/** Botones numerados para saltar entre preguntas (verde = bien, rojo = mal). */
export function ItemDots({ keys, progress, cur, onPick, label = 'Pregunta' }: { keys: string[]; progress: Record<string, Progress>; cur: number; onPick: (i: number) => void; label?: string }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" aria-label={`${label}s`}>
      {keys.map((k, i) => {
        const p = progress[k]
        return (
          <button
            key={k}
            onClick={() => onPick(i)}
            aria-label={`${label} ${i + 1}${p?.done ? (p.correct ? ', resuelta' : ', fallada') : ''}`}
            aria-current={i === cur}
            className={cn('size-8 rounded-full font-display text-sm font-black transition', p?.done ? (p.correct ? 'bg-uap-green text-white' : 'bg-uap-red text-white') : 'bg-ink/10 hover:bg-ink/20', i === cur && 'ring-4 ring-uap-gold')}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}

/** «Te quedan n intentos» */
export function triesLeft(total: number, used = 0) {
  const n = Math.max(0, total - used)
  return `Te queda${n === 1 ? '' : 'n'} ${n} intento${n === 1 ? '' : 's'}`
}
