import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Download,
  Expand,
  Flag,
  Loader2,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  Users,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { Shape } from '../../components/Shape'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import {
  hostAddTime,
  hostAdvance,
  hostEnd,
  hostParticipant,
  hostPause,
  hostState,
  playUrl,
  serverOffset,
  useNudgeChannel,
  type HostParticipant,
  type HostState,
  type Phase,
} from '../../lib/api/live'
import { ANSWER_STYLES, BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'
import { buildWorkbook, downloadBlob, headerCell, titleCell } from '../../lib/excel'
import { isMuted, setMuted, sfx } from '../../lib/sound'
import { useAuth } from '../auth/AuthProvider'
import { AvatarBubble, BigCountdown, Leaderboard, Podium } from '../live/LiveBits'
import { celebrate, COUNTDOWN_MS, secondsLeft, useServerNow } from '../live/clock'
import { useBots } from './bots'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { ClawSwipe, PawTrail } from '../../components/jaguar/JaguarFx'
import { useAutoSync } from '../reports/useAutoSync'
import { ExamMonitor } from './ExamMonitor'

/** Estilo de color/forma de cada opción (en V/F: Verdadero = rombo azul, Falso = triángulo rojo). */
const styleIndex = (type: string, i: number) => (type === 'true_false' ? (i === 0 ? 1 : 0) : i)

export function HostPage() {
  const { loading, session, teacher } = useAuth()
  if (loading) return <Center><Loader2 className="size-10 animate-spin text-uap-green" /></Center>
  if (!session) return <Navigate to="/admin/login" replace />
  if (!teacher?.approved) return <Navigate to="/admin" replace />
  return <HostRouter />
}

/** En vivo → proyector; examen o tarea → monitor. */
function HostRouter() {
  const { id = '' } = useParams()
  const [mode, setMode] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    hostState(id)
      .then((st) => setMode(st.session.mode))
      .catch((e: Error) => setError(e.message))
  }, [id])
  if (error)
    return (
      <Center>
        <SolidCard className="max-w-md p-8 text-center">
          <XCircle className="mx-auto mb-3 size-12 text-uap-red" />
          <p className="font-display text-xl font-bold">No pudimos abrir la sesión</p>
          <p className="mt-1 text-ink-soft">{error}</p>
          <Link to="/admin/sesiones" className="mt-4 inline-block">
            <Button variant="secondary">Volver a sesiones</Button>
          </Link>
        </SolidCard>
      </Center>
    )
  if (!mode) return <Center><Loader2 className="size-10 animate-spin text-uap-green" /></Center>
  return mode === 'live' ? <Host /> : <ExamMonitor id={id} />
}

