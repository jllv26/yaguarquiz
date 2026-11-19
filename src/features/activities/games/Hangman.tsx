import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { JAGUAR } from '../../../components/jaguar/assets'
import { JaguarFace } from '../../../components/jaguar/JaguarFace'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'

const KEYS = 'QWERTYUIOPASDFGHJKLÑZXCVBNM'.split('')

export default function Hangman() {
  const { board, progress, play, busy } = useGame<'hangman'>()
  const items = board.board.items
  const max = board.board.max_wrong
  const [cur, setCur] = useState(() => Math.max(0, items.findIndex((x) => !progress[x.key]?.done)))
  const [masks, setMasks] = useState<Record<string, string>>(() => Object.fromEntries(items.map((x) => [x.key, x.mask])))
  const [tried, setTried] = useState<Record<string, string[]>>({})
  const [mood, setMood] = useState<'neutral' | 'happy' | 'wow' | 'sad'>('neutral')
  const curRef = useRef(cur)
  curRef.current = cur
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  const wrong = p?.wrong ?? 0
  const mask = it ? (p?.done && !p.correct && p.answer ? p.answer : masks[it.key]) : ''

  async function guess(letter: string) {
    if (!it || busy || p?.done || (tried[it.key] ?? []).includes(letter)) return
    setTried((t) => ({ ...t, [it.key]: [...(t[it.key] ?? []), letter] }))
    const r = await play('letter', { item: it.key, letter })
    if (!r?.ok) return
    if (r.mask) setMasks((m) => ({ ...m, [it.key]: r.mask! }))
    setMood(r.done ? (r.correct ? 'happy' : 'sad') : r.hit ? 'wow' : 'sad')
    const at = cur
    if (r.done)
      setTimeout(() => {
        setMood('neutral')
        if (curRef.current !== at) return
        for (let s = 1; s <= items.length; s++) {
          const j = (cur + s) % items.length
          if (!progress[items[j].key]?.done && items[j].key !== it.key) return setCur(j)
        }
      }, 1600)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase()
      if (KEYS.includes(k)) void guess(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!it) return null
  const used = new Set([...(tried[it.key] ?? []), ...mask.replace(/[_ ]/g, '').split('')])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-1.5">
        {items.map((x, i) => {
          const pr = progress[x.key]
          return (
            <button
              key={x.key}
              onClick={() => setCur(i)}
              aria-label={`Palabra ${i + 1}`}
              className={cn('size-8 rounded-full font-display text-sm font-black', pr?.done ? (pr.correct ? 'bg-uap-green text-white' : 'bg-uap-red text-white') : 'bg-ink/10', i === cur && 'ring-4 ring-uap-gold')}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="grid items-center gap-4 rounded-3xl bg-surface-2 p-5 shadow-sm ring-1 ring-line sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          <JaguarFace mood={mood} className="w-28" />
          <div className="flex gap-1" role="img" aria-label={`Vidas: ${max - wrong} de ${max}`}>
            {Array.from({ length: max }, (_, i) => (
              <motion.img key={i} src={JAGUAR.huella} alt="" animate={{ opacity: i < max - wrong ? 1 : 0.15, scale: i < max - wrong ? 1 : 0.7 }} className="w-5" />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <ClueImage src={it.image_url} className="h-24 w-36 bg-white" />
          <p className="font-display text-lg font-bold">{it.clue}</p>
          <p className="sr-only" aria-live="polite">
            Palabra de {mask.replace(/ /g, '').length} letras: {mask.split('').map((c) => (c === '_' ? 'espacio' : c === ' ' ? ',' : c)).join(' ')}
          </p>
          <p className="flex flex-wrap justify-center gap-x-4 gap-y-2 font-display text-3xl font-black tracking-wide" aria-hidden>
            {mask.split(' ').map((w, wi) => (
              <span key={wi} className="flex gap-1.5">
                {w.split('').map((c, ci) => (
                  <span key={ci} className={cn('grid h-11 w-8 place-items-end justify-center border-b-4 pb-0.5', p?.done ? (p.correct ? 'border-uap-green text-uap-green' : 'border-uap-red text-uap-red') : 'border-ink/40')}>
                    {c === '_' ? '' : c}
                  </span>
                ))}
              </span>
            ))}
          </p>
          {p?.done && <p className={cn('font-display font-black', p.correct ? 'text-uap-green' : 'text-uap-red')}>{p.correct ? '¡La descubrió!' : 'Se acabaron las vidas'}</p>}
        </div>
      </div>
      {!p?.done && (
        <div className="mx-auto grid w-full max-w-xl grid-cols-10 gap-1.5" aria-label="Teclado">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => void guess(k)}
              disabled={used.has(k) || busy}
              className={cn(
                'h-11 rounded-xl font-display text-lg font-black shadow-sm transition',
                used.has(k) ? (mask.includes(k) ? 'bg-uap-green text-white' : 'bg-ink/10 text-ink-soft line-through') : 'bg-surface-2 ring-1 ring-line hover:-translate-y-0.5 hover:ring-uap-gold',
                k === 'A' && 'col-start-1',
              )}
            >
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
