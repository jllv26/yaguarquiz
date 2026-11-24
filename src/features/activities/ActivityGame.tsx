import { ActivityBadge } from './ActivityBadge'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { CheckCircle2, Flame, Sparkles, Star, Target, XCircle } from 'lucide-react'
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/cn'
import { haptic, sfx } from '../../lib/sound'
import { GameCoach, PointerHint } from './Coach'
import { HowToPlayButton } from './HowToPlay'
import { ACTIVITY_META, type ActivityBoard, type ActivityType, type Engine, type PlayAction, type PlayResult, type Progress } from './types'

const GAMES: Record<ActivityType, React.LazyExoticComponent<() => ReactNode>> = {
  crossword: lazy(() => import('./games/Crossword')),
  wordsearch: lazy(() => import('./games/Wordsearch')),
  matching: lazy(() => import('./games/Matching')),
  memory: lazy(() => import('./games/Memory')),
  fill_text: lazy(() => import('./games/FillText')),
  rosco: lazy(() => import('./games/Rosco')),
  anagram: lazy(() => import('./games/Tiles').then((m) => ({ default: m.Anagram }))),
  sentence: lazy(() => import('./games/Tiles').then((m) => ({ default: m.Sentence }))),
  hangman: lazy(() => import('./games/Hangman')),
  classify: lazy(() => import('./games/Classify')),
  research: lazy(() => import('./games/Research')),
  dictation: lazy(() => import('./games/Dictation').then((m) => ({ default: m.Dictation }))),
  froggy: lazy(() => import('./games/Froggy')),
  asterquiz: lazy(() => import('./games/AsterQuiz')),
  puzzle: lazy(() => import('./games/PuzzleGame')),
  video: lazy(() => import('./games/VideoQuiz')),
  dialogue: lazy(() => import('./games/Dialogue')),
  yesno: lazy(() => import('./games/YesNo')),
  rows: lazy(() => import('./games/Rows')),
  riddle: lazy(() => import('./games/Riddle')),
  map: lazy(() => import('./games/MapGame')),
  slides: lazy(() => import('./games/Slides')),
}

const PRAISE = ['¡Bien!', '¡Genial!', '¡Excelente!', '¡Así se hace!', '¡Correcto!']

export const PLAY_MESSAGES: Record<string, string> = {
  already: 'Esa palabra ya está resuelta.',
  time: 'Se acabó el tiempo; la actividad se entregó.',
  locked: 'La actividad está bloqueada. Pide al docente que la habilite.',
  no_attempt: 'No tienes un intento en curso.',
  cards: 'Elige dos cartas distintas.',
}

interface Ctx<T extends ActivityType = ActivityType> {
  board: ActivityBoard<T>
  progress: Record<string, Progress>
  play: (action: PlayAction, data: Record<string, unknown>) => Promise<PlayResult | null>
  busy: boolean
  /** Muestra una burbuja de resultado (+puntos o error) */
  flash: (good: boolean, text: string) => void
}
const GameCtx = createContext<Ctx | null>(null)
export function useGame<T extends ActivityType>() {
  const c = useContext(GameCtx)
  if (!c) throw new Error('useGame fuera de ActivityGame')
  return c as unknown as Ctx<T>
}

