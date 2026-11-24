import { ActivityBadge } from './ActivityBadge'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Copy, Gamepad2, KeyRound, ListChecks, Pencil, Printer, Rocket, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/cn'
import { fetchActivityItems, saveActivity } from '../../lib/api/activities'
import { qkq, useDeleteQuiz, useDuplicateQuiz, useQuizzes, useSaveQuiz, useSubjectsLite, type QuizListRow } from '../../lib/api/quizzes'
import { LaunchModal, launchHint } from '../sessions/LaunchModal'
import { BulkAssignModal } from '../aula/BulkAssignModal'
import { ACTIVITY_META, ACTIVITY_TYPES, type ActivityItem, type ActivitySettings, type ActivityType } from './types'

export const activityOf = (z: { settings?: Record<string, unknown> | null }) => (z.settings?.activity as ActivitySettings | undefined)?.type ?? null

/** Actividades estilo Educaplay: crucigrama, sopa de letras, relacionar, memoria… */
export function ActivitiesPage() {
  const quizzes = useQuizzes()
  const [creating, setCreating] = useState<ActivityType | null>(null)
  const [bulk, setBulk] = useState(false)
  const list = useMemo(() => (quizzes.data ?? []).filter((z) => activityOf(z) && z.status !== 'archived'), [quizzes.data])
  const open = useOpenAssignments()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">Actividades</h1>
        <p className="text-ink-soft">Juegos de práctica y evaluación estilo Educaplay. Se aplican como tarea o en el laboratorio y la nota va a su libreta.</p>
      </header>

      <section aria-label="Crear una actividad">
        <h2 className="mb-3 font-display text-lg font-bold">Crear una actividad nueva</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ACTIVITY_TYPES.map((t, i) => {
            const m = ACTIVITY_META[t]
            return (
              <motion.button
                key={t}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.035, type: 'spring', stiffness: 320, damping: 24 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setCreating(t)}
                className="group flex flex-col items-start gap-2 rounded-3xl bg-surface-2 p-4 text-left shadow-sm ring-1 ring-line transition-shadow hover:shadow-lg"
              >
                <ActivityBadge type={t} />
                <span className="font-display font-black leading-tight">{m.label}</span>
                <span className="text-xs text-ink-soft">{m.description}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      <section aria-label="Mis actividades" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-display text-lg font-bold">Mis actividades</h2>
          {list.length > 0 && (
            <Button size="sm" onClick={() => setBulk(true)}>
              <ListChecks className="size-4" /> Asignar varias
            </Button>
          )}
        </div>
        {quizzes.isLoading ? (
          <Skeleton className="h-40" />
        ) : !list.length ? (
          <EmptyState icon={<Gamepad2 className="size-8" />} title="Aún no tiene actividades" text="Elija un tipo de juego arriba, escriba sus palabras y láncelo como tarea." />
        ) : (
          <div className="flex flex-col gap-6">
            {RUBROS.map((r) => {
              const group = list.filter((z) => rubroOf(z) === r.key).sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true }))
              if (!group.length) return null
              return (
                <div key={r.key} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 border-b-2 pb-1" style={{ borderColor: r.color }}>
                    <h3 className="font-display text-xl font-black" style={{ color: r.color }}>
                      {r.emoji} {r.label} <span className="text-base text-ink-soft">({group.length})</span>
                    </h3>
                    <p className="text-sm text-ink-soft">{r.hint}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.map((z) => (
                      <ActivityCard key={z.id} z={z} assigned={open.data?.get(z.id) ?? null} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <NewActivityModal type={creating} onClose={() => setCreating(null)} />
      {bulk && <BulkAssignModal open onClose={() => setBulk(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------ rubros (a qué nota va cada actividad)
type RubroKey = 'clase' | 'casa' | 'inv' | 'otra'
const RUBROS: { key: RubroKey; emoji: string; label: string; short: string; color: string; hint: string }[] = [
  { key: 'clase', emoji: '📝', label: 'Ejercicios en clase', short: 'Ejercicio en clase', color: '#1d5fd6', hint: 'Van a «Ejercicios en clase» · 1 intento · 10–12 min · para hacer en la clase' },
  { key: 'casa', emoji: '🏠', label: 'Prácticas para casa', short: 'Práctica para casa', color: '#1B7339', hint: 'Van a «Prácticas para casa» · 2 intentos (cuenta el mejor) · 15–20 min' },
  { key: 'inv', emoji: '🔎', label: 'Investigaciones para casa', short: 'Investigación para casa', color: '#8B1A1A', hint: 'Van a «Investigaciones para casa» · un caso distinto por estudiante · las califica usted' },
  { key: 'otra', emoji: '🎲', label: 'Otras actividades', short: 'Sin rubro sugerido', color: '#4D4D4D', hint: 'Al asignarlas, usted elige a qué nota van' },
]
function rubroOf(z: QuizListRow): RubroKey {
  if (activityOf(z) === 'research') return 'inv'
  return launchHint(z.settings)?.rubro ?? 'otra'
}
/** Actividades asignadas que siguen abiertas: hasta cuándo y a qué nota van */
function useOpenAssignments() {
  return useQuery({
    queryKey: ['open-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('quiz_id, scheduled_end, status, grading_items(category, term)')
        .neq('status', 'finished')
        .neq('mode', 'live')
      if (error) throw new Error(error.message)
      const now = Date.now()
      const m = new Map<string, { closes: string | null; category: string | null; term: number | null }>()
      for (const r of (data ?? []) as unknown as { quiz_id: string; scheduled_end: string | null; grading_items: { category: string; term: number } | null }[]) {
        if (r.scheduled_end && new Date(r.scheduled_end).getTime() <= now) continue
        m.set(r.quiz_id, { closes: r.scheduled_end, category: r.grading_items?.category ?? null, term: r.grading_items?.term ?? null })
      }
      return m
    },
  })
}

function ActivityCard({ z, assigned }: { z: QuizListRow; assigned: { closes: string | null; category: string | null; term: number | null } | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const dup = useDuplicateQuiz()
  const del = useDeleteQuiz()
  const [launch, setLaunch] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const type = activityOf(z)!
  const m = ACTIVITY_META[type]
  const n = z.questions?.[0]?.count ?? 0
  const ready = n >= m.min

  return (
    <SolidCard className="relative flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: m.color }} />
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: m.color }}>
          <m.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <button onClick={() => navigate(`/admin/actividades/${z.id}`)} className="text-left font-display text-lg font-bold leading-snug hover:underline">
            {z.title}
          </button>
          <p className="text-sm text-ink-soft">
            {m.label}
            {z.subjects ? ` · ${z.subjects.code} (${z.subjects.parallel})` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(() => {
          const r = RUBROS.find((x) => x.key === rubroOf(z))!
          return (
            <span className="rounded-lg px-2 py-0.5 text-xs font-bold text-white" style={{ background: r.color }}>
              {r.emoji} {r.short}
            </span>
          )
        })()}
        {variety(z) && <Badge tone="blue">{variety(z)}</Badge>}
        {!ready && <Badge tone="gold">{`Faltan palabras (mín. ${m.min})`}</Badge>}
        {z.topics && <Badge tone="blue">{z.topics.name}</Badge>}
      </div>
      <p className={cn('rounded-xl px-3 py-1.5 text-xs font-semibold', assigned ? 'bg-uap-green/10 text-uap-green' : 'bg-ink/5 text-ink-soft')}>
        {assigned
          ? `✅ Asignada${assigned.closes ? ` hasta el ${new Date(assigned.closes).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''} · nota a «${assigned.category ?? 'sin rubro'}${assigned.term ? ` · ${assigned.term}.er parcial` : ''}»`
          : '⏳ Todavía sin asignar'}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="font-display text-2xl font-black">
          {n} <span className="text-sm font-semibold text-ink-soft">{type === 'fill_text' ? 'espacios' : type === 'memory' || type === 'matching' ? 'parejas' : type === 'research' ? 'preguntas' : type === 'classify' ? 'tarjetas' : type === 'sentence' ? 'frases' : 'palabras'}</span>
        </span>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Duplicar"
            onClick={() =>
              void dup
                .mutateAsync(z.id)
                .then((id) => navigate(`/admin/actividades/${id}`))
                .catch((e: Error) => toast.error('No se pudo duplicar', e.message))
            }
          >
            <Copy className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Eliminar"
            onClick={() =>
              void (async () => {
                if (await confirm({ title: `¿Eliminar "${z.title}"?`, message: 'Se borran sus palabras, sesiones y resultados.', confirmText: 'Eliminar', danger: true }))
                  await del.mutateAsync(z.id).then(() => toast.success('Actividad eliminada'))
              })()
            }
          >
            <Trash2 className="size-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setKeyOpen(true)} aria-label="Ver las respuestas correctas">
            <KeyRound className="size-4" /> Respuestas
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/actividades/${z.id}`)}>
            <Pencil className="size-4" /> Editar
          </Button>
          {ready && (
            <Button size="sm" variant="success" onClick={() => setLaunch(true)}>
              <Rocket className="size-4" /> Lanzar
            </Button>
          )}
        </div>
      </div>
      {keyOpen && <AnswerKeyModal quizId={z.id} title={z.title} type={type} act={(z.settings?.activity as ActivitySettings | undefined) ?? null} onClose={() => setKeyOpen(false)} />}
      <LaunchModal open={launch} onClose={() => setLaunch(false)} quiz={launch ? { id: z.id, title: z.title, subject_id: z.subject_id, questionCount: n, activity: type, launch: launchHint(z.settings) } : null} />
    </SolidCard>
  )
}

function NewActivityModal({ type, onClose }: { type: ActivityType | null; onClose: () => void }) {
  const subjects = useSubjectsLite()
  const save = useSaveQuiz()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [f, setF] = useState({ title: '', subject_id: '', topic_id: '' })
  const m = type ? ACTIVITY_META[type] : null
  const list = subjects.data ?? []
  const topics = [...(list.find((s) => s.id === f.subject_id)?.topics ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!type) return
    if (!f.title.trim()) return toast.error('Escriba el título de la actividad')
    if (!f.subject_id) return toast.error('Elija la asignatura')
    try {
      const q = await save.mutateAsync({ ...f, status: 'published' })
      await saveActivity(q.id, { type, ...(type === 'wordsearch' ? { show_words: true, difficulty: 'media' } : {}), ...(type === 'fill_text' ? { word_bank: true } : {}) }, [])
      void qc.invalidateQueries({ queryKey: qkq.quizzes })
      onClose()
      setF({ title: '', subject_id: f.subject_id, topic_id: '' })
      navigate(`/admin/actividades/${q.id}`)
    } catch (err) {
      toast.error('No se pudo crear', (err as Error).message)
    }
  }

  return (
    <Modal
      open={!!type}
      onClose={onClose}
      title={m ? `Nueva actividad: ${m.label}` : ''}
      subtitle={m?.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="act-form" disabled={save.isPending}>
            Crear y escribir las palabras
          </Button>
        </>
      }
    >
      <form id="act-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={`Ej. ${m?.short ?? ''} de la Unidad 1`} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Asignatura" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value, topic_id: '' })}>
            <option value="">— Elija —</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} ({s.parallel}) · {s.name}
              </option>
            ))}
          </Select>
          <Select label="Tema (opcional)" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })} disabled={!topics.length}>
            <option value="">{topics.length ? '— Sin tema —' : 'Sin temas'}</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.unit ? `${t.unit} · ` : ''}
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        {m && <p className="rounded-2xl bg-uap-gold/10 p-3 text-sm">💡 {m.tip}</p>}
      </form>
    </Modal>
  )
}

