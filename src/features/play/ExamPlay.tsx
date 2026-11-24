import { useTimerSounds } from '../../lib/useTimerSounds'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CloudOff,
  Hash,
  Loader2,
  Lock,
  Maximize,
  PlayCircle,
  RefreshCw,
  Repeat,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card, SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import {
  EXAM_ERRORS,
  reportFocus,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type ExamAnswer,
  type ExamQuestion,
  type ExamState,
  type RevealData,
} from '../../lib/api/exam'
import { PLAY_ERRORS, serverOffset, type PlayError } from '../../lib/api/live'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'
import type { StudentResponse } from '../../lib/scoring'
import { haptic, sfx } from '../../lib/sound'
import { AvatarBubble } from '../live/LiveBits'
import { celebrate, fmtLeft, useServerNow } from '../live/clock'
import { QuestionView, type RevealInfo } from './QuestionView'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { JaguarEye } from '../../components/jaguar/JaguarFx'
import { activityState, type ActivityExamState, type ActivityReviewItem } from '../../lib/api/activities'
import { ActivityAttempt, ActivityReview } from '../activities/ActivityAttempt'
import { LeaveGuard } from '../../components/LeaveGuard'
import { QuickGuide } from '../activities/HowToPlay'
import { topicStyle } from '../../lib/topics'
import { ACTIVITY_META } from '../activities/types'

const pendKey = (attempt: string) => `yq-exam-pending-${attempt}`
function readPending(attempt: string): Record<string, StudentResponse> {
  try {
    return JSON.parse(localStorage.getItem(pendKey(attempt)) ?? '{}') as Record<string, StudentResponse>
  } catch {
    return {}
  }
}
function writePending(attempt: string, p: Record<string, StudentResponse>) {
  try {
    if (Object.keys(p).length) localStorage.setItem(pendKey(attempt), JSON.stringify(p))
    else localStorage.removeItem(pendKey(attempt))
  } catch {
    /* sin almacenamiento */
  }
}
const fsSupported = () => typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen

/** Examen de laboratorio o tarea: cada estudiante avanza a su ritmo. */
export function ExamPlay({ token, onLeave }: { token: string; onLeave: (message?: string) => void }) {
  const toast = useToast()
  const [st, setSt] = useState<ActivityExamState | null>(null)
  const [offset, setOffset] = useState(0)
  const [offline, setOffline] = useState(false)
  const busy = useRef(false)

  const apply = useCallback(
    (s: ActivityExamState | ExamState | PlayError, t0: number) => {
      if (!s.ok) {
        if (s.error === 'token' || s.error === 'kicked') return onLeave(PLAY_ERRORS[s.error])
        toast.error(EXAM_ERRORS[s.error] ?? PLAY_ERRORS[s.error] ?? 'No se pudo completar')
        return
      }
      setOffset(serverOffset(s.server_now, t0))
      setSt(s as ActivityExamState)
      setOffline(false)
    },
    [onLeave, toast],
  )
  const refresh = useCallback(async () => {
    const t0 = Date.now()
    try {
      apply(await activityState(token), t0)
    } catch {
      setOffline(true)
    }
  }, [token, apply])

  const inAttempt = !!st?.current
  const notOpen = st?.session.window === 'not_open'
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), inAttempt ? 15000 : notOpen ? 5000 : 20000)
    return () => clearInterval(t)
  }, [refresh, inAttempt, notOpen])
  const now = useServerNow(offset, true, 500)

  async function run(fn: () => Promise<ActivityExamState | ExamState | PlayError>) {
    if (busy.current) return
    busy.current = true
    const t0 = Date.now()
    try {
      apply(await fn(), t0)
    } catch {
      setOffline(true)
      toast.error('Sin conexión', 'Revisa el internet e inténtalo de nuevo.')
    } finally {
      busy.current = false
    }
  }

  async function begin() {
    if (st?.session.focus_mode && fsSupported() && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => null)
    }
    await run(async () => {
      const r = await startAttempt(token)
      // las actividades necesitan el tablero (activity_state); las evaluaciones normales ya vienen completas
      return r.ok && st?.activity_type ? activityState(token) : r
    })
    sfx.go()
  }

  if (!st) return <Loader2 className="size-10 animate-spin text-uap-green" aria-label="Cargando" />
  if (st.activity_type && st.current?.activity) return <ActivityAttempt key={st.current.id} st={st} token={token} now={now} onState={apply} />
  if (st.current) return <Attempt key={st.current.id} st={st as ExamState} token={token} now={now} offline={offline} setOffline={setOffline} onState={apply} refresh={refresh} />
  return <Home st={st} now={now} onStart={() => void begin()} offline={offline} />
}