function Host() {
  const { id = '' } = useParams()
  const toast = useToast()
  const confirm = useConfirm()
  const [st, setSt] = useState<HostState | null>(null)
  const [offset, setOffset] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [muted, setMute] = useState(isMuted())
  const [panel, setPanel] = useState(false)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    const t0 = Date.now()
    try {
      const s = await hostState(id)
      setOffset(serverOffset(s.server_now, t0))
      setSt(s)
      setLoadError('')
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [id])
  const nudge = useNudgeChannel(id)

  const act = useCallback(
    async (fn: () => Promise<HostState>) => {
      if (busy.current) return false
      busy.current = true
      try {
        const s = await fn()
        setSt(s)
        nudge()
        return true
      } catch (e) {
        toast.error('No se pudo completar la acción', (e as Error).message)
        return false
      } finally {
        busy.current = false
      }
    },
    [nudge, toast],
  )

  const phase = st?.session.phase
  // Consulta periódica (más rápida en la sala y durante la pregunta)
  useEffect(() => {
    void refresh()
    if (phase === 'finished') return
    const t = setInterval(() => void refresh(), phase === 'lobby' || phase === 'question' ? 1000 : 2000)
    return () => clearInterval(t)
  }, [refresh, phase])

  const now = useServerNow(offset, phase === 'countdown' || phase === 'question')
  const bots = useBots(st)
  useAutoSync(id, phase === 'finished' && st?.session.identification === 'roster')

  // ---------------------------------------------------------- avances automáticos
  const autoKey = useRef('')
  const allInAt = useRef<{ key: string; at: number } | null>(null)
  useEffect(() => {
    if (!st || st.session.paused_at) return
    const { phase: ph, question_index, phase_started_at, question_ends_at } = st.session
    if (ph !== 'countdown' && ph !== 'question') return
    const key = `${ph}-${question_index}`
    if (autoKey.current === key) return
    const nowMs = Date.now() + offset
    let target: number
    if (ph === 'countdown') target = new Date(phase_started_at).getTime() + COUNTDOWN_MS
    else {
      const ends = new Date(question_ends_at ?? 0).getTime() + 300
      const playing = st.participants.filter((p) => !p.kicked).length
      if (playing > 0 && st.answered >= playing) {
        // todos respondieron: se cierra a los 0,9 s (para que se vea "40 de 40")
        if (allInAt.current?.key !== key) allInAt.current = { key, at: nowMs + 900 }
        target = Math.min(allInAt.current.at, ends)
      } else {
        allInAt.current = null
        target = ends
      }
    }
    const t = setTimeout(() => {
      autoKey.current = key
      void act(() => hostAdvance(id, ph)).then((ok) => {
        if (!ok) autoKey.current = ''
      })
    }, Math.max(0, target - nowMs))
    return () => clearTimeout(t)
  }, [st, offset, act, id])

  // ---------------------------------------------------------- sonidos
  const prevPhase = useRef<Phase | undefined>(undefined)
  const [claw, setClaw] = useState<number | null>(null)
  useEffect(() => {
    if (!phase || prevPhase.current === phase) return
    const first = prevPhase.current === undefined
    prevPhase.current = phase
    if (first) return
    if (phase === 'question') {
      sfx.go()
      setClaw(Date.now())
    }
    if (phase === 'reveal') sfx.reveal()
    if (phase === 'finished') {
      sfx.fanfare()
      setTimeout(() => celebrate(true), 2200)
    }
  }, [phase])
  const secs = st?.session.phase === 'question' && !st.session.paused_at ? secondsLeft(st.session.question_ends_at, now) : null
  const cd = st?.session.phase === 'countdown' ? Math.ceil((new Date(st.session.phase_started_at).getTime() + COUNTDOWN_MS - now) / 1000) : null
  const lastBeep = useRef<string>('')
  useEffect(() => {
    const k = `${phase}-${st?.session.question_index}-${secs ?? cd}`
    if (lastBeep.current === k) return
    lastBeep.current = k
    if (cd !== null && cd > 0) sfx.countdown()
    if (secs !== null && secs > 0 && secs <= 5) sfx.urgent()
  }, [secs, cd, phase, st?.session.question_index])

  const joined = useRef(0)
  useEffect(() => {
    const n = st?.participants.length ?? 0
    if (phase === 'lobby' && n > joined.current) sfx.join()
    joined.current = n
  }, [st?.participants.length, phase])

  // ---------------------------------------------------------- acciones
  const isLast = st ? (st.session.question_index ?? -1) + 1 >= st.session.total : false
  const primary = useMemo(() => {
    if (!st) return null
    const ph = st.session.phase
    if (ph === 'lobby') return { label: 'Empezar', icon: <Play className="size-6" />, disabled: !st.participants.length }
    if (ph === 'question') return { label: 'Cerrar pregunta', icon: <Flag className="size-6" /> }
    if (ph === 'reveal') return { label: st.session.show_ranking ? 'Ver ranking' : isLast ? 'Ver podio' : 'Siguiente pregunta', icon: <ChevronRight className="size-6" /> }
    if (ph === 'leaderboard') return { label: isLast ? 'Ver podio' : 'Siguiente pregunta', icon: <ChevronRight className="size-6" /> }
    return null
  }, [st, isLast])
  const next = useCallback(() => {
    if (!st || !primary || primary.disabled || st.session.paused_at) return
    void act(() => hostAdvance(id, st.session.phase))
  }, [st, primary, act, id])
  const togglePause = useCallback(() => {
    if (!st) return
    void act(() => hostPause(id, !st.session.paused_at))
  }, [st, act, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('[role="dialog"]')) return
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
      if (e.key.toLowerCase() === 'p' && phase !== 'lobby' && phase !== 'finished') togglePause()
      if (e.key.toLowerCase() === 'f') void document.documentElement.requestFullscreen?.().catch(() => null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, togglePause, phase])

  async function endSession() {
    const ok = await confirm({
      title: '¿Terminar la sesión ahora?',
      message: 'Los estudiantes verán su resultado final y ya no podrán responder.',
      confirmText: 'Terminar',
      danger: true,
    })
    if (ok) void act(() => hostEnd(id))
  }
  async function kick(p: HostParticipant) {
    const ok = await confirm({ title: `¿Retirar a ${p.nickname}?`, message: 'Ya no podrá seguir jugando en esta sesión.', confirmText: 'Retirar', danger: true })
    if (!ok) return
    try {
      await hostParticipant(p.id, 'kick')
      void refresh()
    } catch (e) {
      toast.error('No se pudo retirar', (e as Error).message)
    }
  }
  async function authorize(p: HostParticipant) {
    try {
      await hostParticipant(p.id, 'authorize_device')
      toast.success(`${p.nickname} ya puede entrar desde el otro dispositivo`)
      void refresh()
    } catch (e) {
      toast.error('No se pudo autorizar', (e as Error).message)
    }
  }

  if (loadError && !st)
    return (
      <Center>
        <SolidCard className="max-w-md p-8 text-center">
          <XCircle className="mx-auto mb-3 size-12 text-uap-red" />
          <p className="font-display text-xl font-bold">No pudimos abrir la sesión</p>
          <p className="mt-1 text-ink-soft">{loadError}</p>
          <Link to="/admin/sesiones" className="mt-4 inline-block">
            <Button variant="secondary">Volver a sesiones</Button>
          </Link>
        </SolidCard>
      </Center>
    )
  if (!st) return <Center><Loader2 className="size-10 animate-spin text-uap-green" /></Center>

  const s = st.session
  const playing = st.participants.filter((p) => !p.kicked)
  const takeovers = playing.filter((p) => p.takeover_pending)
  const color = s.subject?.theme_color || '#1B7339'

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant={s.phase === 'question' ? 'calm' : 'jungle'} />

      {/* Barra superior */}
      <header className="glass relative z-10 mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-2.5">
        <Link to="/admin/sesiones" className="grid size-10 place-items-center rounded-xl hover:bg-ink/5" aria-label="Volver al panel">
          <ArrowLeft className="size-5" />
        </Link>
        <img src={BRAND.logoColor} alt="" className="size-10 rounded-xl bg-white object-contain p-0.5" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {s.subject?.code} · Paralelo {s.subject?.parallel}
          </p>
          <p className="truncate font-display text-lg font-extrabold">{s.quiz_title}</p>
        </div>
        {s.phase !== 'lobby' && s.phase !== 'finished' && (
          <span className="rounded-2xl bg-uap-blue px-3 py-1.5 text-center font-display text-white">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-white/70">PIN</span>
            <span className="text-xl font-black tracking-[0.15em]">{s.pin}</span>
          </span>
        )}
        <button onClick={() => setPanel(true)} className="flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-3 font-display font-bold shadow-sm" aria-label="Ver participantes">
          <Users className="size-5" /> {playing.length}
          {takeovers.length > 0 && <span className="size-2.5 animate-pulse rounded-full bg-game-coral" />}
        </button>
        <IconBtn
          label={muted ? 'Activar sonido' : 'Silenciar'}
          onClick={() => {
            setMuted(!muted)
            setMute(!muted)
          }}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </IconBtn>
        <IconBtn label="Pantalla completa (F)" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => null)}>
          <Expand className="size-5" />
        </IconBtn>
        {s.phase !== 'finished' && (
          <Button size="sm" variant="danger" onClick={() => void endSession()}>
            Terminar
          </Button>
        )}
      </header>

      {takeovers.length > 0 && (
        <div className="relative z-10 mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-game-coral px-4 py-2 text-white">
          <ShieldAlert className="size-5" />
          <span className="font-semibold">Intentan entrar desde otro dispositivo:</span>
          {takeovers.map((p) => (
            <button key={p.id} onClick={() => void authorize(p)} className="rounded-xl bg-white/20 px-3 py-1 text-sm font-bold hover:bg-white/30">
              Autorizar a {p.nickname}
            </button>
          ))}
        </div>
      )}

      <main className="relative z-0 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${s.phase}-${s.question_index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-1 flex-col"
          >
            {s.phase === 'lobby' && <Lobby st={st} onKick={kick} bots={bots} />}
            {s.phase === 'countdown' && (
              <Center inline>
                <BigCountdown value={Math.max(0, cd ?? 0)} label={`Pregunta ${(s.question_index ?? 0) + 1} de ${s.total}`} />
              </Center>
            )}
            {(s.phase === 'question' || s.phase === 'reveal') && st.question && (
              <QuestionStage st={st} secs={secs} reveal={s.phase === 'reveal'} playing={playing.length} />
            )}
            {s.phase === 'leaderboard' && (
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5">
                <h2 className="font-display text-4xl font-black drop-shadow">🏆 Ranking</h2>
                <Leaderboard rows={st.leaderboard} big />
              </div>
            )}
            {s.phase === 'finished' && <Final st={st} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Controles */}
      {s.phase !== 'finished' && (
        <footer className="glass relative z-10 mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {s.phase !== 'lobby' && (
              <Button variant="secondary" onClick={togglePause}>
                {s.paused_at ? <Play className="size-5" /> : <Pause className="size-5" />} {s.paused_at ? 'Reanudar' : 'Pausar'}
              </Button>
            )}
            {s.phase === 'question' && (
              <Button variant="secondary" onClick={() => void act(() => hostAddTime(id, 10))}>
                <Plus className="size-5" /> 10 s
              </Button>
            )}
            <span className="hidden text-sm text-ink-soft md:inline">
              Atajos: <kbd className="rounded bg-ink/10 px-1.5">Espacio</kbd> siguiente · <kbd className="rounded bg-ink/10 px-1.5">P</kbd> pausa ·{' '}
              <kbd className="rounded bg-ink/10 px-1.5">F</kbd> pantalla completa
            </span>
          </div>
          {primary && (
            <Button size="xl" variant={s.phase === 'lobby' ? 'success' : 'primary'} onClick={next} disabled={primary.disabled || !!s.paused_at}>
              {primary.icon} {primary.label}
            </Button>
          )}
        </footer>
      )}

      {s.paused_at && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-uap-blue-900/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <Pause className="mx-auto size-20" />
            <p className="mt-3 font-display text-5xl font-black">En pausa</p>
            <Button size="xl" variant="gold" className="mt-6" onClick={togglePause}>
              <Play className="size-6" /> Reanudar
            </Button>
          </div>
        </div>
      )}

      <ClawSwipe playKey={claw} label="¡Ya!" />
      <ParticipantsPanel open={panel} onClose={() => setPanel(false)} st={st} onKick={kick} onAuthorize={authorize} />
    </div>
  )
}

