import { ActivityBadge } from '../activities/ActivityBadge'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, ClipboardList, Clock, Loader2, LogOut, PlayCircle, RefreshCw, Trophy } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { deviceId, joinSession, PLAY_ERRORS } from '../../lib/api/live'
import { portalLookup, readPortalLogin, savePortalLogin, type PortalItem, type PortalResult } from '../../lib/api/portal'
import { randomAvatar } from '../../lib/avatars'
import { cn } from '../../lib/cn'
import { ACTIVITY_META } from '../activities/types'

type ListData = Extract<PortalResult, { step: 'list' }>
type Screen =
  | { kind: 'code' }
  | { kind: 'loading' }
  | { kind: 'ru'; subject: string }
  | { kind: 'ci'; subject: string; name: string }
  | { kind: 'list'; data: ListData }

const ERR: Record<string, string> = {
  code: 'No encontramos esa aula. Revisa el código (por ejemplo ICOM261).',
  ru: 'Ese RU no está inscrito en esta asignatura. Revísalo o consulta a tu docente.',
  ci: 'Los 3 dígitos del CI no coinciden. Revísalos.',
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-BO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'sin fecha de cierre'

function timeLeft(iso: string | null) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600e3)
  if (h >= 48) return `quedan ${Math.floor(h / 24)} días`
  if (h >= 1) return `quedan ${h} h`
  return `quedan ${Math.max(1, Math.floor(ms / 60e3))} min`
}

