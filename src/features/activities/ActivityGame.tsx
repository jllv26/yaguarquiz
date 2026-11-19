import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Sparkles, Target, XCircle } from 'lucide-react'
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/cn'
import { sfx } from '../../lib/sound'
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
}

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
  const meta = ACTIVITY_META[board.type]
  const done = Object.values(progress).filter((p) => p.done).length
  const points = Math.round(Object.values(progress).reduce((s, p) => s + (p.partial ?? 0) * 1000, 0))
  const finished = useRef(false)

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
          flash(true, `+${r.points ?? 1000}`)
        } else if (action !== 'letter' || r.hit === false) {
          if (['find', 'pair'].includes(action) || ['matching', 'classify'].includes(board.type)) setErrors((e) => e + 1)
          sfx.wrong()
          if (action !== 'letter') flash(false, r.done ? 'Sin intentos' : r.tries_left ? `Te queda${r.tries_left === 1 ? '' : 'n'} ${r.tries_left} intento${r.tries_left === 1 ? '' : 's'}` : 'No')
        }
        return r
      } catch {
        toast.error('Sin conexión', 'Tu avance está guardado; vuelve a intentarlo en un momento.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [engine, toast, onFatal, flash, board.type],
  )

  useEffect(() => {
    if (!finished.current && board.total > 0 && done >= board.total) {
      finished.current = true
      setTimeout(() => onAllDone?.(), 900)
    }
  }, [done, board.total, onAllDone])

  const Game = GAMES[board.type]
  const ctx = useMemo(() => ({ board, progress, play, busy, flash }), [board, progress, play, busy, flash])
  const Icon = meta.icon

  return (
    <GameCtx.Provider value={ctx}>
      <div className="relative flex w-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-surface-2/90 p-2 pl-3 shadow-sm ring-1 ring-line backdrop-blur">
          <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: meta.color }}>
            <Icon className="size-5" />
          </span>
          <span className="font-display font-black">{meta.label}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <Stat icon={<Target className="size-4" />} label="Resueltas" value={`${done}/${board.total}`} />
            <Stat icon={<Sparkles className="size-4" />} label="Puntos" value={points.toLocaleString('es-BO')} />
            {['wordsearch', 'memory', 'matching', 'classify'].includes(board.type) && <Stat icon={<XCircle className="size-4" />} label="Errores" value={String(errors)} />}
            {aside}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={board.total} aria-valuenow={done} aria-label="Avance">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-uap-green to-game-selva" animate={{ width: `${board.total ? (100 * done) / board.total : 0}%` }} />
        </div>
        {board.instructions && <p className="rounded-2xl bg-uap-gold/10 px-4 py-2 text-sm font-semibold">{board.instructions}</p>}
        <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-ink/5" />}>
          <Game />
        </Suspense>
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
      </div>
    </GameCtx.Provider>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-xl bg-ink/5 px-2.5 py-1.5" title={label}>
      <span className="text-ink-soft">{icon}</span>
      <span className="sr-only">{label}: </span>
      <span className="font-display font-black tabular-nums">{value}</span>
    </span>
  )
}

/** Imagen de una pista (si la hay) */
export function ClueImage({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null
  return <img src={src} alt="" loading="lazy" className={cn('rounded-xl object-contain', className)} />
}