export function ActivityGame({
  board,
  engine,
  onAllDone,
  onFatal,
  aside,
}: {
  board: ActivityBoard
  engine: Engine
  onAllDone?: () => void
  /** errores que terminan el intento (tiempo, bloqueo) */
  onFatal?: (error: string) => void
  aside?: ReactNode
}) {
  const toast = useToast()
  const [progress, setProgress] = useState<Record<string, Progress>>(board.progress ?? {})
  const [errors, setErrors] = useState(board.errors ?? 0)
  const [busy, setBusy] = useState(false)
  const [bubble, setBubble] = useState<{ id: number; good: boolean; text: string } | null>(null)
  // guía dentro del juego: jugadas hechas y si ya tocó el tablero
  const [moves, setMoves] = useState(0)
  const [touched, setTouched] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  // efectos: puntos que vuelan al marcador y sacudida al fallar
  const tapAt = useRef<{ x: number; y: number } | null>(null)
  const pointsRef = useRef<HTMLSpanElement>(null)
  const [flies, setFlies] = useState<{ id: number; x: number; y: number; dx: number; dy: number; text: string }[]>([])
  const shake = useAnimationControls()
  const flyPoints = useCallback((text: string) => {
    const to = pointsRef.current?.getBoundingClientRect()
    const from = tapAt.current ?? (area.current ? { x: area.current.getBoundingClientRect().left + area.current.clientWidth / 2, y: Math.min(window.innerHeight * 0.6, area.current.getBoundingClientRect().top + 120) } : null)
    if (!to || !from) return
    const id = Date.now() + Math.random()
    setFlies((f) => [...f.slice(-4), { id, x: from.x, y: from.y, dx: to.left + to.width / 2 - from.x, dy: to.top + to.height / 2 - from.y, text }])
    window.setTimeout(() => sfx.coin(), 650)
    window.setTimeout(() => setFlies((f) => f.filter((x) => x.id !== id)), 1000)
  }, [])
  const meta = ACTIVITY_META[board.type]
  const done = Object.values(progress).filter((p) => p.done).length
  const points = Math.round(Object.values(progress).reduce((s, p) => s + (p.partial ?? 0) * 1000, 0))
  const finished = useRef(false)
  const [streak, setStreak] = useState(0)
  const streakRef = useRef(0)
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null)
  const maxPoints = Math.max(1, board.total * 1000)
  const frac = points / maxPoints
  const stars = frac >= 0.9 ? 3 : frac >= 0.75 ? 2 : frac >= 0.5 ? 1 : 0
  const prevStars = useRef(stars)
  useEffect(() => {
    if (stars > prevStars.current) {
      sfx.rankUp()
      setBanner({ id: Date.now(), text: stars === 3 ? '⭐⭐⭐ ¡Tres estrellas!' : `⭐ ¡Ganaste ${stars === 1 ? 'tu primera estrella' : 'otra estrella'}!` })
    }
    prevStars.current = stars
  }, [stars])
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 2200)
    return () => clearTimeout(t)
  }, [banner])

  const flash = useCallback((good: boolean, text: string) => setBubble({ id: Date.now(), good, text }), [])
  useEffect(() => {
    if (!bubble) return
    const t = setTimeout(() => setBubble(null), 1300)
    return () => clearTimeout(t)
  }, [bubble])

  const play = useCallback(
    async (action: PlayAction, data: Record<string, unknown>) => {
      setBusy(true)
      try {
        const r = await engine.play(action, data)
        if (!r.ok) {
          if (r.error && ['time', 'locked', 'no_attempt'].includes(r.error)) onFatal?.(r.error)
          else toast.error(PLAY_MESSAGES[r.error ?? ''] ?? 'No se pudo registrar la jugada')
          return r
        }
        const item = r.item ?? (data.item as string | undefined)
        setTouched(true)
        if (action !== 'clue') setMoves((m) => m + 1)
        if (action === 'clue') return r // adivinanza: la pista la muestra el juego
        if (action === 'seen') {
          // presentación: la diapositiva cuenta como vista (sin puntos ni sonidos)
          if (item) setProgress((p) => ({ ...p, [item]: { done: true, correct: true, partial: 1 } }))
          return r
        }
        if (action === 'save') {
          // investigación: solo se guarda el texto (sin puntos ni sonidos)
          if (item) setProgress((p) => ({ ...p, [item]: { ...p[item], done: !!r.done, value: String(data.value ?? '') } }))
          return r
        }
        if (item) {
          setProgress((p) => ({
            ...p,
            [item]: {
              ...p[item],
              done: r.done ?? !!r.correct,
              correct: r.correct,
              tries: r.tries ?? p[item]?.tries,
              partial: r.correct ? (r.points ?? 1000) / 1000 : 0,
              value: r.correct ? (r.value ?? (data.value as string | undefined)) : p[item]?.value,
              cells: (data.cells as [number, number][] | undefined) ?? p[item]?.cells,
              wrong: r.wrong ?? p[item]?.wrong,
              answer: r.answer ?? p[item]?.answer,
              pair: board.type === 'memory' && r.correct ? [String(data.a), String(data.b)] : p[item]?.pair,
            },
          }))
        }
        if (r.correct) {
          sfx.correct()
          const k = ++streakRef.current
          setStreak(k)
          const praise = k >= 10 ? '🔥 ¡Imparable!' : k >= 5 ? `🔥 ¡Racha de ${k}!` : k === 3 ? '🔥 ¡Racha de 3!' : PRAISE[k % PRAISE.length]
          flash(true, `${praise} +${r.points ?? 1000}`)
          flyPoints(`+${r.points ?? 1000}`)
          haptic(25)
        } else if (action !== 'letter' || r.hit === false) {
          if (['find', 'pair'].includes(action) || ['matching', 'classify'].includes(board.type)) setErrors((e) => e + 1)
          sfx.wrong()
          haptic([50, 40, 50])
          if (action !== 'letter') void shake.start({ x: [0, -10, 9, -6, 5, -2, 0], transition: { duration: 0.45 } })
          if (action !== 'letter' || (r.done && !r.correct)) {
            streakRef.current = 0
            setStreak(0)
          }
          if (action !== 'letter') flash(false, r.near && !r.done ? '¡Casi! Revisa las tildes' : r.done ? 'Sin intentos' : r.tries_left ? `Te queda${r.tries_left === 1 ? '' : 'n'} ${r.tries_left} intento${r.tries_left === 1 ? '' : 's'}` : '¡Casi! Intenta otra vez')
        }
        return r
      } catch {
        toast.error('Sin conexión', 'Tu avance está guardado; vuelve a intentarlo en un momento.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [engine, toast, onFatal, flash, board.type, flyPoints, shake],
  )

  // investigación y presentación no tienen puntos: se entregan con su botón
  const research = board.type === 'research' || board.type === 'slides'
  useEffect(() => {
    if (research) return // la investigación y la presentación se entregan con su botón
    if (!finished.current && board.total > 0 && done >= board.total) {
      finished.current = true
      setTimeout(() => onAllDone?.(), 900)
    }
  }, [done, board.total, onAllDone, research])

  const withErrors = ['wordsearch', 'memory', 'matching', 'classify'].includes(board.type)
  const statCount = (research ? 1 : 2) + (withErrors ? 1 : 0) + (aside ? 1 : 0)
  const Game = GAMES[board.type]
  const ctx = useMemo(() => ({ board, progress, play, busy, flash }), [board, progress, play, busy, flash])

  return (
    <GameCtx.Provider value={ctx}>
      <div className="relative flex w-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-surface-2/90 p-2 pl-2.5 shadow-sm ring-1 ring-line backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ActivityBadge type={board.type} size="sm" />
            <span className="truncate font-display font-black">{meta.label}</span>
            <AnimatePresence>
              {streak >= 2 && (
                <motion.span key={streak} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex shrink-0 items-center gap-0.5 rounded-full bg-[#e8590c] px-2 py-0.5 font-display text-xs font-black text-white" title="Racha de aciertos seguidos">
                  <Flame className="size-3.5" /> {streak}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <HowToPlayButton type={board.type} className="order-2 shrink-0 sm:order-3" />
          <div className="order-3 grid w-full gap-1.5 text-sm sm:order-2 sm:flex sm:w-auto" style={{ gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))` }}>
            <Stat icon={<Target className="size-4" />} label={board.type === 'slides' ? 'Vistas' : research ? 'Respondidas' : 'Resueltas'} value={`${done}/${board.total}`} />
            {!research && (
              <Stat icon={<Sparkles className="size-4" />} label="Puntos" value={points.toLocaleString('es-BO')} pop elRef={pointsRef} />
            )}
            {withErrors && <Stat icon={<XCircle className="size-4" />} label="Errores" value={String(errors)} />}
            {aside}
          </div>
        </div>
        {research ? (
          <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={board.total} aria-valuenow={done} aria-label="Avance">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-uap-green to-game-selva" animate={{ width: `${board.total ? (100 * done) / board.total : 0}%` }} />
          </div>
        ) : (
          <div className="relative mx-1 mb-2 mt-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-label={`Puntaje: ${stars} de 3 estrellas`}>
            <div className="h-3 overflow-hidden rounded-full bg-ink/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-uap-green via-game-selva to-uap-gold" animate={{ width: `${Math.min(100, frac * 100)}%` }} />
            </div>
            {[0.5, 0.75, 0.9].map((t, i) => (
              <motion.span
                key={t}
                animate={stars > i ? { scale: [1, 1.5, 1] } : {}}
                className="absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface-2 shadow ring-1 ring-line"
                style={{ left: `${t * 100}%` }}
                title={`${i + 1} estrella${i ? 's' : ''}: ${Math.round(t * 100)} % de los puntos`}
              >
                <Star className={cn('size-4', stars > i ? 'fill-uap-gold text-uap-gold' : 'text-ink/30')} />
              </motion.span>
            ))}
          </div>
        )}
        <GameCoach type={board.type} instructions={board.instructions} moves={moves} touched={touched} />
        <motion.div
          ref={area}
          animate={shake}
          className="relative"
          onPointerDownCapture={(e) => {
            setTouched(true)
            tapAt.current = { x: e.clientX, y: e.clientY }
          }}
          onKeyDownCapture={() => {
            setTouched(true)
            tapAt.current = null
          }}
        >
          <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-ink/5" />}>
            <Game />
          </Suspense>
          <PointerHint type={board.type} area={area} hidden={touched || moves > 0 || done > 0} />
        </motion.div>
        {/* puntos que vuelan hasta el marcador */}
        <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
          <AnimatePresence>
            {flies.map((f) => (
              <motion.span
                key={f.id}
                initial={{ x: f.x, y: f.y, scale: 0.6, opacity: 0 }}
                animate={{ x: [f.x, f.x + f.dx * 0.15, f.x + f.dx], y: [f.y, f.y - 60, f.y + f.dy], scale: [0.6, 1.3, 0.7], opacity: [0, 1, 1] }}
                exit={{ opacity: 0, scale: 0.2 }}
                transition={{ duration: 0.7, ease: 'easeInOut' }}
                className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-uap-gold px-2.5 py-1 font-display text-sm font-black text-ink shadow-lg ring-2 ring-white"
              >
                {f.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={bubble.id}
              role="status"
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16 }}
              className={cn(
                'pointer-events-none fixed left-1/2 top-24 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2 font-display text-lg font-black text-white shadow-xl',
                bubble.good ? 'bg-uap-green' : 'bg-uap-red',
              )}
            >
              {bubble.good ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />} {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.id}
              role="status"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="pointer-events-none fixed left-1/2 top-40 z-50 -translate-x-1/2 whitespace-nowrap rounded-3xl bg-uap-gold px-6 py-3 font-display text-xl font-black text-ink shadow-2xl"
            >
              {banner.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameCtx.Provider>
  )
}

function Stat({ icon, label, value, pop, elRef }: { icon: ReactNode; label: string; value: string; pop?: boolean; elRef?: React.Ref<HTMLSpanElement> }) {
  return (
    <span ref={elRef} className="flex min-w-0 items-center justify-center gap-1 rounded-xl bg-ink/5 px-2 py-1.5" title={label}>
      <span className="hidden text-ink-soft min-[380px]:inline sm:inline">{icon}</span>
      <span className="truncate text-[11px] font-semibold text-ink-soft sm:text-xs">{label}</span>
      {pop ? (
        <motion.span key={value} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ duration: 0.5, delay: 0.6 }} className="font-display font-black tabular-nums">
          {value}
        </motion.span>
      ) : (
        <span className="font-display font-black tabular-nums">{value}</span>
      )}
    </span>
  )
}

/** Imagen de una pista (si la hay) */
export function ClueImage({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null
  return <img src={src} alt="" loading="lazy" className={cn('rounded-xl object-contain', className)} />
}