// ================================================================ inicio / resultados
function Home({ st, now, onStart, offline }: { st: ActivityExamState; now: number; onStart: () => void; offline: boolean }) {
  const s = st.session
  const act = st.activity_type ? ACTIVITY_META[st.activity_type] : null
  const last = st.attempts[st.attempts.length - 1]
  const justFinished = useRef(false)
  const [fresh] = useState(() => !!last && Date.now() - new Date(last.submitted_at).getTime() < 15000)
  useEffect(() => {
    if (last && !justFinished.current && Date.now() - new Date(last.submitted_at).getTime() < 15000) {
      justFinished.current = true
      const g = last.grade !== null ? Number(last.grade) : null
      // la celebración llega cuando terminan de llenarse las estrellas y de subir la nota
      const t = window.setTimeout(() => {
        if (g === null) return sfx.sent()
        if (g >= s.pass_mark) {
          sfx.fanfare()
          haptic([40, 60, 40])
          celebrate(g >= 90)
          if (g >= 90) window.setTimeout(() => sfx.applause(2.5), 900)
        } else sfx.encourage()
      }, act ? 1500 : 900)
      return () => window.clearTimeout(t)
    }
  }, [last, s.pass_mark, act])
  const opensIn = s.opens_at ? new Date(s.opens_at).getTime() - now : 0
  const closesIn = s.closes_at ? new Date(s.closes_at).getTime() - now : null
  const pass = st.best_grade !== null && Number(st.best_grade) >= s.pass_mark

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="w-full">
        <p className="text-center text-xs font-bold uppercase tracking-wider text-ink-soft">
          {act ? `${s.mode === 'exam' ? 'Examen' : 'Actividad'}: ${act.label}` : s.mode === 'exam' ? 'Examen' : 'Tarea / práctica'} · {s.subject}
        </p>
        <h1 className="text-center font-display text-3xl font-black leading-tight">{s.quiz_title}</h1>
        <div className="mx-auto mt-2 flex items-center justify-center gap-2 text-ink-soft">
          <AvatarBubble avatar={st.me.avatar} size="sm" />
          <span className="font-semibold">{st.me.nickname}</span>
        </div>

        {last ? (
          <div className="mt-5 rounded-3xl bg-ink/5 p-5 text-center">
            {s.show_grade && st.best_grade !== null ? (
              <>
                <motion.div initial={fresh ? { scale: 0.4, rotate: -12, opacity: 0 } : false} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
                  <motion.div animate={fresh && pass ? { y: [0, -10, 0] } : undefined} transition={{ delay: 1.6, duration: 0.6, repeat: 2 }}>
                    <JaguarFace mood={pass ? 'happy' : 'neutral'} className="mx-auto mb-1 w-24" />
                  </motion.div>
                </motion.div>
                {act && <ResultStars grade={Number(st.best_grade)} fresh={fresh} />}
                <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">{st.attempts.length > 1 ? 'Tu mejor nota' : 'Tu nota'}</p>
                <p className={cn('font-display text-7xl font-black tabular-nums', pass ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral')}>
                  <CountUp to={Math.round(Number(st.best_grade))} run={fresh} />
                  <span className="text-2xl text-ink-soft">/100</span>
                </p>
                <motion.p initial={fresh ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: fresh ? 1.4 : 0 }} className="font-semibold">
                  {pass ? '¡Aprobado! 🎉' : `Necesitas ${s.pass_mark} para aprobar`}
                </motion.p>
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto size-12 text-uap-green" />
                <p className="mt-2 font-display text-2xl font-black">¡Entregado!</p>
                <p className="text-ink-soft">Tu docente publicará la nota.</p>
              </>
            )}
            {st.attempts.length > 0 && (
              <ul className="mx-auto mt-4 flex max-w-sm flex-col gap-1 text-left text-sm">
                {st.attempts.map((a) => (
                  <li key={a.number} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                    <span>
                      Intento {a.number} · {fmtDateTime(a.submitted_at)}
                      {a.reason === 'time' && ' · se acabó el tiempo'}
                      {a.reason === 'closed' && ' · cierre'}
                    </span>
                    {a.grade !== null && (
                      <span className="font-display font-black tabular-nums">
                        {Math.round(Number(a.grade))} · {a.correct}/{a.questions}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Info icon={<Hash className="size-4" />} label={act ? 'Palabras' : 'Preguntas'} value={String(s.question_count)} />
          <Info icon={<Clock className="size-4" />} label="Tiempo" value={s.time_limit_sec ? `${Math.round(s.time_limit_sec / 60)} min` : 'Libre'} />
          <Info icon={<Repeat className="size-4" />} label="Intentos" value={`${st.attempts_left} de ${s.max_attempts}`} />
          <Info icon={<CalendarClock className="size-4" />} label="Cierra" value={s.closes_at ? fmtDateTime(s.closes_at) : 'Sin cierre'} />
        </div>

        {st.can_start && (
          <>
            <ul className="mt-5 flex flex-col gap-2 text-sm">
              {s.time_limit_sec && (
                <Rule icon={<Clock className="size-4" />}>
                  Tienes <strong>{Math.round(s.time_limit_sec / 60)} {Math.round(s.time_limit_sec / 60) === 1 ? 'minuto' : 'minutos'}</strong> desde que presiones “{act ? 'Empezar a jugar' : 'Comenzar'}”. Al terminar el tiempo se entrega solo.
                </Rule>
              )}
              {act ? (
                <Rule icon={<ClipboardCheck className="size-4" />}>Cada jugada se corrige al instante y tu avance queda guardado aunque recargues o se corte el internet.</Rule>
              ) : (
                <>
                  <Rule icon={<ClipboardCheck className="size-4" />}>Cada respuesta se guarda al instante. Si se corta el internet o recargas, sigues donde te quedaste.</Rule>
                  <Rule icon={<ShieldCheck className="size-4" />}>No se puede copiar ni pegar texto.</Rule>
                </>
              )}
              {!s.focus_mode && (
                <Rule icon={<AlertTriangle className="size-4" />}>
                  No salgas de esta ventana mientras {act ? 'juegas' : 'respondes'}: cada salida queda registrada, tu docente la ve y <strong>puede ser penalizada</strong>.
                </Rule>
              )}
              {s.focus_mode && (
                <Rule icon={<JaguarEye icon className="w-7" />}>
                  Se abrirá en <strong>pantalla completa</strong>. Cada vez que salgas de la pestaña o ventana queda registrado y puede ser penalizado
                  {s.lock_after ? <> y a las <strong>{s.lock_after} salidas</strong> se bloquea</> : null}.
                </Rule>
              )}
            </ul>
            {st.activity_type && (
              <div className="mt-5 rounded-3xl bg-uap-blue/5 p-3 ring-1 ring-uap-blue/15 sm:p-4">
                <QuickGuide type={st.activity_type} />
              </div>
            )}
            <div className="sticky bottom-2 z-10 mt-6">
              <Button size="xl" variant="success" className="w-full shadow-xl" onClick={onStart} disabled={offline}>
                {act ? <PlayCircle className="size-6" /> : <BookOpenCheck className="size-6" />}
                {act
                  ? st.attempts.length
                    ? `Jugar de nuevo (intento ${st.attempts.length + 1})`
                    : 'Empezar a jugar'
                  : st.attempts.length
                    ? `Comenzar intento ${st.attempts.length + 1}`
                    : 'Comenzar'}
              </Button>
            </div>
          </>
        )}
        {!st.can_start && s.window === 'not_open' && (
          <div className="mt-6 rounded-3xl bg-uap-gold/15 p-5 text-center">
            <p className="font-semibold text-ink-soft">Se abre en</p>
            <p className="font-display text-5xl font-black tabular-nums">{fmtLeft(opensIn)}</p>
            <p className="text-sm text-ink-soft">{s.opens_at && fmtDateTime(s.opens_at)} · esta pantalla se actualiza sola</p>
          </div>
        )}
        {!st.can_start && s.window === 'closed' && !last && <p className="mt-6 text-center font-semibold text-ink-soft">La actividad ya se cerró.</p>}
        {!st.can_start && s.window === 'open' && last && st.attempts_left === 0 && (
          <p className="mt-6 text-center text-ink-soft">Ya usaste todos tus intentos.</p>
        )}
        {s.window === 'open' && closesIn !== null && closesIn < 3600000 && st.can_start && (
          <p className="mt-3 text-center text-sm font-semibold text-game-coral">La actividad cierra en {fmtLeft(closesIn)}</p>
        )}
      </Card>

      {st.review ? (
        st.activity_type ? <ActivityReview items={st.review as ActivityReviewItem[]} type={st.activity_type} /> : <Review items={st.review as NonNullable<ExamState['review']>} />
      ) : (
        last &&
        s.show_correct !== 'never' && (
          <p className="text-center text-sm text-ink-soft">
            {s.show_correct === 'after_close' ? `Podrás ver las respuestas correctas cuando cierre la actividad${s.closes_at ? ` (${fmtDateTime(s.closes_at)})` : ''}.` : ''}
          </p>
        )
      )}
      <Link to="/" className="self-center">
        <Button variant="secondary">
          <ArrowLeft className="size-4" /> Volver al inicio
        </Button>
      </Link>
    </div>
  )
}

/** Estrellas del resultado de una actividad: ★ desde 50, ★★ desde 75 y ★★★ desde 90. */
function ResultStars({ grade, fresh }: { grade: number; fresh?: boolean }) {
  const n = grade >= 90 ? 3 : grade >= 75 ? 2 : grade >= 50 ? 1 : 0
  const msg = ['¡Sigue practicando! Puedes mejorar tu nota con otro intento.', '¡Bien! Vas por buen camino.', '¡Muy bien! Casi perfecto.', '¡Excelente! Dominas el tema. 🏆'][n]
  // cada estrella ganada suena al aparecer (solo al terminar, no al volver a ver la nota)
  useEffect(() => {
    if (!fresh) return
    const ts = Array.from({ length: n }, (_, i) => window.setTimeout(() => sfx.star(i + 1), 350 + i * 320))
    return () => ts.forEach((t) => window.clearTimeout(t))
  }, [fresh, n])
  return (
    <div className="mb-2 flex flex-col items-center gap-1" aria-label={`${n} de 3 estrellas`}>
      <div className="flex items-end gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative">
            <span className={cn('text-5xl leading-none text-ink/15', i === 1 && 'text-6xl')}>★</span>
            {i < n && (
              <motion.span
                initial={fresh ? { scale: 0, rotate: -40, opacity: 0 } : false}
                animate={{ scale: [0, 1.45, 1], rotate: 0, opacity: 1 }}
                transition={{ delay: 0.35 + i * 0.32, duration: 0.45 }}
                className={cn('absolute inset-0 text-5xl leading-none text-uap-gold drop-shadow-[0_0_10px_rgba(201,162,58,.7)]', i === 1 && 'text-6xl')}
              >
                ★
              </motion.span>
            )}
            {fresh && i < n && (
              <motion.span
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ delay: 0.45 + i * 0.32, duration: 0.6 }}
                className="pointer-events-none absolute inset-0 rounded-full border-4 border-uap-gold"
                aria-hidden
              />
            )}
          </span>
        ))}
      </div>
      <motion.p initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: fresh ? 0.4 + n * 0.32 : 0 }} className="font-display text-sm font-black">
        {msg}
      </motion.p>
    </div>
  )
}

/** Número que sube desde 0 (con un tic suave) cuando la nota es recién obtenida. */
function CountUp({ to, run }: { to: number; run?: boolean }) {
  const mv = useMotionValue(run ? 0 : to)
  const txt = useTransform(mv, (v) => String(Math.round(v)))
  useEffect(() => {
    if (!run) return mv.set(to)
    let lastTen = -1
    const c = animate(mv, to, {
      duration: Math.min(1.4, 0.4 + to / 90),
      ease: 'easeOut',
      onUpdate: (v) => {
        const k = Math.floor(v / 10)
        if (k !== lastTen) {
          lastTen = k
          sfx.tap()
        }
      },
    })
    return () => c.stop()
  }, [to, run, mv])
  return <motion.span>{txt}</motion.span>
}

const Info = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="rounded-2xl bg-ink/5 px-3 py-2 text-center">
    <p className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
      {icon} {label}
    </p>
    <p className="font-display font-black">{value}</p>
  </div>
)
const Rule = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <li className="flex items-start gap-2 rounded-2xl bg-uap-green/5 px-3 py-2">
    <span className="mt-0.5 text-uap-green dark:text-game-selva">{icon}</span>
    <span>{children}</span>
  </li>
)

