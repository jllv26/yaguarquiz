import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { triesLeft, useCursor } from './common'

/** Imagen por defecto si el docente no subió una */
const FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B7339"/><stop offset="1" stop-color="#C9A23A"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="175" font-size="110" text-anchor="middle">🐆</text></svg>`,
  )

export default function PuzzleGame() {
  const { board, progress, play, busy } = useGame<'puzzle'>()
  const items = board.board.items
  const img = board.board.image_url || FALLBACK
  const n = items.length
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const [ratio, setRatio] = useState(4 / 3)
  const qRef = useRef<HTMLDivElement>(null)
  const { cur, setCur, next, curRef } = useCursor(
    items.map((x) => x.key),
    progress,
  )
  const [pick, setPick] = useState<{ opt: string; ok: boolean | null } | null>(null)
  useEffect(() => {
    const im = new Image()
    im.onload = () => im.naturalWidth && setRatio(im.naturalWidth / im.naturalHeight)
    im.src = img
  }, [img])
  useEffect(() => setPick(null), [cur])
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  if (!it) return null
  const allDone = items.every((x) => progress[x.key]?.done)
  const revealed = items.filter((x) => progress[x.key]?.correct).length

  async function choose(o: string) {
    if (busy || pick || p?.done) return
    setPick({ opt: o, ok: null })
    const r = await play('answer', { item: it.key, value: o })
    if (!r?.ok) return setPick(null)
    setPick({ opt: o, ok: !!r.correct })
    const at = curRef.current
    if (r.done) setTimeout(() => curRef.current === at && next(at), 1100)
    else setTimeout(() => setPick(null), 1200)
  }

  const pos = (i: number) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-2">
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl bg-ink/80 shadow-lg ring-4 ring-[#ae3ec9]/40" style={{ aspectRatio: String(ratio) }}>
          <div className="grid size-full gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {Array.from({ length: cols * rows }, (_, i) => {
              const x = items[i]
              const q = x ? progress[x.key] : undefined
              const open = !x || q?.correct || allDone
              return (
                <motion.button
                  key={i}
                  disabled={!x || q?.done}
                  onClick={() => {
                    if (!x) return
                    setCur(i)
                    setTimeout(() => qRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
                  }}
                  aria-label={x ? `Pieza ${i + 1}${q?.done ? (q.correct ? ', descubierta' : ', fallada') : ''}` : 'Pieza'}
                  initial={false}
                  animate={{ rotateY: open ? 0 : 180 }}
                  transition={{ duration: 0.5 }}
                  className={cn('relative overflow-hidden', x && i === cur && !q?.done && 'z-10 ring-4 ring-uap-gold')}
                  style={{ backgroundImage: `url("${img}")`, backgroundSize: `${cols * 100}% ${rows * 100}%`, backgroundPosition: pos(i) }}
                >
                  {!open && (
                    <span className={cn('absolute inset-0 grid place-items-center font-display text-xl font-black text-white [transform:rotateY(180deg)]', q?.done ? 'bg-[#495057]/95' : 'bg-gradient-to-br from-[#ae3ec9] to-[#7048e8]')}>
                      {q?.done ? '✖' : i + 1}
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
          <AnimatePresence>
            {allDone && (
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/60 px-3 py-2 text-center font-display font-black text-white">
                🧩 ¡Puzzle completo! Descubriste {revealed} de {n} piezas
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-sm font-semibold text-ink-soft">
          Piezas descubiertas: {revealed} de {n}
        </p>
      </div>

      {!allDone && (
        <div ref={qRef} className="flex scroll-mt-20 flex-col gap-3 rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line">
          <p className="text-xs font-black uppercase tracking-wider text-[#ae3ec9]">
            Pieza {cur + 1} de {n}
          </p>
          <ClueImage src={it.image_url} className="h-28 w-40 bg-white" />
          <p className="font-display text-lg font-black leading-snug">{it.q}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {it.options.map((o, k) => {
              const chosen = pick?.opt === o
              return (
                <motion.button
                  key={o}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void choose(o)}
                  disabled={!!pick || p?.done}
                  aria-label={o}
                  className={cn(
                    'flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-semibold transition',
                    chosen && pick?.ok ? 'border-uap-green bg-uap-green text-white' : chosen && pick?.ok === false ? 'border-uap-red bg-uap-red/15' : 'border-line bg-surface hover:border-[#ae3ec9]',
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#ae3ec9]/15 font-display font-black text-[#ae3ec9]">{'ABCDEF'[k]}</span>
                  {o}
                </motion.button>
              )
            })}
          </div>
          {pick?.ok === false && !p?.done && <p className="text-sm font-bold text-uap-red">{triesLeft(board.tries, p?.tries)}</p>}
          {p?.done && <p className={cn('font-display font-black', p.correct ? 'text-uap-green' : 'text-uap-red')}>{p.correct ? '✓ ¡Pieza descubierta!' : 'Esta pieza se quedó tapada'}</p>}
        </div>
      )}
    </div>
  )
}