// ================================================================ sala de espera
function Lobby({ st, onKick, bots }: { st: HostState; onKick: (p: HostParticipant) => void; bots: ReturnType<typeof useBots> }) {
  const s = st.session
  const url = playUrl(s.pin)
  const short = playUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const playing = st.participants.filter((p) => !p.kicked)
  const [showAbsent, setShowAbsent] = useState(false)
  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <SolidCard className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="font-display text-lg font-bold text-ink-soft">Entra desde tu celular o PC a</p>
        <p className="break-all font-display text-2xl font-black text-uap-blue dark:text-game-electric">{short}</p>
        <div className="w-full rounded-3xl bg-uap-blue px-4 py-3 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">PIN del juego</p>
          <p className="font-display text-6xl font-black tracking-[0.12em] sm:text-7xl">{s.pin}</p>
        </div>
        <div className="rounded-3xl bg-white p-3 shadow-inner">
          <QRCodeSVG value={url} size={210} level="M" fgColor="#14213D" />
        </div>
        <p className="text-sm text-ink-soft">
          {s.identification === 'roster' ? `Entran con su RU${s.require_ci ? ' y los últimos 3 dígitos del CI' : ''}` : 'Entran con un apodo'}
        </p>
      </SolidCard>

      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-3xl font-black drop-shadow">
            {playing.length} {playing.length === 1 ? 'estudiante' : 'estudiantes'} en la sala
          </h2>
          <div className="flex gap-2">
            {s.identification === 'roster' && st.absent.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setShowAbsent((x) => !x)}>
                Faltan {st.absent.length}
              </Button>
            )}
            {s.identification === 'nickname' && (
              <Button size="sm" variant="secondary" onClick={() => void bots.add(10)} title="Para ensayar sin celulares">
                <Bot className="size-4" /> Simular 10 estudiantes
              </Button>
            )}
          </div>
        </div>
        {showAbsent && (
          <SolidCard className="max-h-40 overflow-auto p-4 text-sm">
            <p className="mb-1 font-semibold">Aún no entraron:</p>
            <p className="text-ink-soft">{st.absent.join(' · ')}</p>
          </SolidCard>
        )}
        {playing.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <JaguarFace mood="neutral" className="w-40 drop-shadow-xl" />
            <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="font-display text-2xl font-bold text-ink-soft">
              Esperando a los primeros jugadores…
            </motion.p>
            <PawTrail />
          </div>
        ) : (
          <div className="flex flex-wrap content-start gap-3">
            <AnimatePresence>
              {playing.map((p) => (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: p.connected ? 1 : 0.5 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => onKick(p)}
                  title="Clic para retirar"
                  className="group flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-1.5 pr-4 font-display text-lg font-bold shadow-md hover:line-through"
                >
                  <AvatarBubble avatar={p.avatar} size="sm" />
                  {p.nickname}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

// ================================================================ pregunta / revelación
function QuestionStage({ st, secs, reveal, playing }: { st: HostState; secs: number | null; reveal: boolean; playing: number }) {
  const q = st.question!
  const s = st.session
  const d = st.distribution
  const total = q.time_limit_sec
  const maxCount = Math.max(1, ...Object.values(d?.by_option ?? {}))
  const choiceLike = q.type === 'single' || q.type === 'multiple' || q.type === 'true_false' || q.type === 'image_choice'
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full bg-uap-blue px-4 py-2 font-display text-lg font-bold text-white">
          Pregunta {(s.question_index ?? 0) + 1} de {s.total}
        </span>
        {q.base_points === 2000 && <span className="rounded-full bg-uap-gold px-4 py-2 font-display font-black text-uap-blue-900">¡Doble puntaje!</span>}
        {q.base_points === 0 && <span className="rounded-full bg-ink/10 px-4 py-2 font-display font-bold">Sin puntos</span>}
      </div>

      <h1 className="text-balance text-center font-display text-3xl font-black leading-tight drop-shadow-sm sm:text-5xl">{q.prompt}</h1>

      <div className="grid flex-1 items-center gap-6 lg:grid-cols-[160px_1fr_160px]">
        <div className="flex justify-center">{!reveal && secs !== null && <TimerRing secs={secs} total={total} />}</div>
        <div className="flex min-h-0 justify-center">
          {reveal && choiceLike ? (
            <Bars q={q} d={d} max={maxCount} />
          ) : reveal ? (
            <TextReveal q={q} d={d} />
          ) : q.image_url ? (
            <img src={q.image_url} alt="" className="max-h-[34vh] w-auto max-w-full rounded-3xl object-contain shadow-xl" />
          ) : q.type === 'short_text' ? (
            <p className="rounded-3xl bg-surface-2 px-8 py-6 font-display text-2xl font-bold text-ink-soft shadow">✍️ Escribe tu respuesta en tu dispositivo</p>
          ) : (
            <div />
          )}
        </div>
        <div className="flex justify-center">
          {!reveal && (
            <div className="text-center">
              <p className="font-display text-6xl font-black tabular-nums">{st.answered}</p>
              <p className="font-semibold text-ink-soft">de {playing} respondieron</p>
            </div>
          )}
        </div>
      </div>

      {/* Opciones */}
      {choiceLike && (
        <div className={cn('grid gap-3', q.type === 'image_choice' ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2')}>
          {q.options.map((o, i) => {
            const st0 = ANSWER_STYLES[styleIndex(q.type, i) % 4]
            return (
              <div
                key={o.key}
                className={cn(
                  'flex min-h-20 items-center gap-4 rounded-3xl p-4 shadow-lg transition-opacity',
                  st0.bg,
                  st0.text,
                  reveal && !o.is_correct && 'opacity-35',
                )}
                style={{ boxShadow: `0 6px 0 0 ${st0.edge}` } as CSSProperties}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/15">
                  <Shape shape={st0.shape} className="size-7" />
                </span>
                {o.image_url ? (
                  <img src={o.image_url} alt={`Opción ${i + 1}`} className="h-24 flex-1 rounded-2xl bg-white object-contain" />
                ) : (
                  <span className="flex-1 font-display text-2xl font-bold leading-snug">{o.text}</span>
                )}
                {reveal && o.is_correct && <CheckCircle2 className="size-9 shrink-0" />}
              </div>
            )
          })}
        </div>
      )}
      {q.type === 'ordering' && (
        <ol className="mx-auto grid w-full max-w-3xl gap-2">
          {(reveal ? [...q.options].sort((a, b) => (a.correct_position ?? 0) - (b.correct_position ?? 0)) : q.options).map((o, i) => {
            const st0 = ANSWER_STYLES[i % 4]
            return (
              <li key={o.key} className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 font-display text-xl font-bold shadow', st0.bg, st0.text)}>
                <span className="grid size-10 place-items-center rounded-xl bg-black/15">{reveal ? i + 1 : '•'}</span>
                {o.text}
              </li>
            )
          })}
        </ol>
      )}
      {reveal && q.explanation && (
        <p className="mx-auto max-w-3xl rounded-2xl bg-surface-2 px-5 py-3 text-center text-lg shadow">💡 {q.explanation}</p>
      )}
    </div>
  )
}

function TimerRing({ secs, total }: { secs: number; total: number }) {
  const r = 62
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, secs / Math.max(1, total)))
  const urgent = secs <= 5
  return (
    <div className="relative grid size-40 place-items-center">
      <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="var(--color-surface-2, #fff)" stroke="rgb(0 0 0 / 0.08)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={urgent ? '#FF3355' : '#1B7339'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <span className={cn('relative font-display text-6xl font-black tabular-nums', urgent && 'animate-pulse text-game-coral')}>{secs}</span>
    </div>
  )
}

function Bars({ q, d, max }: { q: NonNullable<HostState['question']>; d: HostState['distribution']; max: number }) {
  return (
    <div className="flex h-56 items-end justify-center gap-4 sm:gap-8">
      {q.options.map((o, i) => {
        const st0 = ANSWER_STYLES[styleIndex(q.type, i) % 4]
        const n = d?.by_option[o.key] ?? 0
        return (
          <div key={o.key} className="flex w-16 flex-col items-center gap-2 sm:w-24">
            <span className="font-display text-3xl font-black tabular-nums">{n}</span>
            <motion.div
              initial={{ height: 8 }}
              animate={{ height: 8 + (n / max) * 150 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className={cn('w-full rounded-t-2xl', st0.bg, !o.is_correct && 'opacity-40')}
            />
            <span className={cn('grid h-11 w-full place-items-center rounded-b-2xl', st0.bg, st0.text, !o.is_correct && 'opacity-40')}>
              {o.is_correct ? <CheckCircle2 className="size-6" /> : <Shape shape={st0.shape} className="size-5" />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TextReveal({ q, d }: { q: NonNullable<HostState['question']>; d: HostState['distribution'] }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {q.type === 'short_text' && (
        <p className="rounded-3xl bg-uap-green px-8 py-4 text-center font-display text-3xl font-black text-white shadow-xl">
          {(q.accepted_answers ?? []).slice(0, 3).join(' · ')}
        </p>
      )}
      <div className="flex gap-4">
        <Stat n={d?.correct ?? 0} label="Correctas" cls="bg-uap-green text-white" />
        {q.type === 'ordering' && <Stat n={d?.partial ?? 0} label="Casi" cls="bg-[#c98a00] text-white" />}
        <Stat n={d?.wrong ?? 0} label="Incorrectas" cls="bg-uap-red text-white" />
      </div>
    </div>
  )
}
const Stat = ({ n, label, cls }: { n: number; label: string; cls: string }) => (
  <div className={cn('rounded-3xl px-6 py-3 text-center shadow-lg', cls)}>
    <p className="font-display text-4xl font-black tabular-nums">{n}</p>
    <p className="text-sm font-semibold">{label}</p>
  </div>
)

// ================================================================ final
function Final({ st }: { st: HostState }) {
  const s = st.session
  const rows = [...st.participants].filter((p) => !p.kicked).sort((a, b) => b.score - a.score)
  const roster = s.identification === 'roster'
  async function exportExcel() {
    const head = ['Puesto', ...(roster ? ['RU', 'Apellidos y nombres'] : ['Apodo']), 'Puntaje', 'Aciertos', 'Nota (0-100)', 'Racha máx.', 'Cambios de pestaña']
    const data = [
      [titleCell(`${s.quiz_title} — ${s.subject?.code} Paralelo ${s.subject?.parallel}`)],
      [`Sesión del ${fmtDateTime(s.created_at)} · PIN ${s.pin} · ${s.total} preguntas`],
      [],
      head.map(headerCell),
      ...rows.map((p, i) => [
        i + 1,
        ...(roster ? [p.code ?? '', p.full_name ?? p.nickname] : [p.nickname]),
        p.score,
        `${p.correct_count}/${s.total}`,
        p.grade ?? 0,
        p.max_streak,
        p.tab_switch_count,
      ]),
    ]
    const sheets = [{ sheet: 'Resultados', data, columns: [{ width: 8 }, { width: 14 }, { width: 36 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 11 }, { width: 18 }], stickyRowsCount: 4 }]
    if (roster && st.absent.length) sheets.push({ sheet: 'Ausentes', data: [[headerCell('No participaron')], ...st.absent.map((a) => [a])], columns: [{ width: 40 }], stickyRowsCount: 1 })
    const blob = await buildWorkbook(sheets)
    downloadBlob(blob, `Resultados ${s.subject?.code ?? ''} ${s.quiz_title}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'))
  }
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex items-center gap-4">
        <JaguarFace mood="happy" className="w-24 drop-shadow-xl" />
        <h2 className="font-display text-4xl font-black drop-shadow">¡Felicidades!</h2>
      </div>
      {st.leaderboard.length > 0 ? <Podium rows={st.leaderboard} /> : <p className="text-ink-soft">Nadie participó en esta sesión.</p>}
      <SolidCard className="w-full max-w-5xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-xl font-bold">Resultados de la clase</h3>
            <p className="text-sm text-ink-soft">
              {rows.length} participantes{roster && st.absent.length ? ` · ${st.absent.length} ausentes` : ''} · la nota (0‑100) solo depende de los aciertos, no de la velocidad
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="success" onClick={() => void exportExcel()} disabled={!rows.length}>
              <Download className="size-4" /> Descargar Excel
            </Button>
            <Link to={`/admin/reportes/${s.id}`}>
              <Button variant="secondary">Ver reporte completo</Button>
            </Link>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">{roster ? 'Estudiante' : 'Apodo'}</th>
                <th className="px-4 py-2 text-right">Puntaje</th>
                <th className="px-4 py-2 text-right">Aciertos</th>
                <th className="px-4 py-2 text-right">Nota</th>
                <th className="px-4 py-2 text-right" title="Veces que salió de la pestaña durante una pregunta">Pestaña</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-2 font-bold">{i + 1}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <AvatarBubble avatar={p.avatar} size="sm" />
                      <span>
                        <span className="font-semibold">{roster ? (p.full_name ?? p.nickname) : p.nickname}</span>
                        {roster && <span className="block text-xs text-ink-soft">RU {p.code}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.score.toLocaleString('es-BO')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.correct_count}/{s.total}
                  </td>
                  <td className={cn('px-4 py-2 text-right font-display font-bold tabular-nums', (p.grade ?? 0) >= 51 ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral')}>
                    {p.grade ?? 0}
                  </td>
                  <td className={cn('px-4 py-2 text-right tabular-nums', p.tab_switch_count > 2 && 'font-bold text-game-coral')}>{p.tab_switch_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SolidCard>
    </div>
  )
}

// ================================================================ panel de participantes
function ParticipantsPanel({
  open,
  onClose,
  st,
  onKick,
  onAuthorize,
}: {
  open: boolean
  onClose: () => void
  st: HostState
  onKick: (p: HostParticipant) => void
  onAuthorize: (p: HostParticipant) => void
}) {
  const list = [...st.participants].sort((a, b) => Number(a.kicked) - Number(b.kicked) || b.score - a.score)
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label="Participantes"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="font-display text-xl font-bold">Participantes ({st.participants.filter((p) => !p.kicked).length})</h3>
              <button onClick={onClose} className="rounded-xl p-2 hover:bg-ink/5" aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </div>
            <ul className="flex-1 divide-y divide-line overflow-auto">
              {list.map((p) => (
                <li key={p.id} className={cn('flex items-center gap-3 px-5 py-2.5', p.kicked && 'opacity-40')}>
                  <span className={cn('size-2.5 shrink-0 rounded-full', p.connected ? 'bg-game-selva' : 'bg-ink/25')} title={p.connected ? 'Conectado' : 'Desconectado'} />
                  <AvatarBubble avatar={p.avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.full_name ?? p.nickname}</span>
                    <span className="block text-xs text-ink-soft">
                      {p.score.toLocaleString('es-BO')} pts{p.tab_switch_count ? ` · salió ${p.tab_switch_count}× de la pestaña` : ''}
                      {p.kicked ? ' · retirado' : ''}
                    </span>
                  </span>
                  {p.takeover_pending && (
                    <Button size="sm" variant="gold" onClick={() => onAuthorize(p)}>
                      Autorizar
                    </Button>
                  )}
                  {!p.kicked && (
                    <button onClick={() => onKick(p)} className="rounded-lg p-1.5 text-ink-soft hover:bg-uap-red/10 hover:text-uap-red" aria-label={`Retirar a ${p.nickname}`}>
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              ))}
              {!list.length && <li className="px-5 py-8 text-center text-ink-soft">Todavía no entró nadie.</li>}
            </ul>
            {st.session.identification === 'roster' && st.absent.length > 0 && (
              <div className="max-h-48 overflow-auto border-t border-line px-5 py-3 text-sm">
                <p className="font-semibold">Ausentes ({st.absent.length})</p>
                <p className="text-ink-soft">{st.absent.join(' · ')}</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ================================================================ utilidades
function Center({ children, inline }: { children: ReactNode; inline?: boolean }) {
  return <div className={cn('grid place-items-center', inline ? 'flex-1' : 'min-h-dvh')}>{children}</div>
}
function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="grid size-11 place-items-center rounded-2xl bg-surface-2 shadow-sm" aria-label={label} title={label}>
      {children}
    </button>
  )
}