function describe(q: ExamQuestion, r: StudentResponse | null | undefined) {
  if (!r) return 'Sin responder'
  const t = (k: string) => q.options.find((o) => o.key === k)?.text || 'imagen'
  if (r.kind === 'choice') return t(r.key)
  if (r.kind === 'choices') return r.keys.map(t).join(', ')
  if (r.kind === 'text') return r.text
  return r.keys.map(t).join(' → ')
}
function correctText(q: ExamQuestion, rv: RevealData) {
  const t = (k: string) => q.options.find((o) => o.key === k)?.text || 'imagen'
  if (q.type === 'short_text') return (rv.accepted_answers ?? []).slice(0, 3).join(' / ')
  if (q.type === 'ordering') return (rv.correct_order ?? []).map(t).join(' → ')
  return rv.correct_keys.map(t).join(', ')
}

function Review({ items }: { items: NonNullable<ExamState['review']> }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-black">Revisión de tus respuestas</h2>
      {items.map((it, i) => (
        <SolidCard key={it.question.id} className={cn('border-l-8 p-4', it.correct ? 'border-l-uap-green' : it.partial > 0 ? 'border-l-[#c98a00]' : 'border-l-uap-red')}>
          <p className="flex items-start gap-2 font-display font-bold">
            {it.correct ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-uap-green" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-uap-red" />}
            {i + 1}. {it.question.prompt}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-ink-soft">Tu respuesta: </span>
            <span className="font-semibold">{describe(it.question, it.response)}</span>
            {!it.correct && it.partial > 0 && <span className="ml-1 text-[#9a6a00]">({Math.round(it.partial * 100)}%)</span>}
          </p>
          {!it.correct && (
            <p className="text-sm">
              <span className="text-ink-soft">Correcta: </span>
              <span className="font-semibold text-uap-green dark:text-game-selva">{correctText(it.question, it.reveal)}</span>
            </p>
          )}
          {it.reveal.explanation && <p className="mt-1 text-sm text-ink-soft">💡 {it.reveal.explanation}</p>}
        </SolidCard>
      ))}
    </div>
  )
}

