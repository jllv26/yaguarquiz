import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { triesLeft, useCursor } from './common'

/** Hoja de nenúfar (SVG) detrás de cada respuesta */
function Pad({ state }: { state: 'idle' | 'ok' | 'bad' }) {
  const fill = state === 'ok' ? '#2f9e44' : state === 'bad' ? '#c92a2a' : '#51a34b'
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="none" className="absolute inset-0 size-full drop-shadow-[0_6px_6px_rgba(0,40,60,.35)]" aria-hidden>
      <path d="M100 60 L176 22 A92 56 0 1 1 150 12 Z" fill={fill} />
      <path d="M100 60 L40 30 M100 60 L30 70 M100 60 L70 108 M100 60 L140 110 M100 60 L185 70" stroke="#00000022" strokeWidth="3" />
    </svg>
  )
}

const Frog = ({ sink }: { sink?: boolean }) => (
  <motion.span
    layoutId="frog"
    transition={{ type: 'spring', stiffness: 160, damping: 14 }}
    animate={sink ? { y: 26, scale: 0.4, opacity: 0, rotate: 20 } : { y: 0, scale: 1, opacity: 1, rotate: 0 }}
    className="pointer-events-none z-20 block text-5xl drop-shadow-lg sm:text-6xl"
    aria-hidden
  >
    🐸
  </motion.span>
)

export default function Froggy() {
  const { board, progress, play, busy } = useGame<'froggy'>()
  const items = board.board.items
  const { cur, setCur, next, curRef } = useCursor(
    items.map((x) => x.key),
    progress,
  )
  const [pick, setPick] = useState<{ opt: string; ok: boolean | null } | null>(null)
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  useEffect(() => setPick(null), [cur])
  if (!it) return null
  const long = it.options.some((o) => o.length > 22) || it.options.length > 4
  const allDone = items.every((x) => progress[x.key]?.done)

  async function choose(o: string) {
    if (busy || pick || p?.done) return
    setPick({ opt: o, ok: null })
    const r = await play('answer', { item: it.key, value: o })
    if (!r?.ok) return setPick(null)
    setPick({ opt: o, ok: !!r.correct })
    const at = curRef.current
    if (r.done) setTimeout(() => curRef.current === at && (next(at), setPick(null)), r.correct ? 1100 : 1600)
    else setTimeout(() => setPick(null), 1300)
  }

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-3">
        {/* camino de la rana: una hoja por pregunta hasta la orilla */}
        <div className="flex items-center justify-center gap-1 overflow-x-auto rounded-2xl bg-[#d3f9d8] px-3 py-2 dark:bg-[#0b3d1a]" aria-label="Avance de la rana">
          <span className="text-lg" aria-hidden>
            🌿
          </span>
          {items.map((x, i) => {
            const q = progress[x.key]
            return (
              <button
                key={x.key}
                onClick={() => !pick && setCur(i)}
                aria-label={`Pregunta ${i + 1}${q?.done ? (q.correct ? ', bien' : ', mal') : ''}`}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-black text-white transition',
                  q?.done ? (q.correct ? 'bg-uap-green' : 'bg-uap-red') : 'bg-[#74b816]/50 text-[#1b5e20] dark:text-white',
                  i === cur && 'ring-4 ring-uap-gold',
                )}
              >
                {i === cur && !allDone ? '🐸' : i + 1}
              </button>
            )
          })}
          <span className="text-lg" aria-hidden>
            🏝️
          </span>
        </div>

        <div className="rounded-3xl bg-surface-2 p-4 text-center shadow-sm ring-1 ring-line">
          <p className="text-xs font-black uppercase tracking-wider text-ink-soft">
            Pregunta {cur + 1} de {items.length}
          </p>
          <ClueImage src={it.image_url} className="mx-auto my-2 h-28 w-40 bg-white" />
          <p className="font-display text-lg font-black leading-snug sm:text-xl">{it.q}</p>
        </div>

        {/* estanque */}
        <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_30%_20%,#74c0fc_0,#339af0_45%,#1864ab_100%)] px-3 pb-3 pt-5 shadow-inner">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background:repeating-radial-gradient(circle_at_70%_80%,transparent_0_18px,#ffffff33_19px_20px)]" aria-hidden />
          <div className={cn('relative grid gap-3', long ? 'grid-cols-1' : it.options.length === 2 ? 'grid-cols-2' : it.options.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
            {it.options.map((o) => {
              const chosen = pick?.opt === o
              const solved = p?.done && p.correct && (p.value === o || chosen)
              const state = solved || (chosen && pick?.ok) ? 'ok' : chosen && pick?.ok === false ? 'bad' : 'idle'
              return (
                <motion.button
                  key={o}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void choose(o)}
                  disabled={!!pick || p?.done}
                  aria-label={o}
                  className={cn('relative flex items-center justify-center px-4 text-center', long ? 'min-h-20' : 'min-h-28', p?.done && !solved && 'opacity-60')}
                >
                  <Pad state={state} />
                  <span className="relative z-10 flex flex-col items-center gap-1">
                    {chosen && <Frog sink={pick?.ok === false} />}
                    <span className="rounded-xl bg-white/90 px-2 py-1 font-display text-sm font-black leading-tight text-[#1b4332] shadow sm:text-base">{o}</span>
                  </span>
                  <AnimatePresence>
                    {chosen && pick?.ok === false && (
                      <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1.4, opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-30 text-4xl" aria-hidden>
                        💦
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              )
            })}
          </div>
          {/* orilla de salida */}
          <div className="relative mt-4 flex h-20 items-end justify-center rounded-t-[50%] bg-gradient-to-b from-[#8ce99a] to-[#2b8a3e]">
            {!pick && !p?.done && <Frog />}
            {p?.done && !pick && <span className="pb-3 font-display text-sm font-black text-white">{p.correct ? '¡Cruzó! 🐸' : 'Se cayó al agua 💦'}</span>}
          </div>
        </div>
        <p className="text-center text-sm font-semibold text-ink-soft">
          {pick?.ok === false && !p?.done ? triesLeft(board.tries, p?.tries) : 'Toca la hoja con la respuesta correcta para que la rana salte.'}
        </p>
      </div>
    </LayoutGroup>
  )
}
