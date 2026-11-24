import { BookOpenCheck, Eye, Home, IdCard, Lock, Maximize, MonitorPlay, Rocket, Shuffle, Smile, Trophy, UserCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useGradingPlan } from '../../lib/api/academic'
import { SHOW_CORRECT_LABEL, type ShowCorrect } from '../../lib/api/exam'
import { createSession, hostEnd, type SessionSettings } from '../../lib/api/live'
import { useSubjectsLite } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { TERM_LABEL } from '../academic/gradingDefaults'
import { ACTIVITY_META, type ActivityType } from '../activities/types'
import { mailNow } from '../../lib/sheets'

type Mode = 'live' | 'exam' | 'homework'

/** Configuración sugerida guardada en la evaluación (quizzes.settings.launch): se precarga al lanzar. */
export interface LaunchHint {
  mode?: 'exam' | 'homework'
  pick_count?: number
  time_limit_min?: number | null
  max_attempts?: number
  /** rubro sugerido: ejercicio en clase, práctica para casa o investigación */
  rubro?: 'clase' | 'casa' | 'inv'
}

interface Props {
  open: boolean
  onClose: () => void
  quiz: { id: string; title: string; subject_id: string; questionCount?: number; activity?: ActivityType | null; launch?: LaunchHint | null } | null
}

/** Lee la configuración sugerida de quizzes.settings (si existe y es válida). */
export function launchHint(settings: unknown): LaunchHint | null {
  const l = (settings as { launch?: LaunchHint } | null)?.launch
  return l && typeof l === 'object' ? l : null
}

/** "2026-11-18T08:00" en hora local (para <input type="datetime-local">). */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
// hacia abajo: lo que se publica "ahora" queda abierto de inmediato
const roundTo5 = (d: Date) => new Date(Math.floor(d.getTime() / 300000) * 300000)

/** Configura y lanza una sesión: en vivo, examen de laboratorio o tarea. */
export function LaunchModal({ open, onClose, quiz }: Props) {
  if (!quiz) return null
  return <LaunchModalInner key={quiz.id} open={open} onClose={onClose} quiz={quiz} />
}

const DEFAULTS: Record<Mode, Partial<SessionSettings> & { durationH: number }> = {
  live: { durationH: 0 },
  exam: { durationH: 2, time_limit_min: 40, max_attempts: 1, shuffle_questions: true, shuffle_options: true, show_correct: 'after_close', focus_mode: true, lock_after: 0 },
  homework: { durationH: 24 * 7, time_limit_min: 20, max_attempts: 2, shuffle_questions: true, shuffle_options: true, show_correct: 'after_close', focus_mode: false, lock_after: 0 },
}