/** Hoja de respuestas solo para el docente (los estudiantes nunca la ven mientras la actividad está abierta). */
function AnswerKeyModal({ quizId, title, type, act, onClose }: { quizId: string; title: string; type: ActivityType; act: ActivitySettings | null; onClose: () => void }) {
  const items = useQuery({ queryKey: ['activity-key', quizId], queryFn: () => fetchActivityItems(quizId) })
  const versions = type !== 'research' ? (act?.variants ?? []) : []
  // con versiones de texto (cálculos), cada versión tiene sus propias respuestas
  const versionOf = (i: number) => (['fill_text', 'map', 'dialogue'].includes(type) ? versions.findIndex((v) => v.pos?.includes(i)) : -1)
  const m = ACTIVITY_META[type]
  const showGroup = type === 'classify' || type === 'rosco'
  // qué se muestra en cada columna según el tipo
  const keyClue = (it: ActivityItem) =>
    type === 'classify' || type === 'research' || type === 'yesno'
      ? it.term
      : type === 'riddle'
        ? (it.extra?.clues ?? []).join(' · ')
        : type === 'slides'
          ? it.term
          : type === 'video'
            ? `[${Math.floor((it.extra?.t ?? 0) / 60)}:${String(Math.floor((it.extra?.t ?? 0) % 60)).padStart(2, '0')}] ${it.prompt}`
            : it.prompt
  const keyAnswer = (it: ActivityItem) =>
    type === 'classify' || type === 'yesno' ? (it.group ?? '') : type === 'rows' ? it.term.split(/\s*\|\s*/).join(' → ') : type === 'slides' ? '(se lee)' : it.term
  const clueLabel = type === 'yesno' ? 'Tarjeta' : type === 'riddle' ? 'Pistas' : type === 'rows' ? 'Fila' : type === 'slides' ? 'Diapositiva' : type === 'map' ? 'Descripción' : type === 'classify' ? 'Tarjeta' : type === 'matching' || type === 'memory' ? 'Pareja' : type === 'fill_text' ? 'Espacio' : type === 'research' ? 'Pregunta' : 'Pista'
  function print() {
    const rows = (items.data ?? [])
      .map((it, i) => `<tr><td>${i + 1}</td><td>${versionOf(i) >= 0 ? `Versión ${versionOf(i) + 1}` : ''}${esc(keyClue(it))}</td><td><b>${esc(keyAnswer(it))}</b>${it.extra?.wrong?.length ? `<br><small>Incorrectas: ${esc(it.extra.wrong.join(' · '))}</small>` : ''}${it.extra?.alt?.length ? `<br><small>También vale: ${esc(it.extra.alt.join(' · '))}</small>` : ''}</td></tr>`)
      .join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Respuestas · ${esc(title)}</title><style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}</style><h2>Hoja de respuestas · ${esc(title)}</h2><p>${esc(m.label)} · uso exclusivo del docente</p><table><tr><th>#</th><th>${clueLabel}</th><th>Respuesta correcta</th></tr>${rows}</table>`)
    w.document.close()
    w.print()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Respuestas correctas"
      subtitle={`${title} · solo para usted`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={print} disabled={!items.data?.length}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-2xl bg-uap-gold/15 px-4 py-2 text-sm">
        🔒 Los estudiantes ven si aciertan o fallan, pero la respuesta correcta recién cuando usted cierra la actividad. Cada estudiante recibe sus propias preguntas al azar; lo que le tocó y lo que respondió cada uno está en <b>Reportes</b> → la sesión.
      </p>
      {versions.length > 0 && (
        <p className="mb-3 rounded-2xl bg-uap-blue/10 px-4 py-2 text-sm">
          🔀 Tiene <b>{versions.length} versiones</b>: a cada estudiante le toca una al azar
          {type === 'fill_text'
            ? ' (con otros números). Abajo, las respuestas de cada versión.'
            : type === 'map'
              ? ' (otra imagen, con sus propios puntos). Abajo, los puntos de cada versión.'
              : type === 'dialogue'
                ? ' (otra conversación, con sus propias preguntas). Abajo, las preguntas de cada versión.'
                : `, con ${versions[0]?.pos?.length ?? '?'} palabras de este banco.`}
        </p>
      )}
      {type === 'research' && act && (
        <div className="mb-3 flex flex-col gap-2 text-sm">
          <p className="rounded-2xl bg-uap-red/10 px-4 py-2">
            🔎 La investigación no tiene respuestas correctas fijas: usted califica cada criterio en <b>Reportes → la sesión → Calificar investigaciones</b>.
          </p>
          <p>
            <b>Criterios:</b> {(act.criteria ?? []).map((c) => c.title).join(' · ')}
          </p>
          <details>
            <summary className="cursor-pointer font-bold">Casos ({act.variants?.length ?? 0}): uno distinto para cada estudiante</summary>
            <ol className="mt-1 list-decimal pl-6">
              {(act.variants ?? []).map((v, k) => (
                <li key={k}>{v.case?.title}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
      {items.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">{clueLabel}</th>
                <th className="px-2 py-1">Respuesta correcta</th>
              </tr>
            </thead>
            <tbody>
              {(items.data ?? []).map((it, i) => (
                <tr key={it.id ?? i} className="border-t border-line align-top">
                  <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    {versionOf(i) >= 0 && <span className="mr-1 rounded-md bg-uap-blue/10 px-1.5 text-xs font-bold">Versión {versionOf(i) + 1}</span>}
                    {keyClue(it)}
                  </td>
                  <td className="px-2 py-1.5 font-display font-black">
                    {type === 'research' ? <span className="font-normal text-ink-soft">{it.prompt || '—'}</span> : keyAnswer(it)}
                    {it.extra?.wrong?.length ? <span className="block text-xs font-normal text-ink-soft">Incorrectas: {it.extra.wrong.join(' · ')}</span> : null}
                    {it.extra?.alt?.length ? <span className="block text-xs font-normal text-uap-green">También vale: {it.extra.alt.join(' · ')}</span> : null}
                    {showGroup && type === 'rosco' && it.group ? <span className="ml-1 text-xs font-normal text-ink-soft">({it.contains ? 'contiene' : 'empieza con'} {it.group})</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** Cuánto cambia para cada estudiante (para que el docente lo vea de un vistazo) */
function variety(z: QuizListRow): string | null {
  const act = z.settings?.activity as ActivitySettings | undefined
  const n = z.questions?.[0]?.count ?? 0
  const pick = launchHint(z.settings)?.pick_count
  if (act?.type === 'research') return act.variants?.length ? `${act.variants.length} casos distintos` : null
  if (act?.variants?.length) return `${act.variants.length} versiones distintas`
  if (act?.type === 'rosco' && pick) return `${n} pistas · 1 por letra al azar`
  if (pick && pick < n) return `${pick} al azar de ${n}`
  return null
}
