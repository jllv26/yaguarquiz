import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Select, Textarea } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useSaveQuiz, useSubjectsLite, type QuizRow } from '../../lib/api/quizzes'
import { asTheme, VISUAL_THEMES } from '../../lib/visualThemes'
import { cn } from '../../lib/cn'

/** Crear una evaluación nueva o editar sus datos generales. */
export function QuizSettingsModal({
  open,
  onClose,
  quiz,
  defaultSubjectId,
}: {
  open: boolean
  onClose: () => void
  quiz?: QuizRow
  defaultSubjectId?: string
}) {
  const subjects = useSubjectsLite()
  const save = useSaveQuiz()
  const toast = useToast()
  const navigate = useNavigate()
  const [f, setF] = useState({ title: '', subject_id: '', topic_id: '', description: '', visual_theme: 'amazonia' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? (quiz?.id ?? `new-${defaultSubjectId}`) : null
  if (key !== lastKey) {
    setLastKey(key)
    setF({
      title: quiz?.title ?? '',
      subject_id: quiz?.subject_id ?? defaultSubjectId ?? '',
      topic_id: quiz?.topic_id ?? '',
      description: quiz?.description ?? '',
      visual_theme: asTheme(quiz?.visual_theme),
    })
  }
  const list = subjects.data ?? []
  const subject = list.find((s) => s.id === f.subject_id)
  const topics = [...(subject?.topics ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) return toast.error('Escribe el título de la evaluación')
    if (!f.subject_id) return toast.error('Elige la asignatura')
    try {
      const saved = await save.mutateAsync({ id: quiz?.id, ...f, status: quiz?.status })
      toast.success(quiz ? 'Datos actualizados' : 'Evaluación creada', quiz ? undefined : 'Ahora agrega tus preguntas.')
      onClose()
      if (!quiz) navigate(`/admin/evaluaciones/${saved.id}`)
    } catch (err) {
      toast.error('No se pudo guardar', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={quiz ? 'Datos de la evaluación' : 'Nueva evaluación'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="quiz-form" disabled={save.isPending}>
            {quiz ? 'Guardar' : 'Crear y agregar preguntas'}
          </Button>
        </>
      }
    >
      <form id="quiz-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ej. Examen Unidad 1 — Ofimática" autoFocus />
        {!list.length && !subjects.isLoading ? (
          <p className="rounded-2xl bg-uap-gold/15 p-3 text-sm">Primero crea una asignatura en el menú “Asignaturas”.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Asignatura" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value, topic_id: '' })}>
              <option value="">— Elige —</option>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({s.parallel}) · {s.name} · {s.periods?.name}
                </option>
              ))}
            </Select>
            <Select label="Tema (opcional)" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })} disabled={!topics.length}>
              <option value="">{topics.length ? '— Sin tema —' : 'La asignatura no tiene temas'}</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unit ? `${t.unit} · ` : ''}
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Textarea label="Descripción (opcional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Tema visual (proyector y celulares)</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup">
            {VISUAL_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={f.visual_theme === t.id}
                onClick={() => setF({ ...f, visual_theme: t.id })}
                className={cn(
                  'flex flex-col overflow-hidden rounded-2xl border-2 text-left transition',
                  f.visual_theme === t.id ? 'border-uap-gold ring-2 ring-uap-gold/40' : 'border-line hover:border-ink-soft/40',
                )}
                title={t.hint}
              >
                <span className="h-12 w-full" style={{ background: t.swatch }} />
                <span className="px-2 py-1.5 text-xs font-bold">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">{VISUAL_THEMES.find((t) => t.id === f.visual_theme)?.hint}</p>
        </fieldset>
      </form>
    </Modal>
  )
}
