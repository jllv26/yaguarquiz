import { motion } from 'framer-motion'
import { ArrowLeft, Clock, Flame, Loader2, Pause, RefreshCw, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { presentationInfo } from '../../lib/api/presentations'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { SoundControl, useMuteHotkey, useSoundPrefs } from '../../components/SoundControl'
import { Button } from '../../components/ui/Button'
import { Card, SolidCard } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import {
  getState,
  PLAY_ERRORS,
  reportEvent,
  serverOffset,
  sessionInfo,
  submitAnswer,
  useNudgeChannel,
  useSessionTheme,
  type PlayState,
} from '../../lib/api/live'
import { cn } from '../../lib/cn'
import type { StudentResponse } from '../../lib/scoring'
import { setMusic, sfx } from '../../lib/sound'
import { useForcedDark } from '../../lib/visualThemes'
import { AvatarBubble, BigCountdown, Leaderboard } from '../live/LiveBits'
import { celebrate, COUNTDOWN_MS, secondsLeft, useServerNow } from '../live/clock'
import { ExamPlay } from './ExamPlay'
import { JoinFlow } from './JoinFlow'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { ClawSwipe, PawTrail } from '../../components/jaguar/JaguarFx'
import { QuestionView, type RevealInfo } from './QuestionView'

type PlayMode = 'live' | 'exam' | 'homework'
const tokenKey = (pin: string) => `yq-play-${pin}`
/** Se guarda {t, m}; las fichas antiguas (solo texto) son del modo en vivo. */
const readToken = (pin: string): { t: string; m: PlayMode } | null => {
  try {
    const raw = localStorage.getItem(tokenKey(pin))
    if (!raw) return null
    if (raw.startsWith('{')) return JSON.parse(raw) as { t: string; m: PlayMode }
    return { t: raw, m: 'live' }
  } catch {
    return null
  }
}
const saveToken = (pin: string, v: { t: string; m: PlayMode } | null) => {
  try {
    if (v) localStorage.setItem(tokenKey(pin), JSON.stringify(v))
    else localStorage.removeItem(tokenKey(pin))
  } catch {
    /* sin almacenamiento */
  }
}

type Screen =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retry?: boolean }
  | { kind: 'join'; info: { mode: PlayMode; identification: 'roster' | 'nickname'; require_ci: boolean; quiz_title: string; subject: string } }
  | { kind: 'game' }

export function PlayPage() {
  const { pin = '' } = useParams()
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const navigate = useNavigate()
  const [token, setToken] = useState<{ t: string; m: PlayMode } | null>(() => readToken(pin))
  const theme = useSessionTheme({ pin: /^\d{6}$/.test(pin) ? pin : undefined })
  useForcedDark(theme)

  const openJoin = useCallback(async () => {
    setScreen({ kind: 'loading' })
    try {
      const info = await sessionInfo(pin)
      if (!info.ok && info.error === 'pin') {
        // ¿es el PIN de una exposición?
        const ex = await presentationInfo(pin).catch(() => null)
        if (ex?.ok) return navigate(`/expo/${pin}`, { replace: true })
      }
      if (!info.ok) return setScreen({ kind: 'error', message: PLAY_ERRORS[info.error] ?? 'No se pudo abrir la sesión.' })
      setScreen({ kind: 'join', info })
    } catch {
      setScreen({ kind: 'error', message: 'Sin conexión a internet. Revisa el wifi e intenta de nuevo.', retry: true })
    }
  }, [pin, navigate])

  useEffect(() => {
    if (!/^\d{6}$/.test(pin)) {
      setScreen({ kind: 'error', message: 'El PIN debe tener 6 números.' })
      return
    }
    // solo al abrir la página: si ya tenía una partida en este PIN, se reconecta
    if (readToken(pin)) setScreen({ kind: 'game' })
    else void openJoin()
  }, [pin, openJoin])

  const leave = useCallback(
    (message?: string) => {
      saveToken(pin, null)
      setToken(null)
      if (message) setScreen({ kind: 'error', message })
    },
    [pin],
  )

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground theme={theme} />
      <TopBar right={<SoundControl role="student" />} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pb-6">
        {screen.kind === 'loading' && <Loader2 className="size-10 animate-spin text-uap-green" aria-label="Cargando" />}
        {screen.kind === 'error' && (
          <Card className="w-full max-w-md text-center">
            <WifiOff className="mx-auto mb-3 size-12 text-uap-red" />
            <p className="font-display text-xl font-bold">{screen.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link to="/">
                <Button variant="secondary">
                  <ArrowLeft className="size-4" /> Cambiar PIN
                </Button>
              </Link>
              {(screen.retry || !token) && (
                <Button onClick={() => void openJoin()}>
                  <RefreshCw className="size-4" /> Reintentar
                </Button>
              )}
            </div>
          </Card>
        )}
        {screen.kind === 'join' && (
          <JoinFlow
            pin={pin}
            info={screen.info}
            onJoined={(t) => {
              const v = { t, m: screen.info.mode ?? 'live' }
              saveToken(pin, v)
              setToken(v)
              setScreen({ kind: 'game' })
              sfx.join()
            }}
          />
        )}
        {screen.kind === 'game' && token && (token.m === 'live' ? <Game token={token.t} onLeave={leave} /> : <ExamPlay token={token.t} onLeave={leave} />)}
      </main>
    </div>
  )
}

