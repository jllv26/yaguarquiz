import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, LogIn, Mic, Search, Send, Timer, Users, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { SoundControl } from '../../components/SoundControl'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card, SolidCard } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { deviceId, serverOffset } from '../../lib/api/live'
import {
  presentationInfo,
  presentationJoin,
  presentationLookup,
  presentationReview,
  presentationState,
  PRES_ERRORS,
  type AgendaItem,
  type StudentState,
} from '../../lib/api/presentations'
import { cn } from '../../lib/cn'
import { sfx, unlockAudio } from '../../lib/sound'
import { celebrate, useServerNow } from '../live/clock'
import { fmt, mmss, scoreOf, type Rubric } from './rubric'

const tokenKey = (pin: string) => `yq-expo-${pin}`
const draftKey = (pin: string, id: string) => `yq-expo-draft-${pin}-${id}`
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}

/** Exposiciones: el estudiante califica a sus compañeros desde el celular o la PC del laboratorio. */
export function PresentationPlayPage() {
  const { pin = '' } = useParams()
  const [token, setToken] = useState<string | null>(() => read(tokenKey(pin)))
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground />
      <TopBar right={<SoundControl role="student" />} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-8">
        {token ? (
          <Play
            pin={pin}
            token={token}
            onLeave={() => {
              write(tokenKey(pin), null)
              setToken(null)
            }}
          />
        ) : (
          <Join
            pin={pin}
            onJoined={(t) => {
              write(tokenKey(pin), t)
              setToken(t)
            }}
          />
        )}
      </main>
    </div>
  )
}

// ================================================================ ingreso
function Join({ pin, onJoined }: { pin: string; onJoined: (t: string) => void }) {
  const [info, setInfo] = useState<{ title: string; subject: string; require_ci: boolean } | null>(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'code' | 'confirm'>('code')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [ci, setCi] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    presentationInfo(pin)
      .then((r) => (r.ok ? setInfo(r) : setError(PRES_ERRORS[r.error] ?? 'No se pudo abrir la exposición.')))
      .catch(() => setError('Sin conexión a internet. Revisa el wifi e intenta de nuevo.'))
  }, [pin])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (!info)
    return error ? (
      <Card className="mt-10 w-full max-w-md text-center">
        <WifiOff className="mx-auto mb-3 size-12 text-uap-red" />
        <p className="font-display text-xl font-bold">{error}</p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="secondary">
            <ArrowLeft className="size-4" /> Cambiar PIN
          </Button>
        </Link>
      </Card>
    ) : (
      <Loader2 className="mt-24 size-10 animate-spin text-uap-green" aria-label="Cargando" />
    )

  return (
    <Card className="mt-6 w-full max-w-md sm:mt-12">
      <p className="text-center text-xs font-bold uppercase tracking-wider text-ink-soft">Exposiciones · {info.subject}</p>
      <h1 className="mb-1 text-center font-display text-2xl font-black leading-tight">{info.title}</h1>
      <p className="mb-5 text-center text-sm text-ink-soft">Hoy tú también pones la nota: escucha, califica y explica tu nota.</p>
      {step === 'code' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            unlockAudio()
            if (code.trim())
              void run(async () => {
                const r = await presentationLookup(pin, code)
                if (!r.ok) return setError(PRES_ERRORS[r.error] ?? 'No se pudo verificar el RU.')
                setName(r.name)
                setStep('confirm')
              })
          }}
        >
          <Input label="Tu RU (registro universitario)" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoFocus placeholder="Ej.: 202312345" />
          <Button size="lg" type="submit" disabled={!code.trim() || busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />} Continuar
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const r = await presentationJoin(pin, code, info.require_ci ? ci : null, deviceId())
              if (!r.ok) return setError(PRES_ERRORS[r.error] ?? 'No se pudo entrar.')
              sfx.join()
              onJoined(r.token)
            })
          }}
        >
          <div className="rounded-2xl bg-uap-green/10 p-4 text-center">
            <p className="text-sm text-ink-soft">¿Eres tú?</p>
            <p className="font-display text-xl font-extrabold">{name}</p>
          </div>
          {info.require_ci && (
            <Input
              label="Últimos 3 dígitos de tu CI"
              value={ci}
              onChange={(e) => setCi(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              autoFocus
              placeholder="• • •"
              className="text-center font-display text-2xl tracking-[0.5em]"
            />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStep('code')
                setCi('')
              }}
            >
              <ArrowLeft className="size-4" /> No soy yo
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || (info.require_ci && ci.length < 3)}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />} Sí, soy yo
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-uap-red/10 p-3 text-center text-sm font-semibold text-uap-red dark:text-game-coral">
          {error}
        </p>
      )}
    </Card>
  )
}

