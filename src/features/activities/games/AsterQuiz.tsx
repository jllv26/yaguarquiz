import { AnimatePresence, motion } from 'framer-motion'
import { Timer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import { sfx } from '../../../lib/sound'
import { ClueImage, useGame } from '../ActivityGame'
import { useCursor } from './common'

const ROCK = ['42% 58% 63% 37% / 41% 44% 56% 59%', '58% 42% 38% 62% / 52% 58% 42% 48%', '50% 50% 40% 60% / 60% 40% 60% 40%', '63% 37% 54% 46% / 55% 48% 52% 45%']

export default function AsterQuiz() {
  const { board, progress, play, busy } = useGame<'asterquiz'>()
  const items = board.board.items
  const secs = board.board.seconds ?? 30
  const { cur, next, curRef } = useCursor(
    items.map((x) => x.key),
    progress,
  )
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  const [shot, setShot] = useState<{ opt: string; ok: boolean | null; x: number; y: number } | null>(null)
  const [left, setLeft] = useState(secs)
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  // estrellas de fondo (fijas por partida)
  const stars = useMemo(() => Array.from({ length: 40 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: Math.random() * 2 + 1, d: Math.random() * 3 + 2 })), [])

  useEffect(() => {
    setShot(null)
    setLeft(secs)
  }, [cur, secs])
  // reloj por pregunta: si llega a cero, cuenta como no respondida
  useEffect(() => {
    if (!it || p?.done || shot || busy) return
    if (left <= 0) {
      void fire('')
      return
    }
    if (left <= 5) sfx.tick()
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, it?.key, p?.done, shot, busy])

  if (!it) return null

  async function fire(o: string) {
    if (busy || shot || p?.done) return
    const el = o ? refs.current[o] : null
    const bb = box.current?.getBoundingClientRect()
    const eb = el?.getBoundingClientRect()
    setShot({ opt: o, ok: null, x: bb && eb ? ((eb.left + eb.width / 2 - bb.left) / bb.width) * 100 : 50, y: bb && eb ? ((eb.top + eb.height / 2 - bb.top) / bb.height) * 100 : 30 })
    const r = await play('answer', { item: it.key, value: o })
    if (!r?.ok) return setShot(null)
    setShot((s) => (s ? { ...s, ok: !!r.correct } : s))
    const at = curRef.current
    if (r.done) setTimeout(() => curRef.current === at && next(at), 1300)
    else
      setTimeout(() => {
        setShot(null)
        setLeft(secs)
      }, 1200)
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={box} className="relative overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_0%,#3b5bdb_0,#1c1f4a_45%,#07081a_100%)] p-3 pb-24 text-white shadow-xl sm:p-5 sm:pb-28">
        {stars.map((s, i) => (
          <motion.span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: s.d, repeat: Infinity }} aria-hidden />
        ))}
        {/* panel de la pregunta */}
        <div className="relative z-10 rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/20 backdrop-blur">
          <div className="mb-1 flex items-center justify-between text-xs font-bold text-white/80">
            <span>
              Pregunta {cur + 1} de {items.length}
            </span>
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums', left <= 5 && !p?.done ? 'animate-pulse bg-uap-red' : 'bg-white/15')}>
              <Timer className="size-3.5" /> {p?.done ? '—' : `${Math.max(0, left)} s`}
            </span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <motion.div className={cn('h-full rounded-full', left <= 5 ? 'bg-[#ff6b6b]' : 'bg-[#69db7c]')} animate={{ width: `${p?.done ? 0 : (100 * Math.max(0, left)) / secs}%` }} transition={{ ease: 'linear', duration: 1 }} />
          </div>
          <ClueImage src={it.image_url} className="mx-auto mb-2 h-24 w-36 bg-white" />
          <p className="font-display text-lg font-black leading-snug sm:text-xl">{it.q}</p>
        </div>

        {/* asteroides */}
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
          {it.options.map((o, i) => {
            const chosen = shot?.opt === o
            const solved = p?.done && p.correct && (p.value === o || chosen)
            return (
              <motion.button
                key={o}
                ref={(el) => {
                  refs.current[o] = el
                }}
                onClick={() => void fire(o)}
                disabled={!!shot || p?.done}
                animate={chosen && shot?.ok !== null ? { scale: shot?.ok ? [1, 1.25, 0] : [1, 1.1, 1], rotate: 0 } : { y: [0, -7, 0], rotate: [0, i % 2 ? 4 : -4, 0] }}
                transition={chosen ? { duration: 0.6 } : { duration: 3 + (i % 3), repeat: Infinity }}
                whileTap={{ scale: 0.93 }}
                className={cn(
                  'relative flex min-h-20 items-center justify-center px-3 py-3 text-center font-display text-sm font-black leading-tight shadow-[inset_-8px_-10px_0_rgba(0,0,0,.25),0_8px_20px_rgba(0,0,0,.4)] sm:text-base',
                  solved ? 'bg-[#2f9e44]' : chosen && shot?.ok === false ? 'bg-[#c92a2a]' : 'bg-[radial-gradient(circle_at_30%_30%,#8d7b68,#5c4b3b_60%,#3d3026)]',
                  p?.done && !solved && 'opacity-40',
                )}
                style={{ borderRadius: ROCK[i % ROCK.length] }}
              >
                <span className="drop-shadow">{o}</span>
              </motion.button>
            )
          })}
        </div>

        {/* láser y explosión */}
        <AnimatePresence>
          {shot && shot.opt && (
            <svg key="laser" className="pointer-events-none absolute inset-0 z-20 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <motion.line x1="50" y1="92" x2={shot.x} y2={shot.y} stroke={shot.ok === false ? '#ff6b6b' : '#8ce99a'} strokeWidth="0.8" strokeLinecap="round" initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }} transition={{ duration: 0.5 }} />
            </svg>
          )}
          {shot && shot.ok !== null && shot.opt && (
            <motion.span key="boom" className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 text-5xl" style={{ left: `${shot.x}%`, top: `${shot.y}%` }} initial={{ scale: 0 }} animate={{ scale: [0, 1.6, 1.2], opacity: [1, 1, 0] }} transition={{ duration: 1 }} aria-hidden>
              {shot.ok ? '💥' : '❌'}
            </motion.span>
          )}
        </AnimatePresence>

        {/* nave */}
        <motion.div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-5xl sm:text-6xl" animate={shot?.ok === false ? { x: [-8, 8, -6, 6, 0] } : { y: [0, -4, 0] }} transition={shot?.ok === false ? { duration: 0.4 } : { duration: 2, repeat: Infinity }} aria-hidden>
          <span className="inline-block -rotate-45">🚀</span>
        </motion.div>
        {p?.done && !shot && <p className="absolute bottom-24 left-0 right-0 z-20 text-center font-display font-black">{p.correct ? '¡Asteroide destruido! ✨' : 'Esa pregunta ya pasó'}</p>}
      </div>
      <p className="text-center text-sm font-semibold text-ink-soft">Toca el asteroide con la respuesta correcta antes de que se acabe el tiempo.</p>
    </div>
  )
}
