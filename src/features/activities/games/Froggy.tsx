import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { sfx } from '../../../lib/sound'
import { ClueImage, useGame } from '../ActivityGame'
import { triesLeft, useCursor } from './common'

const LETTERS = 'ABCDEFGH'

/** Rana dibujada (se ve igual en todos los celulares, no depende del emoji del sistema). */
function FrogArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden>
      <ellipse cx="32" cy="50" rx="22" ry="4" fill="#00000026" />
      <ellipse cx="13" cy="44" rx="9" ry="5" fill="#2f9e44" />
      <ellipse cx="51" cy="44" rx="9" ry="5" fill="#2f9e44" />
      <ellipse cx="32" cy="34" rx="22" ry="16" fill="#51cf66" />
      <ellipse cx="32" cy="40" rx="14" ry="9" fill="#d3f9d8" />
      <circle cx="20" cy="17" r="9" fill="#51cf66" />
      <circle cx="44" cy="17" r="9" fill="#51cf66" />
      <circle cx="20" cy="16" r="6" fill="#fff" />
      <circle cx="44" cy="16" r="6" fill="#fff" />
      <circle cx="21" cy="17" r="3.2" fill="#1b1b1b" />
      <circle cx="45" cy="17" r="3.2" fill="#1b1b1b" />
      <circle cx="22" cy="15.5" r="1" fill="#fff" />
      <circle cx="46" cy="15.5" r="1" fill="#fff" />
      <path d="M22 30 Q32 37 42 30" stroke="#1b5e20" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="17" cy="29" r="2.6" fill="#ff8787" opacity=".7" />
      <circle cx="47" cy="29" r="2.6" fill="#ff8787" opacity=".7" />
    </svg>
  )
}

/** La rana: salta con layoutId entre la orilla y la hoja elegida; si falla, se hunde. */
const Frog = ({ sink, small }: { sink?: boolean; small?: boolean }) => (
  <motion.span layoutId="frog" transition={{ type: 'spring', stiffness: 170, damping: 15 }} className={cn('pointer-events-none relative z-20 block', small ? 'w-12' : 'w-16 sm:w-20')}>
    <motion.span
      className="block"
      initial={{ y: -26, scale: 1.15 }}
      animate={sink ? { y: 18, scale: 0.35, opacity: 0, rotate: 25 } : { y: 0, scale: 1, opacity: 1, rotate: 0 }}
      transition={sink ? { duration: 0.5, delay: 0.25 } : { type: 'spring', stiffness: 260, damping: 12 }}
    >
      <FrogArt className="w-full drop-shadow-[0_4px_4px_rgba(0,0,0,.3)]" />
    </motion.span>
  </motion.span>
)