// ================================================================ sala
type Filter = 'todos' | 'pendientes' | 'hechos'

function Play({ pin, token, onLeave }: { pin: string; token: string; onLeave: () => void }) {
  const toast = useToast()
  const [st, setSt] = useState<StudentState | null>(null)
  const [offset, setOffset] = useState(0)
  const [offline, setOffline] = useState(false)
  const [evaluating, setEvaluating] = useState<AgendaItem | null>(null)
  const [sent, setSent] = useState<{ name: string; score: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('pendientes')
  const [q, setQ] = useState('')
  const lastLive = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const t0 = Date.now()
    try {
      const r = await presentationState(token)
      if (!r.ok) {
        if (r.error === 'token') {
          toast.error(PRES_ERRORS.token)
          onLeave()
        }
        return
      }
      setOffset(serverOffset(r.server_now, t0))
      setSt(r)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [token, toast, onLeave])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])
  const now = useServerNow(offset, true, 500)

  // aviso cuando pasa alguien nuevo al frente
  useEffect(() => {
    const id = st?.current?.id ?? null
    if (id && lastLive.current && id !== lastLive.current) sfx.go()
    lastLive.current = id
  }, [st?.current?.id])

  const evaluable = (a: AgendaItem) => !a.mine && !a.own_group && (a.state === 'live' || a.state === 'done')
  const list = useMemo(() => st?.agenda ?? [], [st])
  const targets = list.filter(evaluable)
  const doneCount = targets.filter((a) => a.review).length
  const allDone = targets.length > 0 && doneCount === targets.length

  if (!st) return <Loader2 className="mt-24 size-10 animate-spin text-uap-green" aria-label="Cargando" />

  if (evaluating)
    return (
      <Evaluate
        key={evaluating.id}
        pin={pin}
        item={evaluating}
        rubric={st.presentation.rubric}
        minWhy={st.presentation.min_why}
        minUnderstood={st.presentation.min_understood}
        onCancel={() => setEvaluating(null)}
        onSubmit={async (scores, why, understood) => {
          try {
            const r = await presentationReview(token, evaluating.id, scores, why, understood)
            if (!r.ok) {
              toast.error(PRES_ERRORS[r.error] ?? 'No se pudo enviar')
              return false
            }
            write(draftKey(pin, evaluating.id), null)
            sfx.correct()
            setSent({ name: evaluating.name, score: r.score })
            setEvaluating(null)
            void refresh()
            if (targets.filter((a) => a.review || a.id === evaluating.id).length === targets.length) celebrate(true)
            return true
          } catch {
            toast.error('Sin conexión', 'Tu evaluación quedó guardada en este equipo; vuelve a tocar Enviar.')
            return false
          }
        }}
      />
    )

  const cur = st.current ? list.find((a) => a.id === st.current!.id) : undefined
  const shown = list
    .filter((a) => (filter === 'todos' ? true : filter === 'pendientes' ? evaluable(a) && !a.review : !!a.review))
    .filter((a) => !q.trim() || `${a.name} ${a.topic ?? ''} grupo ${a.group_no ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="mt-2 flex w-full flex-col gap-4">
      {offline && (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-uap-red/10 p-2 text-sm font-semibold text-uap-red">
          <WifiOff className="size-4" /> Sin conexión: reintentando…
        </p>
      )}
      <Card className="w-full p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{st.presentation.subject}</p>
        <h1 className="font-display text-2xl font-black leading-tight">{st.presentation.title}</h1>
        <p className="text-sm text-ink-soft">
          Hola, <b className="text-ink">{st.me.name}</b>
          {st.me.group_no ? ` · Grupo ${st.me.group_no}` : ''}
          {st.me.topic ? ` · Tu tema: ${st.me.topic}` : ''}
        </p>
        {/* misión */}
        <div className="mt-4 rounded-3xl bg-gradient-to-br from-uap-blue to-[#14213D] p-4 text-white">
          <div className="flex items-center gap-3">
            <JaguarFace mood={allDone ? 'happy' : 'neutral'} className="w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-black">{allDone ? '🕵️ ¡Evaluador estrella!' : 'Tu misión de hoy'}</p>
              <p className="text-sm text-white/80">{allDone ? 'Calificaste a todos los que expusieron.' : 'Califica a cada compañero de otro grupo cuando pase al frente.'}</p>
            </div>
            <p className="font-display text-3xl font-black tabular-nums">
              {doneCount}
              <span className="text-lg text-white/70">/{targets.length}</span>
            </p>
          </div>
          {targets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
              {targets.map((a) => (
                <i key={a.id} title={a.name} className={cn('size-3 rounded-full', a.review ? 'bg-game-selva' : a.id === st.current?.id ? 'animate-pulse bg-uap-gold' : 'bg-white/25')} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {st.presentation.status === 'closed' && <p className="rounded-2xl bg-uap-gold/15 p-3 text-center font-semibold">Las evaluaciones ya se cerraron. ¡Gracias por participar!</p>}

      {/* en escena */}
      {st.current && cur ? (
        <SolidCard className="relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-uap-gold via-game-coral to-uap-gold" />
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-uap-red dark:text-game-coral">
            <Mic className="size-4" /> En escena
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-3xl font-black leading-tight">{st.current.name}</p>
              <p className="text-ink-soft">
                {st.current.group_no ? `Grupo ${st.current.group_no}` : ''}
                {st.current.topic ? ` · ${st.current.topic}` : ''}
              </p>
            </div>
            <p className="flex items-center gap-1.5 rounded-2xl bg-ink/5 px-3 py-1.5 font-display text-xl font-black tabular-nums" aria-label="Tiempo de exposición">
              <Timer className="size-5" /> {mmss(Math.max(0, (now - new Date(st.current.started_at).getTime()) / 1000))}
            </p>
          </div>
          {cur.mine ? (
            <p className="mt-3 rounded-2xl bg-uap-gold/15 p-3 text-center font-semibold">¡Es tu turno! Tus compañeros te están calificando. 🐆</p>
          ) : cur.own_group ? (
            <p className="mt-3 rounded-2xl bg-ink/5 p-3 text-center text-sm font-semibold text-ink-soft">Es de tu grupo: a tu grupo no lo calificas.</p>
          ) : st.presentation.status === 'open' ? (
            <Button size="xl" variant={cur.review ? 'secondary' : 'gold'} className="mt-4 w-full" onClick={() => setEvaluating(cur)}>
              {cur.review ? (
                <>
                  <CheckCircle2 className="size-6" /> Ya lo calificaste · Editar
                </>
              ) : (
                <>
                  <Send className="size-6" /> Calificar ahora
                </>
              )}
            </Button>
          ) : null}
        </SolidCard>
      ) : (
        st.presentation.status === 'open' && (
          <SolidCard className="p-5 text-center text-ink-soft">
            <Mic className="mx-auto mb-1 size-8" />
            Esperando al siguiente expositor…
          </SolidCard>
        )
      )}

      {/* agenda */}
      <SolidCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-lg font-black">Agenda</h2>
          <div className="flex rounded-2xl bg-ink/5 p-1 text-sm" role="tablist" aria-label="Filtrar la agenda">
            {(
              [
                ['pendientes', `Por calificar (${targets.length - doneCount})`],
                ['hechos', `Calificados (${doneCount})`],
                ['todos', 'Todos'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('rounded-xl px-3 py-1.5 font-semibold', filter === k ? 'bg-surface-2 shadow-sm' : 'text-ink-soft')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <span className="sr-only">Buscar expositor</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar expositor o tema" className="h-11 w-full rounded-2xl border-2 border-line bg-surface-2 pl-9 pr-3 outline-none focus:border-uap-blue" />
        </label>
        {!shown.length ? (
          <p className="py-6 text-center text-sm text-ink-soft">{filter === 'pendientes' ? (targets.length ? '¡Calificaste a todos los que ya expusieron!' : 'Todavía nadie expuso.') : 'Nada que mostrar.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((a) => {
              const can = evaluable(a) && st.presentation.status === 'open'
              const tag = a.mine
                ? ['Tú', 'bg-uap-gold/20']
                : a.state === 'absent'
                  ? ['Ausente', 'bg-ink/10 text-ink-soft']
                  : a.own_group
                    ? ['Tu grupo', 'bg-ink/10 text-ink-soft']
                    : a.state === 'pending'
                      ? ['Aún no expone', 'bg-ink/5 text-ink-soft']
                      : a.review
                        ? [`✓ ${fmt(scoreOf(a.review.scores, st.presentation.rubric))}`, 'bg-uap-green/15 text-uap-green dark:text-game-selva']
                        : a.state === 'live'
                          ? ['Exponiendo', 'bg-[#c81e3c] text-white']
                          : ['Por calificar', 'bg-uap-gold/25']
              return (
                <li key={a.id}>
                  <button
                    disabled={!can}
                    onClick={() => setEvaluating(a)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition', can ? 'border-line hover:border-uap-gold/70 hover:bg-uap-gold/5' : 'border-transparent bg-ink/[0.03]')}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-uap-blue/10 font-display font-black text-uap-blue dark:text-white">{a.group_no ? `G${a.group_no}` : <Users className="size-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-bold">{a.name}</span>
                      <span className="block truncate text-xs text-ink-soft">{a.topic ?? ''}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold', tag[1])}>{tag[0]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </SolidCard>

      <AnimatePresence>
        {sent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Evaluación enviada">
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
              <JaguarFace mood="happy" className="mx-auto w-24" />
              <p className="mt-2 font-display text-2xl font-black">¡Evaluación enviada!</p>
              <p className="text-ink-soft">
                Le pusiste <b className="text-ink">{fmt(sent.score)}/100</b> a {sent.name}.
              </p>
              <Button size="lg" className="mt-5 w-full" onClick={() => setSent(null)} autoFocus>
                Volver a la agenda
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ================================================================ calificar paso a paso
const WHY_STARTERS = ['Me gustó que ', 'Explicó con claridad ', 'Su ejemplo real ', 'Le faltó ']
const UND_STARTERS = ['Entendí que ', 'La idea principal es ', 'Sirve para ']

function Evaluate({
  pin,
  item,
  rubric,
  minWhy,
  minUnderstood,
  onCancel,
  onSubmit,
}: {
  pin: string
  item: AgendaItem
  rubric: Rubric
  minWhy: number
  minUnderstood: number
  onCancel: () => void
  onSubmit: (scores: number[], why: string, understood: string) => Promise<boolean>
}) {
  const n = rubric.criteria.length
  const draft = (() => {
    try {
      return JSON.parse(read(draftKey(pin, item.id)) ?? 'null') as { scores: (number | null)[]; why: string; understood: string } | null
    } catch {
      return null
    }
  })()
  const [scores, setScores] = useState<(number | null)[]>(draft?.scores ?? item.review?.scores ?? Array(n).fill(null))
  const [why, setWhy] = useState(draft?.why ?? item.review?.why ?? '')
  const [und, setUnd] = useState(draft?.understood ?? item.review?.understood ?? '')
  const [step, setStep] = useState(() => {
    const first = (draft?.scores ?? item.review?.scores ?? []).findIndex((x) => x == null)
    return item.review ? n : first < 0 ? (draft ? n : 0) : first
  })
  const [busy, setBusy] = useState(false)
  useEffect(() => write(draftKey(pin, item.id), JSON.stringify({ scores, why, understood: und })), [pin, item.id, scores, why, und])

  const score = scoreOf(scores, rubric)
  const levels = [...rubric.levels].sort((a, b) => b.v - a.v)
  const crit = rubric.criteria[step]
  const ok = scores.every((x) => x != null) && why.trim().length >= minWhy && und.trim().length >= minUnderstood

  function pick(v: number) {
    const ns = [...scores]
    ns[step] = v
    setScores(ns)
    sfx.sent()
    setTimeout(() => setStep((s) => (s === step ? Math.min(n, s + 1) : s)), 280)
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="rounded-xl p-2 hover:bg-ink/5" aria-label="Volver a la agenda">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Calificando a</p>
          <p className="truncate font-display text-xl font-black">{item.name}</p>
          {item.topic && <p className="truncate text-sm text-ink-soft">{item.topic}</p>}
        </div>
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-2 shadow-inner ring-4 ring-uap-gold/40" aria-label={`Tu calificación: ${score == null ? 'incompleta' : fmt(score)}`}>
          <span className="font-display text-lg font-black tabular-nums">{score == null ? '—' : fmt(score, 0)}</span>
        </div>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: n + 1 }, (_, i) => (
          <button key={i} tabIndex={-1} onClick={() => setStep(i)} className={cn('h-2 flex-1 rounded-full', i === step ? 'bg-uap-gold' : (i < n ? scores[i] != null : ok) ? 'bg-uap-green' : 'bg-ink/15')} />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {crit ? (
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.18 }}>
            <SolidCard className="p-5">
              <div className="flex items-start gap-3">
                <span className="text-4xl" aria-hidden>
                  {crit.icon}
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Criterio {step + 1} de {n}
                  </p>
                  <h2 className="font-display text-2xl font-black leading-tight">{crit.title}</h2>
                  {crit.question && <p className="text-ink-soft">{crit.question}</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={crit.title}>
                {levels.map((l) => {
                  const on = scores[step] === l.v
                  return (
                    <button
                      key={l.v}
                      role="radio"
                      aria-checked={on}
                      onClick={() => pick(l.v)}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition',
                        on ? 'border-uap-green bg-uap-green/10 shadow-md' : 'border-line bg-surface-2 hover:border-uap-gold/70',
                      )}
                    >
                      <span className="text-3xl" aria-hidden>
                        {l.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display font-black">
                          {l.label} <span className="text-sm font-semibold text-ink-soft">· {l.hint}</span>
                        </span>
                        {crit.levels?.[String(l.v)] && <span className="block text-sm text-ink-soft">{crit.levels[String(l.v)]}</span>}
                      </span>
                      {on && <CheckCircle2 className="size-6 shrink-0 text-uap-green" />}
                    </button>
                  )
                })}
              </div>
            </SolidCard>
          </motion.div>
        ) : (
          <motion.div key="txt" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <SolidCard className="flex flex-col gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">✍️ Último paso</p>
                <h2 className="font-display text-2xl font-black">Explica tu nota</h2>
                <p className="text-sm text-ink-soft">Tu opinión ayuda al docente a entender la nota. Escribe con respeto y con tus palabras.</p>
              </div>
              <TextBox label="¿Por qué le pones esta nota?" hint="Qué hizo bien y qué le faltó" value={why} onChange={setWhy} min={minWhy} starters={WHY_STARTERS} />
              <TextBox label="¿Qué entendiste de su tema?" hint="Explícalo en una o dos frases" value={und} onChange={setUnd} min={minUnderstood} starters={UND_STARTERS} />
              {scores.some((x) => x == null) && (
                <p className="rounded-2xl bg-uap-gold/15 p-3 text-sm">
                  Falta calificar: {rubric.criteria.filter((_, i) => scores[i] == null).map((c) => c.title).join(', ')}.
                </p>
              )}
            </SolidCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          <ArrowLeft className="size-4" /> {step === 0 ? 'Volver' : 'Anterior'}
        </Button>
        {step < n ? (
          <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={scores[step] == null}>
            Siguiente <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            variant="success"
            size="lg"
            className="flex-1"
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true)
              await onSubmit(scores as number[], why.trim(), und.trim())
              setBusy(false)
            }}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} Enviar {score != null && `· ${fmt(score)}/100`}
          </Button>
        )}
      </div>
    </div>
  )
}

function TextBox({ label, hint, value, onChange, min, starters }: { label: string; hint: string; value: string; onChange: (v: string) => void; min: number; starters: string[] }) {
  const len = value.trim().length
  const id = `tb-${label.length}-${min}`
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <p className="mb-1 text-xs text-ink-soft">{hint}</p>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        rows={3}
        onPaste={(e) => e.preventDefault()}
        className="w-full rounded-2xl border-2 border-line bg-surface-2 p-3 outline-none focus:border-uap-blue"
      />
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => onChange(value.trim() ? `${value.trim()} ${s}` : s)} className="rounded-xl bg-ink/5 px-2.5 py-1 text-xs font-semibold hover:bg-ink/10">
            {s.trim()}…
          </button>
        ))}
        <span className={cn('ml-auto text-xs font-bold', len >= min ? 'text-uap-green' : 'text-ink-soft')}>{len >= min ? '✓ Listo' : `Mínimo ${min} caracteres (${len})`}</span>
      </div>
    </div>
  )
}