/** «Mi aula»: el estudiante entra una vez (RU + 3 dígitos del CI) y ve todas sus actividades. */
export function StudentPortalPage() {
  const { code: codeParam = '' } = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState(codeParam.toUpperCase())
  const [ru, setRu] = useState('')
  const [ci, setCi] = useState('')
  const [screen, setScreen] = useState<Screen>({ kind: codeParam ? 'loading' : 'code' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const lookup = useCallback(
    async (c: string, r?: string, k?: string, silent = false) => {
      setError('')
      if (!silent) setScreen({ kind: 'loading' })
      try {
        const res = await portalLookup(c, r || null, k || null)
        if (!res.ok) {
          setError(ERR[res.error] ?? 'No se pudo entrar.')
          if (res.error === 'code') setScreen({ kind: 'code' })
          else if (res.error === 'ci') setScreen((s) => (s.kind === 'ci' ? s : { kind: 'ru', subject: '' }))
          else {
            savePortalLogin(null)
            setScreen((s) => (s.kind === 'ru' ? s : { kind: 'ru', subject: '' }))
          }
          return
        }
        if (res.step === 'ru') return setScreen({ kind: 'ru', subject: res.subject })
        if (res.step === 'ci') return setScreen({ kind: 'ci', subject: res.subject, name: res.name })
        savePortalLogin({ code: res.code, ru: r ?? '', ci: k ?? '' })
        setScreen({ kind: 'list', data: res })
      } catch {
        setError('Sin conexión a internet. Revisa el wifi e intenta de nuevo.')
        if (!silent) setScreen({ kind: 'code' })
      }
    },
    [],
  )

  // al abrir: si este navegador ya entró a esta aula, entra directo
  useEffect(() => {
    if (!codeParam) return
    const saved = readPortalLogin()
    if (saved && saved.code.toUpperCase() === codeParam.toUpperCase()) {
      setRu(saved.ru)
      setCi(saved.ci)
      void lookup(codeParam, saved.ru, saved.ci)
    } else void lookup(codeParam)
  }, [codeParam, lookup])

  // al volver de una actividad, se actualiza sola
  useEffect(() => {
    if (screen.kind !== 'list') return
    const onFocus = () => void lookup(screen.data.code, ru, ci, true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [screen, ru, ci, lookup])

  async function open(it: PortalItem) {
    setBusy(it.id)
    setError('')
    try {
      const r = await joinSession({ pin: it.pin, code: ru, ci: ci || undefined, avatar: randomAvatar(), device: deviceId() })
      if (!r.ok) return setError(PLAY_ERRORS[r.error] ?? 'No se pudo abrir la actividad.')
      try {
        localStorage.setItem(`yq-play-${it.pin}`, JSON.stringify({ t: r.token, m: it.mode }))
      } catch {
        /* sin almacenamiento */
      }
      navigate(`/play/${it.pin}`)
    } catch (e) {
      setError((e as Error).message || 'Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  function logout() {
    savePortalLogin(null)
    setRu('')
    setCi('')
    setScreen({ kind: 'ru', subject: screen.kind === 'list' ? screen.data.subject : '' })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (screen.kind === 'code') {
      const c = code.trim().toUpperCase()
      if (c) navigate(`/aula/${c}`)
    } else if (screen.kind === 'ru') void lookup(codeParam, ru.trim())
    else if (screen.kind === 'ci') void lookup(codeParam, ru.trim(), ci.trim())
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground />
      <TopBar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-8 pt-2">
        {screen.kind === 'loading' && <Loader2 className="mt-24 size-10 animate-spin text-uap-green" aria-label="Cargando" />}

        {(screen.kind === 'code' || screen.kind === 'ru' || screen.kind === 'ci') && (
          <Card className="mt-6 w-full max-w-md">
            <p className="text-center text-xs font-bold uppercase tracking-wider text-ink-soft">Mi aula</p>
            <h1 className="mb-1 text-center font-display text-2xl font-black leading-tight">
              {screen.kind === 'code' ? 'Entra a tus actividades' : screen.kind === 'ci' ? `¡Hola, ${screen.name}!` : screen.subject || 'Tu aula'}
            </h1>
            <p className="mb-5 text-center text-sm text-ink-soft">
              {screen.kind === 'code'
                ? 'Escribe el código de tu aula (te lo dio tu docente, por ejemplo ICOM261).'
                : screen.kind === 'ru'
                  ? 'Escribe tu RU. No necesitas contraseña.'
                  : 'Para confirmar que eres tú: los 3 últimos dígitos de tu CI.'}
            </p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              {screen.kind === 'code' && (
                <Input label="Código del aula" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus autoCapitalize="characters" autoComplete="off" placeholder="ICOM261" />
              )}
              {screen.kind === 'ru' && (
                <Input label="Tu RU" value={ru} onChange={(e) => setRu(e.target.value.replace(/\s/g, ''))} autoFocus inputMode="numeric" autoComplete="off" placeholder="Ej. 39302" />
              )}
              {screen.kind === 'ci' && (
                <Input
                  label="Últimos 3 dígitos de tu CI"
                  value={ci}
                  onChange={(e) => setCi(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="•••"
                  className="text-center font-display text-2xl tracking-[0.5em]"
                />
              )}
              {error && (
                <p role="alert" className="rounded-xl bg-uap-red/10 px-3 py-2 text-sm font-semibold text-uap-red">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" block disabled={(screen.kind === 'code' && !code.trim()) || (screen.kind === 'ru' && !ru) || (screen.kind === 'ci' && ci.length < 3)}>
                Entrar <ArrowRight className="size-5" />
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-ink-soft">
              ¿Juego en vivo en clase? <Link to="/" className="font-bold text-uap-blue underline">Entra con el PIN del proyector</Link>
            </p>
          </Card>
        )}

        {screen.kind === 'list' && <PortalList data={screen.data} busy={busy} error={error} onOpen={open} onLogout={logout} onRefresh={() => void lookup(screen.data.code, ru, ci, true)} />}
      </main>
    </div>
  )
}

function PortalList({
  data,
  busy,
  error,
  onOpen,
  onLogout,
  onRefresh,
}: {
  data: ListData
  busy: string | null
  error: string
  onOpen: (it: PortalItem) => void
  onLogout: () => void
  onRefresh: () => void
}) {
  const todo = data.items.filter((x) => x.win === 'open' && x.done === 0)
  const improve = data.items.filter((x) => x.win === 'open' && x.done > 0 && x.done < x.max_attempts && x.activity !== 'research')
  const delivered = data.items.filter((x) => x.win === 'open' && x.done > 0 && !improve.includes(x))
  const soon = data.items.filter((x) => x.win === 'not_open')
  const closed = data.items.filter((x) => x.win === 'closed')
  const graded = data.items.filter((x) => x.best != null)
  const total = data.items.filter((x) => x.win !== 'not_open').length
  const doneCount = data.items.filter((x) => x.win !== 'not_open' && x.done > 0).length
  const avg = graded.length ? Math.round(graded.reduce((a, x) => a + Number(x.best), 0) / graded.length) : null
  return (
    <div className="mt-2 flex w-full flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{data.subject} · Mi aula</p>
          <h1 className="font-display text-2xl font-black leading-tight">Hola, {data.student.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-soft">
            RU {data.student.ru} · {todo.length ? `${todo.length} por hacer` : 'nada pendiente 🎉'}
            {avg != null && ` · promedio ${avg}`}
          </p>
        </div>
        {total > 0 && (
          <div className="order-last w-full" aria-label={`Avance: ${doneCount} de ${total} hechas`}>
            <div className="mb-1 flex justify-between text-xs font-bold text-ink-soft">
              <span>Tu avance</span>
              <span>
                {doneCount} de {total} hechas
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-uap-green via-game-selva to-uap-gold"
                initial={{ width: 0 }}
                animate={{ width: `${(100 * doneCount) / total}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
              />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} aria-label="Actualizar">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={onLogout}>
            <LogOut className="size-4" /> No soy yo
          </Button>
        </div>
      </Card>
      {error && (
        <p role="alert" className="rounded-xl bg-uap-red/10 px-3 py-2 text-sm font-semibold text-uap-red">
          {error}
        </p>
      )}
      <Section title="Por hacer" items={todo} empty="No tienes actividades pendientes." busy={busy} onOpen={onOpen} />
      {improve.length > 0 && <Section title="Hechas · puedes mejorar tu nota" items={improve} busy={busy} onOpen={onOpen} />}
      {delivered.length > 0 && <Section title="Entregadas" items={delivered} busy={busy} onOpen={onOpen} />}
      {soon.length > 0 && <Section title="Próximamente" items={soon} busy={busy} onOpen={onOpen} />}
      {closed.length > 0 && <Section title="Cerradas" items={closed} busy={busy} onOpen={onOpen} />}
    </div>
  )
}

function Section({ title, items, empty, busy, onOpen }: { title: string; items: PortalItem[]; empty?: string; busy: string | null; onOpen: (it: PortalItem) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-display text-lg font-black">
        {title} <span className="text-ink-soft">({items.length})</span>
      </h2>
      {items.length === 0 && empty && (
        <Card className="flex flex-col items-center gap-1 text-center text-ink-soft">
          <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="text-4xl" aria-hidden>
            🎉
          </motion.span>
          {empty}
        </Card>
      )}
      {items.map((it, i) => (
        <motion.div key={it.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5), type: 'spring', stiffness: 300, damping: 26 }}>
          <ItemCard it={it} busy={busy === it.id} disabled={busy != null} onOpen={() => onOpen(it)} />
        </motion.div>
      ))}
    </section>
  )
}

function ItemCard({ it, busy, disabled, onOpen }: { it: PortalItem; busy: boolean; disabled: boolean; onOpen: () => void }) {
  const meta = it.activity ? ACTIVITY_META[it.activity] : null
  const Icon = meta?.icon ?? ClipboardList
  const left = it.max_attempts - it.done
  const canDo = it.win === 'open' && (left > 0 || it.in_progress)
  const tl = timeLeft(it.closes)
  const label = it.in_progress ? 'Continuar' : it.done === 0 ? (it.activity === 'research' ? 'Investigar' : 'Hacer') : 'Mejorar mi nota'
  return (
    <Card className="flex flex-wrap items-center gap-3 !p-4">
      {it.activity ? (
        <ActivityBadge type={it.activity} />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ background: '#1F3864' }}>
          <Icon className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display font-black leading-tight">{it.title}</p>
        <p className="text-xs text-ink-soft">
          {meta ? meta.label : it.mode === 'exam' ? 'Examen' : 'Tarea'}
          {it.category && ` · ${it.category}`}
          {it.time_limit_sec ? ` · ${Math.round(it.time_limit_sec / 60)} min` : ''}
        </p>
        <p className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 text-xs', it.win === 'open' && tl && /min|\b[1-9] h/.test(tl) ? 'font-bold text-uap-red' : 'text-ink-soft')}>
          <span>
            <Clock className="mr-1 inline size-3.5 align-[-2px]" />
            {it.win === 'not_open' ? `Abre el ${fmt(it.opens)}` : it.win === 'closed' ? `Cerró el ${fmt(it.closes)}` : it.closes ? `Hasta el ${fmt(it.closes)}${tl ? ` · ${tl}` : ''}` : 'Sin fecha de cierre'}
          </span>
          {it.win === 'open' && it.max_attempts > 1 && <span>· {Math.max(0, left)} de {it.max_attempts} intentos</span>}
        </p>
      </div>
      {it.best != null && (
        <span className={cn('flex items-center gap-1 rounded-2xl px-3 py-1.5 font-display text-xl font-black', Number(it.best) >= 51 ? 'bg-uap-green/15 text-uap-green' : 'bg-uap-red/10 text-uap-red')}>
          {Number(it.best) >= 51 ? <Trophy className="size-4" /> : <CheckCircle2 className="size-4" />}
          {Math.round(Number(it.best))}
        </span>
      )}
      {it.activity === 'research' && it.done > 0 && it.best == null && (
        <span className="rounded-xl bg-uap-gold/20 px-2 py-1 text-xs font-bold">Entregada · en revisión</span>
      )}
      {canDo ? (
        <Button onClick={onOpen} disabled={disabled} className="w-full sm:w-auto">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} {label}
        </Button>
      ) : it.win === 'open' && it.done > 0 && it.activity !== 'research' ? (
        <span className="text-xs font-bold text-ink-soft">Sin intentos</span>
      ) : it.win === 'closed' && it.done === 0 ? (
        <span className="rounded-xl bg-uap-red/10 px-2 py-1 text-xs font-bold text-uap-red">No entregada</span>
      ) : null}
    </Card>
  )
}