function LaunchModalInner({ open, onClose, quiz }: Props & { quiz: NonNullable<Props['quiz']> }) {
  const navigate = useNavigate()
  const toast = useToast()
  const subjects = useSubjectsLite()
  const [subjectId, setSubjectId] = useState(quiz.subject_id)
  const plan = useGradingPlan(subjectId)
  const [mode, setMode] = useState<Mode>('live')
  const [s, setS] = useState<SessionSettings>({ identification: 'roster', require_ci: false, show_ranking: true, allow_late_join: true, grading_item_id: null })
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const [limitOn, setLimitOn] = useState(true)
  const [pickOn, setPickOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const items = (plan.data?.grading_items ?? []).filter((i) => i.source === 'yaguarquiz').sort((a, b) => a.term - b.term || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const n = quiz.questionCount
  const act = quiz.activity ? ACTIVITY_META[quiz.activity] : null
  const hint = quiz.launch ?? null
  // Rubro de la nota: actividades en clase → «Ejercicios en clase»; de tarea → «Prácticas para casa»
  const terms = [...new Set(items.map((i) => i.term))]
  const [term, setTerm] = useState<number | null>(() => {
    const t = Number(localStorage.getItem('yq-term') ?? '')
    return Number.isFinite(t) && t > 0 ? t : null
  })
  const curTerm = term != null && terms.includes(term) ? term : (terms[terms.length - 1] ?? null)
  const findItem = (t: number | null, kind: 'clase' | 'casa') =>
    items.find((i) => i.term === t && (kind === 'clase' ? /ejercicio|clase/i.test(i.category) && !/casa/i.test(i.category) : /pr[aá]ctica/i.test(i.category)))
  const kindOf = (id: string | null | undefined) => {
    const it = items.find((i) => i.id === id)
    if (!it) return null
    return findItem(it.term, 'clase')?.id === id ? 'clase' : findItem(it.term, 'casa')?.id === id ? 'casa' : 'otro'
  }
  const [rubroTouched, setRubroTouched] = useState(false)
  useEffect(() => {
    if (rubroTouched || !items.length || s.identification !== 'roster') return
    const want = quiz.activity === 'research' ? 'inv' : (hint?.rubro ?? (mode === 'homework' ? 'casa' : 'clase'))
    const it = want === 'inv' ? items.find((i) => i.term === curTerm && /investigaci/i.test(i.category)) : findItem(curTerm, want)
    if (it && it.id !== s.grading_item_id) setS((x) => ({ ...x, grading_item_id: it.id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, mode, curTerm, rubroTouched, s.identification])
  function pickRubro(t: number | null, kind: 'clase' | 'casa' | null) {
    setRubroTouched(true)
    if (t != null) {
      setTerm(t)
      try {
        localStorage.setItem('yq-term', String(t))
      } catch {
        /* sin almacenamiento */
      }
    }
    const k = kind ?? (kindOf(s.grading_item_id) === 'casa' ? 'casa' : 'clase')
    setS((x) => ({ ...x, grading_item_id: findItem(t ?? curTerm, k)?.id ?? x.grading_item_id }))
  }

  function pickMode(m: Mode) {
    setMode(m)
    const d = DEFAULTS[m]
    const start = roundTo5(new Date())
    setOpens(m === 'live' ? '' : toLocalInput(start))
    setCloses(m === 'live' ? '' : toLocalInput(new Date(start.getTime() + d.durationH * 3600000)))
    setLimitOn(m === 'exam')
    setPickOn(false)
    setS((x) => ({
      ...x,
      ...d,
      identification: m === 'exam' ? 'roster' : x.identification,
      require_ci: m === 'exam' ? true : m === 'live' ? false : x.require_ci,
      show_ranking: m === 'live',
      show_grade: true,
      pick_count: null,
      // actividades: retroalimentación inmediata por defecto (es parte del juego)
      ...(act ? { show_correct: m === 'homework' ? ('each' as const) : ('end' as const), shuffle_questions: !act.fixedBoard, max_attempts: m === 'homework' ? 3 : 1 } : {}),
    }))
    if (act) setLimitOn(m === 'exam')
    // configuración sugerida por quien preparó la evaluación
    if (hint && m !== 'live') {
      const pick = hint.pick_count && (!n || hint.pick_count < n) && !act?.fixedBoard ? hint.pick_count : null
      if (pick) setPickOn(true)
      setS((x) => ({
        ...x,
        pick_count: pick ?? x.pick_count,
        ...(hint.mode === m && hint.max_attempts ? { max_attempts: hint.max_attempts } : {}),
        ...(hint.mode === m && hint.time_limit_min ? { time_limit_min: hint.time_limit_min } : {}),
      }))
      if (hint.mode === m && hint.time_limit_min) setLimitOn(true)
    }
  }
  // las actividades no se juegan en vivo: empiezan como tarea
  useEffect(() => {
    if (hint?.mode) pickMode(hint.mode)
    else if (act) pickMode('homework')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function launch() {
    let settings: SessionSettings = { ...s, mode }
    if (mode !== 'live') {
      const o = opens ? new Date(opens) : new Date()
      const c = closes ? new Date(closes) : null
      if (c && c <= o) return toast.error('Revisa las fechas', 'La hora de cierre debe ser posterior a la de apertura.')
      if (c && c <= new Date()) return toast.error('Revisa las fechas', 'La hora de cierre ya pasó.')
      if (limitOn && (!s.time_limit_min || s.time_limit_min < 1)) return toast.error('Escribe el tiempo total en minutos')
      if (pickOn && (!s.pick_count || s.pick_count < 1)) return toast.error('Escribe cuántas preguntas al azar')
      settings = {
        ...settings,
        opens_at: o.toISOString(),
        closes_at: c ? c.toISOString() : null,
        time_limit_min: limitOn ? s.time_limit_min : null,
        pick_count: pickOn ? s.pick_count : null,
      }
    }
    setBusy(true)
    try {
      const r = await createSession(quiz.id, subjectId, settings)
      if (mode !== 'live' && r.mode !== mode) {
        // la base de datos todavía no tiene la actualización del modo examen/tarea
        await hostEnd(r.id).catch(() => null)
        toast.error('Falta actualizar la base de datos', 'El modo examen/tarea estará disponible cuando se aplique la migración 0006 en Supabase.')
        return
      }
      // aviso por correo a los estudiantes (si está activado): se pide al script que envíe ya
      if (mode === 'homework')
        void mailNow()
          .then((m) => toast.info('Tarea publicada', m.ok ? 'El aviso por correo a los estudiantes sale ahora.' : 'El aviso por correo sale solo en los próximos minutos (lo envía Google).'))
          .catch(() => null)
      onClose()
      navigate(`/host/${r.id}`)
    } catch (e) {
      toast.error('No se pudo lanzar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const exam = mode !== 'live'
  const numberInput = (value: number | null | undefined, onChange: (v: number | null) => void, label: string, max: number) => (
    <input
      type="number"
      min={1}
      max={max}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="h-11 w-20 rounded-xl border-2 border-line bg-surface-2 text-center font-display text-lg font-bold"
      aria-label={label}
    />
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={act ? `Lanzar actividad: ${act.label}` : 'Lanzar evaluación'}
      subtitle={quiz.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" size="lg" onClick={() => void launch()} disabled={busy}>
            <Rocket className="size-5" /> {busy ? 'Lanzando…' : mode === 'live' ? 'Abrir sala' : 'Programar y publicar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className={cn('grid gap-3', act ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {!act && <Choice on={mode === 'live'} onClick={() => pickMode('live')} icon={<MonitorPlay className="size-6" />} title="En vivo" text="Tipo Kahoot: usted marca el ritmo desde el proyector." />}
          <Choice on={mode === 'homework'} onClick={() => pickMode('homework')} icon={<Home className="size-6" />} title={act ? 'Tarea / práctica' : 'Tarea / práctica'} text={act ? 'Cada estudiante juega desde su celular o casa entre dos fechas.' : 'Disponible entre dos fechas, desde casa o el celular.'} />
          <Choice on={mode === 'exam'} onClick={() => pickMode('exam')} icon={<BookOpenCheck className="size-6" />} title={act ? 'En el laboratorio' : 'Examen'} text={act ? 'Con RU + CI, tiempo total y modo enfoque.' : 'Cada uno a su ritmo con tiempo total. Se abre y cierra solo.'} />
        </div>

        <Select label="Asignatura y paralelo" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {(subjects.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} · Paralelo {x.parallel} — {x.name}
              {x.periods ? ` (${x.periods.name})` : ''}
            </option>
          ))}
        </Select>

        {mode !== 'exam' && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-soft">¿Cómo entran los estudiantes?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice on={s.identification === 'roster'} onClick={() => setS({ ...s, identification: 'roster' })} icon={<UserCheck className="size-6" />} title="Con su RU (lista oficial)" text="Solo entran los inscritos. La nota queda en su registro." />
              <Choice on={s.identification === 'nickname'} onClick={() => setS({ ...s, identification: 'nickname', require_ci: false, grading_item_id: null })} icon={<Smile className="size-6" />} title="Con apodo libre" text="Para repasos o invitados. No cuenta para la nota." />
            </div>
          </div>
        )}

        {exam && (
          <Section title="Horario">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="datetime-local" label="Se abre" value={opens} onChange={(e) => setOpens(e.target.value)} />
              <Input type="datetime-local" label="Se cierra (lo pendiente se entrega solo)" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </div>
            <Toggle on={limitOn} onChange={setLimitOn} title="Tiempo total por estudiante" text="Cuenta desde que presiona “Comenzar”. Al terminar, se entrega sola.">
              {limitOn && (
                <span className="flex items-center gap-2">
                  {numberInput(s.time_limit_min, (v) => setS({ ...s, time_limit_min: v }), 'Minutos', 360)}
                  <span className="text-sm font-semibold">min</span>
                </span>
              )}
            </Toggle>
          </Section>
        )}

        {exam && (
          <Section title="Anti-copia">
            {!act?.fixedBoard && (
            <Toggle
              on={pickOn}
              onChange={(v) => {
                setPickOn(v)
                if (v && !s.pick_count) setS({ ...s, pick_count: n ? Math.max(1, Math.min(n, Math.round(n * 0.6))) : 10 })
              }}
              icon={<Shuffle className="size-5" />}
              title={act ? 'Palabras al azar' : 'Preguntas al azar'}
              text={act ? `Cada estudiante juega con palabras distintas${n ? ` de las ${n} de la actividad` : ''}.` : `Cada estudiante recibe preguntas distintas${n ? ` de las ${n} de esta evaluación` : ''}.`}
            >
              {pickOn && numberInput(s.pick_count, (v) => setS({ ...s, pick_count: v }), 'Cantidad de preguntas', n ?? 500)}
            </Toggle>
            )}
            {!act && (
              <>
                <Toggle on={!!s.shuffle_questions} onChange={(v) => setS({ ...s, shuffle_questions: v })} title="Mezclar el orden de las preguntas" text="Cada estudiante las ve en distinto orden." />
                <Toggle on={!!s.shuffle_options} onChange={(v) => setS({ ...s, shuffle_options: v })} title="Mezclar las opciones" text="La primera opción de uno no es la primera de su compañero." />
              </>
            )}
            {s.identification === 'roster' && (
              <Toggle on={s.require_ci} onChange={(v) => setS({ ...s, require_ci: v })} icon={<IdCard className="size-5" />} title="Pedir los últimos 3 dígitos del CI" text="Evita que alguien entre con el RU de un compañero." />
            )}
            <Toggle
              on={!!s.focus_mode}
              onChange={(v) => setS({ ...s, focus_mode: v })}
              icon={<Maximize className="size-5" />}
              title="Modo enfoque"
              text="Pantalla completa y registro de cada salida de la pestaña. Sin copiar, pegar ni clic derecho."
            />
            {s.focus_mode && (
              <Select label="Si sale de la pestaña…" value={String(s.lock_after ?? 0)} onChange={(e) => setS({ ...s, lock_after: Number(e.target.value) })}>
                <option value="0">Solo registrar y avisarme</option>
                <option value="2">Bloquear al salir 2 veces (usted lo desbloquea)</option>
                <option value="3">Bloquear al salir 3 veces (usted lo desbloquea)</option>
                <option value="5">Bloquear al salir 5 veces (usted lo desbloquea)</option>
              </Select>
            )}
          </Section>
        )}

        {exam && (
          <Section title="Resultados">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Intentos" hint="Cuenta el mejor intento." value={String(s.max_attempts ?? 1)} onChange={(e) => setS({ ...s, max_attempts: Number(e.target.value) })}>
                {[1, 2, 3, 5, 10].map((k) => (
                  <option key={k} value={k}>
                    {k === 1 ? '1 intento' : `${k} intentos`}
                  </option>
                ))}
              </Select>
              <Select label={act ? 'Mostrar la respuesta al fallar una palabra' : 'Mostrar las respuestas correctas'} value={s.show_correct} onChange={(e) => setS({ ...s, show_correct: e.target.value as ShowCorrect })}>
                {(Object.keys(SHOW_CORRECT_LABEL) as ShowCorrect[]).map((k) => (
                  <option key={k} value={k}>
                    {SHOW_CORRECT_LABEL[k]}
                  </option>
                ))}
              </Select>
            </div>
            <Toggle on={!!s.show_grade} onChange={(v) => setS({ ...s, show_grade: v })} icon={<Eye className="size-5" />} title="El estudiante ve su nota al entregar" text="Si lo apaga, solo verá “Entregado”." />
            {s.show_correct !== 'after_close' && s.show_correct !== 'never' && (
              <p className="flex items-start gap-2 rounded-2xl bg-uap-gold/15 p-3 text-sm">
                <Lock className="mt-0.5 size-4 shrink-0" /> Ojo: si las correctas se ven antes del cierre, quien entrega primero podría pasarlas a sus compañeros.
              </p>
            )}
          </Section>
        )}

        {mode === 'live' && (
          <>
            {s.identification === 'roster' && (
              <Toggle on={s.require_ci} onChange={(v) => setS({ ...s, require_ci: v })} icon={<IdCard className="size-5" />} title="Pedir los últimos 3 dígitos del CI" text="Evita que alguien entre con el RU de un compañero." />
            )}
            <Toggle on={s.show_ranking} onChange={(v) => setS({ ...s, show_ranking: v })} icon={<Trophy className="size-5" />} title="Mostrar ranking entre preguntas" text="Si lo apaga, se pasa directo a la siguiente pregunta." />
            <Toggle on={s.allow_late_join} onChange={(v) => setS({ ...s, allow_late_join: v })} title="Permitir que entren tarde" text="Quien llegue tarde juega desde la pregunta actual." />
          </>
        )}

        {s.identification === 'roster' && items.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-uap-gold/60 bg-uap-gold/10 p-3">
            <p className="font-display font-black">¿A qué nota va?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Parcial">
              {terms.map((t) => (
                <button key={t} role="radio" aria-checked={curTerm === t} onClick={() => pickRubro(t, null)} className={cn('rounded-xl border-2 px-3 py-1 text-sm font-bold', curTerm === t ? 'border-uap-green bg-uap-green/15' : 'border-line bg-surface')}>
                  {TERM_LABEL(t)}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rubro">
              {(['clase', 'casa'] as const).map((k) => {
                const it = findItem(curTerm, k)
                return (
                  <button
                    key={k}
                    role="radio"
                    disabled={!it}
                    aria-checked={!!it && s.grading_item_id === it.id}
                    onClick={() => pickRubro(null, k)}
                    className={cn('rounded-2xl border-2 p-3 text-left disabled:opacity-40', it && s.grading_item_id === it.id ? 'border-uap-green bg-uap-green/15' : 'border-line bg-surface hover:border-uap-gold')}
                  >
                    <span className="block font-display font-black">{k === 'clase' ? '📝 Ejercicio de clase' : '🏠 Práctica para casa'}</span>
                    <span className="text-xs text-ink-soft">{it ? `${it.category} · ${it.weight} pts` : 'No está en su plan de calificación'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {s.identification === 'roster' && items.length > 0 && (
          <Select
            label="Otro rubro (o sin nota)"
            hint="La nota de cada estudiante pasa a este rubro en Reportes → Notas."
            value={s.grading_item_id ?? ''}
            onChange={(e) => {
              setRubroTouched(true)
              setS({ ...s, grading_item_id: e.target.value || null })
            }}
          >
            <option value="">— Solo práctica, sin nota —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {TERM_LABEL(i.term)} · {i.category} ({i.weight} pts)
              </option>
            ))}
          </Select>
        )}
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-3xl border border-line p-4">
      <legend className="px-2 font-display text-sm font-bold uppercase tracking-wider text-ink-soft">{title}</legend>
      {children}
    </fieldset>
  )
}

function Choice({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex flex-col gap-1 rounded-2xl border-2 p-4 text-left transition-colors', on ? 'border-uap-green bg-uap-green/10' : 'border-line hover:border-uap-green/40')}
      aria-pressed={on}
    >
      <span className={cn('flex items-center gap-2 font-display font-bold', on && 'text-uap-green dark:text-game-selva')}>
        {icon} {title}
      </span>
      <span className="text-sm text-ink-soft">{text}</span>
    </button>
  )
}

function Toggle({ on, onChange, icon, title, text, children }: { on: boolean; onChange: (v: boolean) => void; icon?: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line p-3">
      <label className="flex flex-1 cursor-pointer items-center gap-4">
        <span className="flex-1">
          <span className="flex items-center gap-2 font-semibold">
            {icon} {title}
          </span>
          <span className="block text-sm text-ink-soft">{text}</span>
        </span>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="relative order-last h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-uap-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-uap-blue" />
      </label>
      {children}
    </div>
  )
}
