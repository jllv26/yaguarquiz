import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Copy, Gamepad2, Pencil, Rocket, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { saveActivity } from '../../lib/api/activities'
import { qkq, useDeleteQuiz, useDuplicateQuiz, useQuizzes, useSaveQuiz, useSubjectsLite, type QuizListRow } from '../../lib/api/quizzes'
import { LaunchModal, launchHint } from '../sessions/LaunchModal'
import { ACTIVITY_META, ACTIVITY_TYPES, type ActivitySettings, type ActivityType } from './types'

export const activityOf = (z: { settings?: Record<string, unknown> | null }) => (z.settings?.activity as ActivitySettings | undefined)?.type ?? null

/** Actividades estilo Educaplay: crucigrama, sopa de letras, relacionar, memoria… */
export function ActivitiesPage() {
  const quizzes = useQuizzes()
  const [creating, setCreating] = useState<ActivityType | null>(null)
  const list = useMemo(() => (quizzes.data ?? []).filter((z) => activityOf(z) && z.status !== 'archived'), [quizzes.data])

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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ y: -3 }}
                onClick={() => setCreating(t)}
                className="group flex flex-col items-start gap-2 rounded-3xl bg-surface-2 p-4 text-left shadow-sm ring-1 ring-line transition-shadow hover:shadow-lg"
              >
                <span className="grid size-12 place-items-center rounded-2xl text-white shadow-md transition-transform group-hover:rotate-[-6deg]" style={{ background: m.color }}>
                  <m.icon className="size-6" />
                </span>
                <span className="font-display font-black leading-tight">{m.label}</span>
                <span className="text-xs text-ink-soft">{m.description}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      <section aria-label="Mis actividades" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Mis actividades</h2>
        {quizzes.isLoading ? (
          <Skeleton className="h-40" />
        ) : !list.length ? (
          <EmptyState icon={<Gamepad2 className="size-8" />} title="Aún no tiene actividades" text="Elija un tipo de juego arriba, escriba sus palabras y láncelo como tarea." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((z) => (
              <ActivityCard key={z.id} z={z} />
            ))}
          </div>
        )}
      </section>
      <NewActivityModal type={creating} onClose={() => setCreating(null)} />
    </div>
  )
}

function ActivityCard({ z }: { z: QuizListRow }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const dup = useDuplicateQuiz()
  const del = useDeleteQuiz()
  const [launch, setLaunch] = useState(false)
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
        <Badge tone={ready ? 'green' : 'gold'}>{ready ? 'Lista' : `Faltan palabras (mín. ${m.min})`}</Badge>
        {z.topics && <Badge tone="blue">{z.topics.name}</Badge>}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="font-display text-2xl font-black">
          {n} <span className="text-sm font-semibold text-ink-soft">{type === 'fill_text' ? 'espacios' : type === 'memory' || type === 'matching' ? 'parejas' : 'palabras'}</span>
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