// ================================================================ juego
function Game({ token, onLeave }: { token: string; onLeave: (message?: string) => void }) {
  const toast = useToast()
  const [st, setSt] = useState<PlayState | null>(null)
  const [offset, setOffset] = useState(0)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState<{ qid: string; r: StudentResponse } | null>(null)
  const [claw, setClaw] = useState<{ k: number; label: string; tone: 'gold' | 'green' } | null>(null)
  const inflight = useRef(false)

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    const t0 = Date.now()
    try {
      const s = await getState(token)
      if (!s.ok) {
        onLeave(PLAY_ERRORS[s.error] ?? 'Tu sesión terminó.')
        return
      }
      setOffset(serverOffset(s.server_now, t0))
      setSt(s)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      inflight.current = false
    }
  }, [token, onLeave])

  useNudgeChannel(st?.session.id, () => void refresh())
  const phase = st?.session.phase
  useEffect(() => {
    void refresh()
    if (phase === 'finished') return
    const t = setInterval(() => void refresh(), phase === 'question' ? 1500 : 2500)
    return () => clearInterval(t)
  }, [refresh, phase])

  const now = useServerNow(offset, phase === 'countdown' || phase === 'question')

  // Música opcional en el equipo del estudiante (por defecto solo efectos)
  const { studentMusic } = useSoundPrefs()
  useMuteHotkey()
  useEffect(() => {
    if (!studentMusic || !phase) return setMusic(null)
    setMusic(phase === 'lobby' || phase === 'leaderboard' ? 'lobby' : phase === 'question' ? 'question' : null)
  }, [studentMusic, phase])
  useEffect(() => () => setMusic(null), [])

  // Sonidos y celebraciones al cambiar de fase
  const prev = useRef('')
  useEffect(() => {
    if (!st) return
    const k = `${st.session.phase}-${st.session.question_index}`
    if (prev.current === k) return
    const first = prev.current === ''
    prev.current = k
    if (first) return
    if (st.session.phase === 'question') {
      sfx.go()
      setClaw({ k: Date.now(), label: '¡Ya!', tone: 'gold' })
    }
    if (st.session.phase === 'reveal') {
      if (st.my_answer?.correct) {
        sfx.correct()
        celebrate()
        setClaw({ k: Date.now(), label: `¡Garra! +${st.my_answer.points ?? 0}`, tone: 'green' })
      } else sfx.wrong()
    }
    if (st.session.phase === 'finished') {
      sfx.fanfare()
      if ((st.summary?.rank ?? 99) <= 3) sfx.applause(2.5)
      if ((st.summary?.rank ?? 99) <= 3) setTimeout(() => celebrate(true), 400)
    }
  }, [st])

  // Salir de la pestaña durante una pregunta queda registrado (el docente lo ve)
  const watching = phase === 'question' && !st?.my_answer?.answered
  useEffect(() => {
    if (!watching) return
    let warned = false
    const onVis = () => {
      if (document.visibilityState === 'hidden') void reportEvent(token, 'tab')
      else if (!warned) {
        warned = true
        toast.info('Saliste de la pestaña', 'El docente puede ver cuántas veces sales durante una pregunta.')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [watching, token, toast])

  async function answer(r: StudentResponse) {
    if (!st?.question || pending?.qid === st.question.id) return
    const qid = st.question.id
    setPending({ qid, r })
    sfx.sent()
    try {
      const res = await submitAnswer(token, qid, r)
      if (!res.ok && res.error !== 'already') {
        toast.error(PLAY_ERRORS[res.error] ?? 'No se pudo enviar')
        if (res.error !== 'closed' && res.error !== 'late') setPending(null)
      }
    } catch {
      setPending(null)
      toast.error('Sin conexión', 'Tu respuesta no llegó. Vuelve a intentarlo.')
    }
    void refresh()
  }

  if (!st) return <Loader2 className="size-10 animate-spin text-uap-green" aria-label="Cargando" />
  const s = st.session
  const me = st.me
  // Aviso para lectores de pantalla (accesibilidad): qué está pasando ahora
  const qn = `Pregunta ${(s.question_index ?? 0) + 1} de ${s.total}`
  const announce =
    s.phase === 'lobby'
      ? 'Estás en la sala de espera. Espera a que el docente empiece.'
      : s.phase === 'countdown'
        ? `Prepárate: ${qn}.`
        : s.phase === 'question'
          ? st.my_answer?.answered
            ? 'Respuesta enviada. Espera el resultado.'
            : `${qn}: ${st.question?.prompt ?? ''}. Responde con las teclas 1 a ${st.question?.options.length || 4}.`
          : s.phase === 'reveal'
            ? st.my_answer?.answered
              ? st.my_answer.correct
                ? `¡Correcto! Ganaste ${st.my_answer.points ?? 0} puntos.`
                : 'Respuesta incorrecta.'
              : 'No respondiste esta pregunta.'
            : s.phase === 'leaderboard'
              ? `Vas en el puesto ${me.rank} de ${me.of}, con ${me.score} puntos.`
              : 'La partida terminó. Mira tu resumen.'

  return (
    <div className="flex w-full flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {/* Mi tarjeta */}
      <div className="glass flex items-center gap-3 rounded-3xl px-4 py-2">
        <AvatarBubble avatar={me.avatar} size="sm" />
        <span className="min-w-0 flex-1 truncate font-display font-bold">{me.nickname}</span>
        {me.streak >= 2 && (
          <span className="flex items-center gap-1 rounded-full bg-game-coral px-2 py-0.5 text-sm font-bold text-white">
            <Flame className="size-4" /> {me.streak}
          </span>
        )}
        <span className="font-display text-lg font-black tabular-nums">{me.score.toLocaleString('es-BO')}</span>
        {offline && <WifiOff className="size-5 text-uap-red" aria-label="Sin conexión" />}
      </div>

      {s.phase === 'lobby' && (
        <Card className="text-center">
          <div className="flex items-end justify-center gap-2">
            <JaguarFace mood="wink" className="w-28" />
            <AvatarBubble avatar={me.avatar} size="lg" className="-ml-6 mb-1" />
          </div>
          <p className="mt-4 font-display text-3xl font-black">¡Ya estás dentro!</p>
          <p className="mt-1 text-lg text-ink-soft">Mira el proyector: el juego empieza en un momento.</p>
          <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-4 font-semibold text-uap-green dark:text-game-selva">
            Esperando al docente…
          </motion.p>
          <PawTrail count={5} className="mt-3 justify-center" />
        </Card>
      )}

      {s.phase === 'countdown' && (
        <div className="grid min-h-[50vh] place-items-center">
          <BigCountdown
            value={Math.max(0, Math.ceil((new Date(s.phase_started_at).getTime() + COUNTDOWN_MS - now) / 1000))}
            label={`Pregunta ${(s.question_index ?? 0) + 1} de ${s.total}`}
          />
        </div>
      )}

      {s.phase === 'reveal' && st.question && (
        <JaguarFace
          mood={st.my_answer?.correct ? 'happy' : Number(st.my_answer?.partial ?? 0) > 0 ? 'wow' : 'sad'}
          className="mx-auto -mb-2 w-24 drop-shadow-lg"
        />
      )}
      {(s.phase === 'question' || s.phase === 'reveal') && st.question && (
        <SolidCard className="p-4 sm:p-6">
          {s.phase === 'reveal' && !st.my_answer?.answered && (
            <p className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-ink/5 py-2 font-semibold text-ink-soft">
              <Clock className="size-4" /> No alcanzaste a responder
            </p>
          )}
          <QuestionView
            key={st.question.id}
            q={st.question}
            index={s.question_index ?? 0}
            total={s.total}
            secondsLeft={s.phase === 'question' ? secondsLeft(s.question_ends_at, now) : undefined}
            onSubmit={(r) => void answer(r)}
            submitted={!!st.my_answer?.answered || pending?.qid === st.question.id || (s.phase === 'question' && secondsLeft(s.question_ends_at, now) === 0)}
            response={st.my_answer?.response ?? (pending?.qid === st.question.id ? pending.r : null)}
            reveal={s.phase === 'reveal' && st.reveal && st.my_answer?.answered ? toReveal(st) : null}
          />
          {s.phase === 'reveal' && !st.my_answer?.answered && st.reveal?.explanation && (
            <p className="mt-3 text-center text-ink-soft">💡 {st.reveal.explanation}</p>
          )}
        </SolidCard>
      )}

      {s.phase === 'leaderboard' && (
        <div className="flex flex-col gap-4">
          <RankCard st={st} />
          {st.leaderboard && <Leaderboard rows={st.leaderboard} highlight={me.id} />}
        </div>
      )}

      {s.phase === 'finished' && <Summary st={st} />}

      <ClawSwipe playKey={claw?.k ?? null} label={claw?.label} tone={claw?.tone} />
      {s.paused && s.phase !== 'finished' && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-uap-blue-900/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <Pause className="mx-auto size-16" />
            <p className="mt-2 font-display text-4xl font-black">En pausa</p>
            <p className="text-white/80">El docente reanudará en un momento</p>
          </div>
        </div>
      )}
    </div>
  )
}

function toReveal(st: PlayState): RevealInfo {
  return {
    correct: !!st.my_answer?.correct,
    partial: Number(st.my_answer?.partial ?? 0),
    points: st.my_answer?.points,
    correctKeys: st.reveal?.correct_keys ?? [],
    correctOrder: st.reveal?.correct_order ?? undefined,
    acceptedAnswers: st.reveal?.accepted_answers ?? undefined,
    explanation: st.reveal?.explanation,
  }
}

function RankCard({ st }: { st: PlayState }) {
  const me = st.me
  return (
    <Card className="text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">Vas en el puesto</p>
      <p className="font-display text-7xl font-black text-uap-blue dark:text-white">
        {me.rank}
        <span className="text-2xl text-ink-soft"> de {me.of}</span>
      </p>
      <p className="mt-1 font-display text-xl font-bold">{me.score.toLocaleString('es-BO')} puntos</p>
      {me.streak >= 2 && <p className="mt-1 font-semibold text-game-coral">🔥 ¡Racha de {me.streak}! Sigue así</p>}
    </Card>
  )
}

function Summary({ st }: { st: PlayState }) {
  const sm = st.summary
  if (!sm) return null
  const badges = [
    sm.rank === 1 && { icon: '🥇', label: 'Campeón' },
    sm.rank === 2 && { icon: '🥈', label: 'Segundo lugar' },
    sm.rank === 3 && { icon: '🥉', label: 'Tercer lugar' },
    sm.correct === sm.questions && sm.questions > 0 && { icon: '💯', label: 'Perfecto' },
    sm.max_streak >= 3 && { icon: '🔥', label: `Racha de ${sm.max_streak}` },
    sm.fastest && { icon: '⚡', label: 'El más rápido' },
  ].filter(Boolean) as { icon: string; label: string }[]
  const pass = (sm.grade ?? 0) >= 51
  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <JaguarFace mood={sm.rank <= 3 || pass ? 'happy' : 'neutral'} className="mx-auto w-28" />
        <p className="mt-2 font-display text-3xl font-black">{pass ? '¡Terminaste! 🏆' : '¡Terminaste! Sigue practicando'}</p>
        <p className="text-ink-soft">{st.session.quiz_title}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Big label="Puesto" value={`${sm.rank}°`} sub={`de ${sm.of}`} />
          <Big label="Aciertos" value={`${sm.correct}/${sm.questions}`} />
          <Big label="Nota" value={sm.grade === null ? '—' : String(Math.round(sm.grade))} sub="sobre 100" tone={pass ? 'good' : 'bad'} />
        </div>
        <p className="mt-3 font-display text-lg font-bold">{sm.score.toLocaleString('es-BO')} puntos</p>
        {badges.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {badges.map((b) => (
              <motion.span
                key={b.label}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 rounded-full bg-uap-gold/25 px-3 py-1.5 font-semibold"
              >
                <span className="text-xl">{b.icon}</span> {b.label}
              </motion.span>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-ink-soft">La nota depende solo de tus aciertos; los puntos y el ranking también premian la velocidad.</p>
      </Card>
      {st.leaderboard && st.leaderboard.length > 0 && <Leaderboard rows={st.leaderboard} highlight={st.me.id} />}
      <Link to="/" className="self-center">
        <Button variant="secondary">
          <ArrowLeft className="size-4" /> Volver al inicio
        </Button>
      </Link>
    </div>
  )
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl bg-ink/5 px-2 py-3">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={cn('font-display text-3xl font-black tabular-nums', tone === 'good' && 'text-uap-green dark:text-game-selva', tone === 'bad' && 'text-uap-red dark:text-game-coral')}>{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  )
}