// ================================================================ intento en curso
function Attempt({
  st,
  token,
  now,
  offline,
  setOffline,
  onState,
  refresh,
}: {
  st: ExamState
  token: string
  now: number
  offline: boolean
  setOffline: (v: boolean) => void
  onState: (s: ExamState | PlayError, t0: number) => void
  refresh: () => Promise<void>
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const cur = st.current!
  const s = st.session
  const practice = s.show_correct === 'each'
  const [idx, setIdx] = useState(() => {
    const first = cur.questions.findIndex((q) => !cur.answers[q.id])
    return first < 0 ? 0 : first
  })
  const [local, setLocal] = useState<Record<string, ExamAnswer>>({})
  const [pending, setPending] = useState<Record<string, StudentResponse>>(() => readPending(cur.id))
  const [locked, setLocked] = useState(cur.locked)
  const [needFs, setNeedFs] = useState(false)
  const [losses, setLosses] = useState(cur.focus_losses)
  const submitting = useRef(false)

  useEffect(() => setLocked(cur.locked), [cur.locked])
  const answers = useMemo(() => {
    const m: Record<string, ExamAnswer> = { ...cur.answers, ...local }
    for (const [k, r] of Object.entries(pending)) m[k] = { ...m[k], response: r }
    return m
  }, [cur.answers, local, pending])
  const answered = cur.questions.filter((q) => answers[q.id]).length
  const q = cur.questions[idx]
  const deadline = cur.deadline ? new Date(cur.deadline).getTime() : null
  const left = deadline !== null ? deadline - now : null
  useTimerSounds(left, (t) => toast.info(t, 'Revisa las preguntas que te faltan.', true))

  // ---------------------------------------------------------- guardar (con cola local si no hay internet)
  const flushing = useRef(false)
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      let p = readPending(cur.id)
      for (const [qid, r] of Object.entries(p)) {
        let res
        try {
          res = await saveAnswer(token, qid, r)
        } catch {
          setOffline(true)
          return
        }
        setOffline(false)
        if (res.ok || res.error === 'not_in_attempt' || res.error === 'already') {
          // la respuesta confirmada queda marcada en pantalla (no espera a la próxima actualización)
          if (res.ok) setLocal((m) => ({ ...m, [qid]: { ...m[qid], response: r } }))
          p = readPending(cur.id)
          if (JSON.stringify(p[qid]) === JSON.stringify(r)) delete p[qid]
          writePending(cur.id, p)
          setPending({ ...p })
        } else if (res.error === 'locked') {
          setLocked(true)
          return
        } else {
          // se acabó el tiempo / ya no hay intento: se recarga el estado (muestra el resultado)
          writePending(cur.id, {})
          setPending({})
          toast.info(EXAM_ERRORS[res.error] ?? 'Tu examen ya fue entregado')
          void refresh()
          return
        }
      }
    } finally {
      flushing.current = false
    }
  }, [cur.id, token, setOffline, toast, refresh])
  useEffect(() => {
    const t = setInterval(() => {
      if (Object.keys(readPending(cur.id)).length) void flush()
    }, 4000)
    const online = () => void flush()
    window.addEventListener('online', online)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', online)
    }
  }, [cur.id, flush])

  async function answer(r: StudentResponse) {
    if (locked) return
    if (practice) {
      if (answers[q.id]) return
      try {
        const res = await saveAnswer(token, q.id, r)
        if (!res.ok) return toast.error(EXAM_ERRORS[res.error] ?? 'No se pudo guardar')
        setLocal((m) => ({ ...m, [q.id]: { response: r, correct: res.correct, partial: res.partial, points: res.points, reveal: res.reveal } }))
        if (res.correct) sfx.correct()
        else sfx.wrong()
      } catch {
        toast.error('Sin conexión', 'Tu respuesta no llegó. Vuelve a intentarlo.')
      }
      return
    }
    const p = { ...readPending(cur.id), [q.id]: r }
    writePending(cur.id, p)
    setPending(p)
    sfx.sent()
    void flush()
    // en opción única se avanza solo a la siguiente pregunta sin responder
    // (si el estudiante ya navegó por su cuenta, no se vuelve a avanzar)
    const from = idx
    if (r.kind === 'choice' && idx < cur.questions.length - 1) setTimeout(() => setIdx((i) => (i === from ? i + 1 : i)), 350)
  }

  // ---------------------------------------------------------- entregar
  const finish = useCallback(
    async (auto: boolean) => {
      if (submitting.current) return
      submitting.current = true
      await flush()
      const t0 = Date.now()
      try {
        const r = await submitAttempt(token)
        if (auto) {
          sfx.timeUp()
          toast.info('Se acabó el tiempo', 'Tu examen se entregó con lo que respondiste.')
        }
        onState(r, t0)
      } catch {
        setOffline(true)
        submitting.current = false
      }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => null)
    },
    [flush, token, toast, onState, setOffline],
  )
  useEffect(() => {
    if (left !== null && left <= 0) void finish(true)
  }, [left, finish])

  async function askFinish() {
    const missing = cur.questions.length - answered
    const nums = cur.questions.map((x, i) => (answers[x.id] ? null : i + 1)).filter((n): n is number => n !== null)
    const ok = await confirm({
      title: '¿Entregar ahora?',
      message: missing ? (
        <span className="flex flex-col gap-2">
          <span>
            Te falta{missing === 1 ? '' : 'n'} <b>{missing}</b> pregunta{missing === 1 ? '' : 's'} por responder:
          </span>
          <span className="flex flex-wrap gap-1">
            {nums.map((n) => (
              <span key={n} className="grid size-8 place-items-center rounded-lg bg-uap-red/10 font-display text-sm font-black text-uap-red">
                {n}
              </span>
            ))}
          </span>
          <span>Las que no respondas cuentan 0. Después de entregar ya no podrás cambiar nada.</span>
        </span>
      ) : (
        '¡Respondiste todas! 🎉 Después de entregar ya no podrás cambiar nada.'
      ),
      confirmText: 'Entregar',
      danger: missing > 0,
    })
    if (ok) void finish(false)
  }

  // ---------------------------------------------------------- modo enfoque
  // cambiar de pestaña o de app lo registra <LeaveGuard>; aquí solo la pantalla completa
  useEffect(() => {
    if (!s.focus_mode) return
    const onFs = () => {
      if (fsSupported() && !document.fullscreenElement) {
        setNeedFs(true)
        if (document.visibilityState === 'visible')
          void reportFocus(token, 'tab').then((r) => {
            if (r.locked) setLocked(true)
            if (r.focus_losses !== undefined) setLosses(r.focus_losses)
          })
      } else setNeedFs(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    if (fsSupported() && !document.fullscreenElement) setNeedFs(true)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [s.focus_mode, token])

  // mientras está bloqueado se consulta seguido para saber cuándo lo habilita el docente
  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [locked, refresh])

  const block = (e: React.SyntheticEvent) => e.preventDefault()
  const qa = answers[q.id]
  const reveal: RevealInfo | null =
    practice && qa?.reveal
      ? {
          correct: !!qa.correct,
          partial: Number(qa.partial ?? 0),
          points: qa.points,
          correctKeys: qa.reveal.correct_keys ?? [],
          correctOrder: qa.reveal.correct_order ?? undefined,
          acceptedAnswers: qa.reveal.accepted_answers ?? undefined,
          explanation: qa.reveal.explanation,
        }
      : null
  const nPending = Object.keys(pending).length

  return (
    <div className="flex w-full flex-col gap-3 select-none" onCopy={block} onCut={block} onContextMenu={block} onDragStart={block}>
      <LeaveGuard
        token={token}
        active={!locked}
        what="el examen"
        lockAfter={s.lock_after}
        timed={left !== null}
        onReport={(r) => {
          if (r.locked) setLocked(true)
          if (r.focus_losses !== undefined) setLosses(r.focus_losses)
        }}
      />
      {/* Barra superior */}
      <div className="glass sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-2">
        <span className="font-display font-bold">
          {answered}/{cur.questions.length} <span className="text-sm font-semibold text-ink-soft">respondidas</span>
        </span>
        <span className={cn('flex items-center gap-1 text-sm font-semibold', offline || nPending ? 'text-[#9a6a00]' : 'text-uap-green dark:text-game-selva')}>
          {offline ? <CloudOff className="size-4" /> : nPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {offline ? 'Sin internet: se guarda en este equipo' : nPending ? 'Guardando…' : 'Guardado'}
        </span>
        {losses > 0 && (
          <span className="flex items-center gap-1 text-sm font-semibold text-game-coral">
            <AlertTriangle className="size-4" /> {losses} salida{losses === 1 ? '' : 's'}
            {s.lock_after ? ` de ${s.lock_after}` : ''}
          </span>
        )}
        <span className="flex-1" />
        {left !== null && (
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-2xl px-3 py-1.5 font-display text-xl font-black tabular-nums',
              left < 60000 ? 'animate-pulse bg-game-coral text-white' : left < 300000 ? 'bg-uap-gold text-uap-blue-900' : 'bg-uap-blue text-white',
            )}
            aria-label="Tiempo restante"
          >
            <Clock className="size-5" /> {fmtLeft(left)}
          </span>
        )}
      </div>

      {/* Avance: el jaguar corre a medida que responde */}
      <div className="relative px-4 pt-3" aria-label={`Avance: ${answered} de ${cur.questions.length} respondidas`}>
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-uap-green via-game-selva to-uap-gold" animate={{ width: `${(100 * answered) / cur.questions.length}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
        </div>
        <motion.div
          className="pointer-events-none absolute top-0 w-9 -translate-x-1/2"
          animate={{ left: `calc(1rem + (100% - 2rem) * ${answered / cur.questions.length})` }}
          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          aria-hidden
        >
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity }}>
            <JaguarFace mood={answered === cur.questions.length ? 'happy' : 'neutral'} className="w-9 drop-shadow" />
          </motion.div>
        </motion.div>
      </div>

      {/* Navegación por número: la franja de color es el tema de la pregunta */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Preguntas">
        {cur.questions.map((x, i) => {
          const t = topicStyle(x.topic)
          return (
            <button
              key={x.id}
              onClick={() => setIdx(i)}
              aria-label={`Pregunta ${i + 1}${t ? `, ${t.code}` : ''}${answers[x.id] ? ' (respondida)' : ''}`}
              aria-current={i === idx}
              title={t ? `${t.code} · ${t.label}` : undefined}
              style={t && !answers[x.id] ? { boxShadow: `inset 0 -4px 0 ${t.color}` } : undefined}
              className={cn(
                'grid size-9 place-items-center rounded-xl font-display text-sm font-bold transition',
                answers[x.id] ? 'bg-uap-green text-white' : 'bg-surface-2 text-ink-soft',
                i === idx && 'scale-110 ring-4 ring-uap-gold',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </nav>

      <SolidCard className="p-4 sm:p-6">
        <motion.div key={q.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <QuestionView
            key={q.id}
            q={q}
            index={idx}
            total={cur.questions.length}
            onSubmit={(r) => void answer(r)}
            submitted={practice ? !!qa : false}
            editable={!practice}
            response={qa?.response ?? null}
            reveal={reveal}
            onPaste={() => {
              void reportFocus(token, 'paste')
              toast.error('No se puede pegar texto', 'Escribe tu respuesta con tus palabras.')
            }}
          />
        </motion.div>
      </SolidCard>

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          <ArrowLeft className="size-5" /> Anterior
        </Button>
        {idx < cur.questions.length - 1 ? (
          <Button onClick={() => setIdx((i) => i + 1)}>
            Siguiente <ArrowRight className="size-5" />
          </Button>
        ) : (
          <Button variant="success" onClick={() => void askFinish()}>
            <ClipboardCheck className="size-5" /> Revisar y entregar
          </Button>
        )}
      </div>
      {idx < cur.questions.length - 1 && answered === cur.questions.length && (
        <Button variant="success" className="self-center" onClick={() => void askFinish()}>
          <ClipboardCheck className="size-5" /> Ya respondí todo: entregar
        </Button>
      )}

      {locked && (
        <Overlay>
          <div className="mx-auto w-fit rounded-3xl bg-[#fbf6ec] p-3 shadow-2xl"><JaguarEye className="w-56" /></div>
          <p className="mt-3 flex items-center justify-center gap-2 font-display text-3xl font-black">
            <Lock className="size-7" /> Examen bloqueado
          </p>
          <p className="mt-1 text-white/85">Saliste de la pestaña {losses} veces. Tus respuestas están guardadas.</p>
          <p className="text-white/85">Pide al docente que te habilite desde su monitor.</p>
          <Loader2 className="mx-auto mt-4 size-6 animate-spin" />
        </Overlay>
      )}
      {!locked && needFs && (
        <Overlay>
          <div className="mx-auto w-fit rounded-3xl bg-[#fbf6ec] p-3 shadow-2xl"><JaguarEye className="w-52" /></div>
          <p className="mt-3 font-display text-3xl font-black">Vuelve a pantalla completa</p>
          <p className="text-white/85">El jaguar te está mirando 👀</p>
          <p className="mt-1 text-white/85">Este examen se responde en pantalla completa. Salir queda registrado.</p>
          <Button size="xl" variant="gold" className="mt-5" onClick={() => void document.documentElement.requestFullscreen().catch(() => null)}>
            <Maximize className="size-6" /> Continuar el examen
          </Button>
        </Overlay>
      )}
    </div>
  )
}

const Overlay = ({ children }: { children: ReactNode }) => (
  <div className="fixed inset-0 z-40 grid place-items-center bg-uap-blue-900/90 p-6 text-center text-white backdrop-blur-sm">
    <div>{children}</div>
  </div>
)
