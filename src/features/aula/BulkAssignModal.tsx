import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Loader2, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useGradingPlan } from '../../lib/api/academic'
import { createSession, type SessionSettings } from '../../lib/api/live'
import { useQuizzes, useSubjectsLite } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { mailNow } from '../../lib/sheets'
import { supabase } from '../../lib/supabase'
import { TERM_LABEL } from '../academic/gradingDefaults'
import { activityOf } from '../activities/ActivitiesPage'
import { ACTIVITY_META } from '../activities/types'
import { launchHint } from '../sessions/LaunchModal'

const pad = (n: number) => String(n).padStart(2, '0')
const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Asigna varias actividades de una vez como tarea: los estudiantes las ven todas en «Mi aula». */
export function BulkAssignModal({ open, onClose, subjectId: initialSubject }: { open: boolean; onClose: () => void; subjectId?: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const quizzes = useQuizzes()
  const subjects = useSubjectsLite()
  const [subjectId, setSubjectId] = useState(initialSubject ?? '')
  const subj = subjectId || subjects.data?.[0]?.id || ''
  const plan = useGradingPlan(subj)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [opens, setOpens] = useState(() => toLocal(new Date()))
  const [closes, setCloses] = useState(() => {
    const d = new Date(Date.now() + 7 * 864e5)
    d.setHours(23, 59, 0, 0)
    return toLocal(d)
  })
  const [attempts, setAttempts] = useState(2)
  const [kind, setKind] = useState<'auto' | 'casa' | 'clase' | 'inv' | 'none'>('auto')
  const [term, setTerm] = useState<number | null>(() => Number(localStorage.getItem('yq-term') ?? '') || null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const acts = useMemo(
    () => (quizzes.data ?? []).filter((z) => activityOf(z) && z.status !== 'archived' && z.subject_id === subj && (z.questions?.[0]?.count ?? 0) > 0).sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true })),
    [quizzes.data, subj],
  )
  const openSessions = useQuery({
    queryKey: ['open-sessions', subj],
    enabled: !!subj && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('sessions').select('quiz_id, scheduled_end, status').eq('subject_id', subj).neq('status', 'finished')
      if (error) throw new Error(error.message)
      const now = Date.now()
      return new Set((data ?? []).filter((s) => !s.scheduled_end || new Date(s.scheduled_end).getTime() > now).map((s) => s.quiz_id as string))
    },
  })
  const assigned = openSessions.data ?? new Set<string>()
  const items = (plan.data?.grading_items ?? []).filter((i) => i.source === 'yaguarquiz')
  const terms = [...new Set(items.map((i) => i.term))].sort((a, b) => a - b)
  const curTerm = term != null && terms.includes(term) ? term : (terms[terms.length - 1] ?? null)
  const findRubro = (k: 'casa' | 'clase' | 'inv') =>
    items.find((i) => i.term === curTerm && (k === 'clase' ? /ejercicio|clase/i.test(i.category) && !/casa/i.test(i.category) : k === 'inv' ? /investigaci/i.test(i.category) : /pr[aá]ctica/i.test(i.category)))
  const rubro = kind === 'none' || kind === 'auto' ? null : findRubro(kind)
  /** rubro de cada actividad: en «automático», el que trae la actividad (clase, casa o investigación) */
  const rubroOf = (z: (typeof acts)[number]) => {
    if (kind === 'none') return null
    const k = activityOf(z) === 'research' ? 'inv' : kind === 'auto' ? (launchHint(z.settings)?.rubro ?? 'casa') : kind
    return findRubro(k) ?? null
  }
  const invRubro = findRubro('inv')

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const pending = acts.filter((z) => !assigned.has(z.id))

  async function assign() {
    const o = new Date(opens)
    const c = new Date(closes)
    if (!(c > o) || c <= new Date()) return toast.error('Revise las fechas', 'El cierre tiene que ser después de la apertura y en el futuro.')
    const list = acts.filter((z) => picked.has(z.id))
    if (!list.length) return
    if (term != null) localStorage.setItem('yq-term', String(term))
    setProgress({ done: 0, total: list.length })
    let fails = 0
    for (const [i, z] of list.entries()) {
      const hint = launchHint(z.settings)
      const settings: SessionSettings = {
        mode: 'homework',
        identification: 'roster',
        require_ci: false,
        show_ranking: false,
        allow_late_join: true,
        grading_item_id: rubroOf(z)?.id ?? null,
        opens_at: o.toISOString(),
        closes_at: c.toISOString(),
        time_limit_min: activityOf(z) === 'research' ? null : (hint?.time_limit_min ?? 20),
        max_attempts: kind === 'auto' ? (hint?.max_attempts ?? attempts) : attempts,
        pick_count: hint?.pick_count ?? null,
        shuffle_questions: true,
        shuffle_options: true,
        show_correct: 'after_close',
        show_grade: true,
        focus_mode: true,
        lock_after: 0,
      }
      try {
        await createSession(z.id, subj, settings)
      } catch {
        fails++
      }
      setProgress({ done: i + 1, total: list.length })
    }
    void mailNow().catch(() => null)
    await qc.invalidateQueries()
    setProgress(null)
    setPicked(new Set())
    if (fails) toast.error(`No se pudieron asignar ${fails}`, 'Intente de nuevo con esas actividades.')
    else toast.success(`${list.length} actividades asignadas`, 'Los estudiantes ya las ven en su aula y les llega un solo correo con todas.')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={progress ? () => {} : onClose}
      size="lg"
      title="Asignar actividades"
      subtitle="Todas quedan en el aula del estudiante: entra una vez con su RU y las hace cuando quiera, hasta el cierre."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!progress}>
            Cancelar
          </Button>
          <Button onClick={() => void assign()} disabled={!picked.size || !!progress}>
            {progress ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Asignando {progress.done}/{progress.total}…
              </>
            ) : (
              `Asignar ${picked.size || ''} ${picked.size === 1 ? 'actividad' : 'actividades'}`
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!initialSubject && (
          <Select label="Asignatura" value={subj} onChange={(e) => setSubjectId(e.target.value)}>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name} ({s.parallel})
              </option>
            ))}
          </Select>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="flex-1 font-display font-black">¿Cuáles? ({picked.size} de {acts.length})</p>
            <Button size="sm" variant="secondary" onClick={() => setPicked(new Set(pending.map((z) => z.id)))}>
              Todas las no asignadas ({pending.length})
            </Button>
            {picked.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                Ninguna
              </Button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-line">
            {acts.map((z) => {
              const t = activityOf(z)!
              const m = ACTIVITY_META[t]
              const on = picked.has(z.id)
              const already = assigned.has(z.id)
              return (
                <button
                  key={z.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(z.id)}
                  className={cn('flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0', on ? 'bg-uap-green/10' : 'hover:bg-surface-2')}
                >
                  {on ? <CheckSquare className="size-5 shrink-0 text-uap-green" /> : <Square className="size-5 shrink-0 text-ink-soft" />}
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: m.color }}>
                    <m.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{z.title}</span>
                    <span className="text-xs text-ink-soft">{m.label}</span>
                  </span>
                  {already && <span className="shrink-0 rounded-lg bg-uap-gold/20 px-2 py-0.5 text-xs font-bold">Ya está abierta</span>}
                </button>
              )
            })}
            {!acts.length && <p className="p-4 text-center text-sm text-ink-soft">Esta asignatura no tiene actividades listas.</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="datetime-local" label="Se abren" value={opens} onChange={(e) => setOpens(e.target.value)} />
          <Input type="datetime-local" label="Se cierran" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border-2 border-uap-gold/60 bg-uap-gold/10 p-3">
          <p className="font-display font-black">¿A qué nota van?</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Parcial">
            {terms.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={curTerm === t} onClick={() => setTerm(t)} className={cn('rounded-xl border-2 px-3 py-1 text-sm font-bold', curTerm === t ? 'border-uap-green bg-uap-green/15' : 'border-line bg-surface')}>
                {TERM_LABEL(t)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rubro">
            {(
              [
                ['auto', '✨ Automático (según cada actividad)'],
                ['casa', '🏠 Práctica para casa'],
                ['clase', '📝 Ejercicio de clase'],
                ['inv', '🔎 Investigación para casa'],
                ['none', 'Sin nota (solo práctica)'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('rounded-2xl border-2 p-2 text-sm font-bold', kind === k ? 'border-uap-green bg-uap-green/15' : 'border-line bg-surface hover:border-uap-gold')}>
                {l}
              </button>
            ))}
          </div>
          {kind === 'auto' && (
            <p className="text-xs text-ink-soft">
              📝 Clase → «Ejercicios en clase» (1 intento) · 🏠 Casa → «Prácticas para casa» (2 intentos) · 🔎 Investigación → «Investigaciones para casa» (sin límite de tiempo, la califica usted).
            </p>
          )}
          {kind !== 'none' && kind !== 'auto' && !rubro && <p className="text-xs font-semibold text-uap-red">Ese rubro no está en el plan de calificación de este parcial.</p>}
          {kind !== 'none' && acts.some((z) => picked.has(z.id) && activityOf(z) === 'research') && (
            <p className="text-xs text-ink-soft">Las investigaciones marcadas van a «{invRubro?.category ?? 'Investigaciones para casa'}» y no tienen límite de tiempo.</p>
          )}
        </div>

        <div className={cn('flex flex-wrap items-center gap-3 text-sm', kind === 'auto' && 'hidden')}>
          <span className="font-semibold">Intentos por estudiante</span>
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" onClick={() => setAttempts(n)} className={cn('h-10 w-10 rounded-xl border-2 font-display font-black', attempts === n ? 'border-uap-green bg-uap-green/15' : 'border-line')}>
              {n}
            </button>
          ))}
          <span className="text-xs text-ink-soft">Cuenta el mejor. Cada una con su tiempo sugerido, preguntas al azar y modo enfoque.</span>
        </div>
      </div>
    </Modal>
  )
}
