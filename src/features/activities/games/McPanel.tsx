import { motion } from 'framer-motion'
import { useState } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import type { McBoard } from '../types'
import { triesLeft } from './common'

type McItem = McBoard['items'][number]

/** Una pregunta de opción múltiple (video y diálogo). */
export function McQuestion({ it, n, onDone, compact }: { it: McItem; n: number; onDone?: (correct: boolean) => void; compact?: boolean }) {
  const { board, progress, play, busy } = useGame<'video'>()
  const p = progress[it.key]
  const [pick, setPick] = useState<{ opt: string; ok: boolean | null } | null>(null)
  async function choose(o: string) {
    if (busy || p?.done || pick?.ok === null) return
    setPick({ opt: o, ok: null })
    const r = await play('answer', { item: it.key, value: o })
    if (!r?.ok) return setPick(null)
    setPick({ opt: o, ok: !!r.correct })
    if (r.done) setTimeout(() => onDone?.(!!r.correct), 1000)
  }
  const chosenOf = (o: string) => (p?.done && p.correct ? p.value === o : pick?.opt === o)
  return (
    <div className={cn('flex flex-col gap-2 rounded-3xl bg-surface-2 shadow-sm ring-1', p?.done ? (p.correct ? 'ring-uap-green/50' : 'ring-uap-red/40') : 'ring-line', compact ? 'p-3' : 'p-4')}>
      <p className="flex items-start gap-2 font-display font-black leading-snug">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-sm text-white', p?.done ? (p.correct ? 'bg-uap-green' : 'bg-uap-red') : 'bg-uap-blue')}>{p?.done ? (p.correct ? '✓' : '✗') : n}</span>
        <span>{it.q}</span>
      </p>
      <ClueImage src={it.image_url} className="h-24 w-36 bg-white" />
      <div className="grid gap-2 sm:grid-cols-2">
        {it.options.map((o, k) => {
          const chosen = chosenOf(o)
          const good = chosen && (p?.done ? p.correct : pick?.ok)
          const bad = chosen && !good && (p?.done || pick?.ok === false)
          return (
            <motion.button
              key={o}
              whileTap={{ scale: 0.97 }}
              onClick={() => void choose(o)}
              disabled={p?.done || busy}
              aria-label={o}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-semibold transition sm:text-base',
                good ? 'border-uap-green bg-uap-green text-white' : bad ? 'border-uap-red bg-uap-red/15' : 'border-line bg-surface hover:border-uap-blue',
                p?.done && !chosen && 'opacity-50',
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-ink/10 text-xs font-black">{'ABCDEF'[k]}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
            </motion.button>
          )
        })}
      </div>
      {pick?.ok === false && !p?.done && <p className="text-sm font-bold text-uap-red">{triesLeft(board.tries, p?.tries)}</p>}
      {p?.done && !p.correct && p.answer && <p className="text-sm font-bold text-uap-red">Era: {p.answer}</p>}
    </div>
  )
}