/** Hoja de nenúfar redonda con la letra de la opción. */
function Pad({ letter, state, children }: { letter: string; state: 'idle' | 'ok' | 'bad'; children?: ReactNode }) {
  const fill = state === 'ok' ? '#2b8a3e' : state === 'bad' ? '#c92a2a' : '#40c057'
  return (
    <span className="relative grid size-16 shrink-0 place-items-center sm:size-20">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_5px_4px_rgba(0,40,80,.35)]" aria-hidden>
        <path d="M50 50 L95 38 A46 46 0 1 1 86 22 Z" fill={fill} />
        <path d="M50 50 L18 24 M50 50 L10 60 M50 50 L36 92 M50 50 L72 90 M50 50 L94 62" stroke="#00000026" strokeWidth="3" />
      </svg>
      {children ?? <span className="relative font-display text-2xl font-black text-white drop-shadow sm:text-3xl">{letter}</span>}
    </span>
  )
}

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
  const allDone = items.every((x) => progress[x.key]?.done)

  async function choose(o: string) {
    if (busy || pick || p?.done) return
    sfx.jump()
    setPick({ opt: o, ok: null })
    const r = await play('answer', { item: it.key, value: o })
    if (!r?.ok) return setPick(null)
    setPick({ opt: o, ok: !!r.correct })
    if (r.correct) setTimeout(() => sfx.ribbit(), 350)
    else setTimeout(() => sfx.splash(), 250)
    const at = curRef.current
    if (r.done) setTimeout(() => curRef.current === at && (next(at), setPick(null)), r.correct ? 1300 : 1800)
    else setTimeout(() => setPick(null), 1500)
  }

  const status =
    pick?.ok === true
      ? '¡Bien! La rana llegó a la hoja correcta 🎉'
      : pick?.ok === false
        ? p?.done
          ? 'Se cayó al agua: esa no era. Pasamos a la siguiente.'
          : `¡Splash! Esa no era. ${triesLeft(board.tries, p?.tries)}.`
        : p?.done
          ? p.correct
            ? '¡Esta ya la cruzaste! Toca otro número arriba.'
            : 'En esta se cayó al agua. Toca otro número arriba.'
          : null

  return (
    <LayoutGroup>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        {/* camino de la rana: un círculo por pregunta */}
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
                  i === cur && 'scale-110 ring-4 ring-uap-gold',
                )}
              >
                {q?.done ? (q.correct ? '✓' : '✗') : i + 1}
              </button>
            )
          })}
          <span className="text-lg" aria-hidden>
            🏝️
          </span>
        </div>

        {/* pregunta */}
        <div className="rounded-3xl bg-surface-2 p-4 text-center shadow-sm ring-1 ring-line">
          <p className="text-xs font-black uppercase tracking-wider text-ink-soft">
            Pregunta {cur + 1} de {items.length}
          </p>
          <ClueImage src={it.image_url} className="mx-auto my-2 h-28 w-40 bg-white" />
          <p className="font-display text-xl font-black leading-snug sm:text-2xl">{it.q}</p>
        </div>

        {/* estanque */}
        <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#4dabf7_0%,#1c7ed6_60%,#1864ab_100%)] p-3 shadow-inner sm:p-4">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background:repeating-radial-gradient(circle_at_70%_80%,transparent_0_18px,#ffffff44_19px_20px)]" aria-hidden />
          {!p?.done && !pick && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: [0, 3, 0] }}
              transition={{ y: { duration: 1.2, repeat: Infinity } }}
              className="relative mb-3 text-center font-display text-base font-black text-white drop-shadow sm:text-lg"
            >
              👇 Toca la respuesta correcta para que la rana salte
            </motion.p>
          )}
          <div className={'relative grid gap-3 sm:grid-cols-2'}>
            {it.options.map((o, k) => {
              const chosen = pick?.opt === o
              const solved = !!p?.done && !!p.correct && (p.value === o || chosen)
              const state = solved || (chosen && pick?.ok) ? 'ok' : chosen && pick?.ok === false ? 'bad' : 'idle'
              const frogHere = chosen && !(p?.done && !pick)
              return (
                <motion.button
                  key={o}
                  data-coach={k === 0 ? '' : undefined}
                  animate={state === 'idle' && !p?.done ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={state === 'idle' ? { duration: 2.4 + k * 0.3, repeat: Infinity, ease: 'easeInOut' } : undefined}
                  whileHover={!pick && !p?.done ? { scale: 1.02 } : undefined}
                  whileTap={!pick && !p?.done ? { scale: 0.97 } : undefined}
                  onClick={() => void choose(o)}
                  disabled={!!pick || p?.done}
                  aria-label={`${LETTERS[k]}: ${o}`}
                  className={cn(
                    'relative flex items-center gap-3 rounded-[2rem] p-2 pr-4 text-left shadow-lg ring-4 transition-colors',
                    state === 'ok' ? 'bg-[#ebfbee] ring-uap-green' : state === 'bad' ? 'bg-[#fff5f5] ring-uap-red' : 'bg-white/95 ring-white/40 hover:ring-uap-gold',
                    p?.done && !solved && !chosen && 'opacity-55',
                  )}
                >
                  <Pad letter={LETTERS[k]} state={state}>
                    {frogHere ? <Frog small sink={pick?.ok === false} /> : undefined}
                  </Pad>
                  <span className="min-w-0 flex-1 font-display text-base font-black leading-snug text-[#1b4332] sm:text-lg [overflow-wrap:anywhere]">{o}</span>
                  <AnimatePresence>
                    {chosen && pick?.ok === false && (
                      <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-6 top-1 z-30 text-4xl" aria-hidden>
                        💦
                      </motion.span>
                    )}
                    {state === 'ok' && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="grid size-8 shrink-0 place-items-center rounded-full bg-uap-green text-lg font-black text-white" aria-hidden>
                        ✓
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              )
            })}
          </div>
          {/* orilla: aquí espera la rana */}
          <div className="relative mt-4 flex h-24 items-end justify-center rounded-t-[50%] bg-gradient-to-b from-[#8ce99a] to-[#2b8a3e]">
            {!pick && !p?.done && (
              <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 1, repeat: Infinity }} className="mb-1">
                <Frog />
              </motion.span>
            )}
            {!pick && p?.done && <span className="pb-4 font-display text-base font-black text-white drop-shadow">{p.correct ? '¡Cruzó! 🐸' : 'Se cayó al agua 💦'}</span>}
          </div>
        </div>
        <AnimatePresence mode="wait">
          {status && (
            <motion.p
              key={status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn('text-center font-display font-black', pick?.ok === false ? 'text-uap-red' : 'text-uap-green dark:text-game-selva')}
            >
              {allDone ? '¡Terminaste todas las preguntas! 🏝️' : status}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}
