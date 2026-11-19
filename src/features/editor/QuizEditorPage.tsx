import { Reorder } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Database,
  Eye,
  FileSpreadsheet,
  GripVertical,
  Loader2,
  Plus,
  Radio,
  Rocket,
  Settings2,
  Undo2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import {
  copyQuestions,
  deleteQuestion,
  fetchQuestions,
  importQuestions,
  moveQuestions,
  reorderQuestions,
  saveQuestion,
  useQuestions,
  useQuiz,
  useSetQuizStatus,
} from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { exportQuizToExcel } from '../quizzes/quizExport'
import { newQuestion, QUESTION_TYPES, uid, validateQuestion, type EditorQuestion, type QuestionType } from '../quizzes/questionModel'
import { QuizSettingsModal } from '../quizzes/QuizSettingsModal'
import { LaunchModal } from '../sessions/LaunchModal'
import { BankModal, ImportQuestionsModal, MoveModal, PreviewModal } from './EditorModals'
import { QuestionCanvas } from './QuestionCanvas'
import { SettingsPanel } from './SettingsPanel'
import { TYPE_ICONS } from './typeIcons'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export function QuizEditorPage() {
  const { id = '' } = useParams()
  const quiz = useQuiz(id)
  const questions = useQuestions(id)
  if (quiz.isLoading || questions.isLoading) return <Skeleton className="h-[70dvh]" />
  if (!quiz.data)
    return (
      <EmptyState
        icon={<AlertCircle className="size-8" />}
        title="Evaluación no encontrada"
        action={
          <Link to="/admin/evaluaciones" className="font-semibold text-uap-green">
            Volver a evaluaciones
          </Link>
        }
      />
    )
  // las actividades (crucigrama, sopa…) tienen su propio editor
  if (quiz.data.settings?.activity) return <Navigate to={`/admin/actividades/${id}`} replace />
  return <Editor key={id} quiz={quiz.data} initial={questions.data ?? []} />
}

function Editor({ quiz, initial }: { quiz: NonNullable<ReturnType<typeof useQuiz>['data']>; initial: EditorQuestion[] }) {
  const toast = useToast()
  const confirm = useConfirm()
  const setStatus = useSetQuizStatus()
  const [qs, setQs] = useState<EditorQuestion[]>(initial)
  const [sel, setSel] = useState<string | undefined>(initial[0]?.key)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [modal, setModal] = useState<null | 'preview' | 'bank' | 'move' | 'import' | 'settings' | 'add'>(null)
  const [launchOpen, setLaunchOpen] = useState(false)

  const qsRef = useRef(qs)
  useEffect(() => {
    qsRef.current = qs
  }, [qs])
  const dirty = useRef(new Map<string, number>())
  const orderDirty = useRef(false)
  const ver = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const saving = useRef<Promise<void> | null>(null)

  const issues = useMemo(() => new Map(qs.map((q) => [q.key, validateQuestion(q)])), [qs])
  const totalIssues = [...issues.values()].filter((x) => x.length).length
  const current = qs.find((q) => q.key === sel) ?? qs[0]
  const currentIndex = current ? qs.indexOf(current) : -1

  // ------------------------------------------------------------ guardado
  const flush = useCallback(async function flushAll(): Promise<void> {
    if (saving.current) {
      await saving.current
      if (dirty.current.size || orderDirty.current) return flushAll()
      return
    }
    if (!dirty.current.size && !orderDirty.current) return
    const run = (async () => {
      setSaveState('saving')
      try {
        for (const [key, v] of [...dirty.current.entries()]) {
          const snap = qsRef.current.find((q) => q.key === key)
          if (!snap) {
            dirty.current.delete(key)
            continue
          }
          const res = await saveQuestion(snap, quiz.id)
          const optIds = new Map(snap.options.map((o, i) => [o.key, res.options[i]?.id]))
          setQs((list) =>
            list.map((q) =>
              q.key === key ? { ...q, id: res.id, options: q.options.map((o) => (optIds.get(o.key) ? { ...o, id: optIds.get(o.key) } : o)) } : q,
            ),
          )
          qsRef.current = qsRef.current.map((q) =>
            q.key === key ? { ...q, id: res.id, options: q.options.map((o) => (optIds.get(o.key) ? { ...o, id: optIds.get(o.key) } : o)) } : q,
          )
          if (dirty.current.get(key) === v) dirty.current.delete(key)
        }
        if (orderDirty.current) {
          orderDirty.current = false
          const ids = qsRef.current.map((q) => q.id).filter(Boolean) as string[]
          if (ids.length) await reorderQuestions(quiz.id, ids)
        }
        setSaveState(dirty.current.size ? 'dirty' : 'saved')
      } catch (e) {
        setSaveState('error')
        toast.error('No se pudo guardar', (e as Error).message)
      }
    })()
    saving.current = run
    await run
    saving.current = null
    if (dirty.current.size || orderDirty.current) {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flushAll(), 900)
    }
  }, [quiz.id, toast])

  const schedule = useCallback(() => {
    setSaveState('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 900)
  }, [flush])

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || orderDirty.current) {
        e.preventDefault()
        void flush()
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      void flush()
    }
  }, [flush])

  const update = (q: EditorQuestion) => {
    setQs((list) => list.map((x) => (x.key === q.key ? q : x)))
    dirty.current.set(q.key, ++ver.current)
    schedule()
  }

  const insertAfter = (q: EditorQuestion) => {
    setQs((list) => {
      const i = current ? list.findIndex((x) => x.key === current.key) : list.length - 1
      const next = [...list]
      next.splice(i + 1, 0, q)
      return next
    })
    setSel(q.key)
    dirty.current.set(q.key, ++ver.current)
    orderDirty.current = true
    schedule()
  }

  const addQuestion = (type: QuestionType) => {
    setModal(null)
    insertAfter(newQuestion(type))
  }

  const duplicate = () => {
    if (!current) return
    insertAfter({ ...current, id: undefined, key: uid(), options: current.options.map((o) => ({ ...o, id: undefined, key: uid() })) })
    toast.success('Pregunta duplicada')
  }

  async function remove() {
    if (!current) return
    const ok = await confirm({ title: '¿Eliminar esta pregunta?', message: current.prompt || 'Pregunta sin texto', confirmText: 'Eliminar', danger: true })
    if (!ok) return
    const i = qs.indexOf(current)
    dirty.current.delete(current.key)
    setQs((list) => list.filter((x) => x.key !== current.key))
    setSel(qs[i + 1]?.key ?? qs[i - 1]?.key)
    if (current.id) {
      try {
        await deleteQuestion(current.id)
      } catch (e) {
        toast.error('No se pudo eliminar', (e as Error).message)
      }
    }
  }

  const reload = async () => {
    const fresh = await fetchQuestions(quiz.id)
    setQs(fresh)
    qsRef.current = fresh
    return fresh
  }

  async function onMove(targetId: string, title: string) {
    if (!current) return
    await flush()
    const id = qsRef.current.find((q) => q.key === current.key)?.id
    if (!id) return toast.error('Completa la pregunta antes de moverla')
    try {
      await moveQuestions([id], targetId)
      const i = qs.indexOf(current)
      setQs((list) => list.filter((x) => x.key !== current.key))
      setSel(qs[i + 1]?.key ?? qs[i - 1]?.key)
      toast.success('Pregunta movida', `Ahora está en "${title}".`)
    } catch (e) {
      toast.error('No se pudo mover', (e as Error).message)
    }
  }

  async function onCopy(ids: string[]) {
    await flush()
    try {
      const n = await copyQuestions(ids, quiz.id)
      const fresh = await reload()
      setSel(fresh[fresh.length - 1]?.key)
      toast.success(`${n} pregunta${n === 1 ? '' : 's'} agregada${n === 1 ? '' : 's'} desde el banco`)
    } catch (e) {
      toast.error('No se pudieron copiar', (e as Error).message)
    }
  }

  async function onImport(list: EditorQuestion[]) {
    await flush()
    const n = await importQuestions(quiz.id, list)
    const fresh = await reload()
    setSel(fresh[fresh.length - n]?.key ?? fresh[0]?.key)
    toast.success(`¡${n} preguntas importadas!`, 'Revísalas en la vista previa.')
  }

  async function togglePublish() {
    await flush()
    if (quiz.status === 'published') {
      await setStatus.mutateAsync({ id: quiz.id, status: 'draft' })
      return toast.info('La evaluación volvió a borrador')
    }
    if (!qs.length) return toast.error('Agrega al menos una pregunta')
    if (totalIssues) {
      const first = qs.find((q) => issues.get(q.key)?.length)
      if (first) setSel(first.key)
      return toast.error(`Hay ${totalIssues} pregunta${totalIssues === 1 ? '' : 's'} incompleta${totalIssues === 1 ? '' : 's'}`, 'Te llevé a la primera; revisa el panel derecho.')
    }
    await setStatus.mutateAsync({ id: quiz.id, status: 'published' })
    toast.success('¡Evaluación publicada!', 'Ya puedes lanzarla en vivo, como examen o como tarea con “Lanzar”.')
  }

  const color = quiz.subjects?.theme_color || '#1B7339'

  return (
    <div className="flex flex-col gap-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/evaluaciones" className="glass grid size-11 place-items-center rounded-2xl" aria-label="Volver a evaluaciones">
          <ArrowLeft className="size-5" />
        </Link>
        <button onClick={() => setModal('settings')} className="group min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {quiz.subjects?.code} · Paralelo {quiz.subjects?.parallel}
            <Badge tone={quiz.status === 'published' ? 'green' : 'gold'}>{quiz.status === 'published' ? 'Publicada' : 'Borrador'}</Badge>
          </p>
          <h1 className="flex items-center gap-2 truncate font-display text-2xl font-black group-hover:underline">
            {quiz.title} <Settings2 className="size-4 shrink-0 text-ink-soft" />
          </h1>
        </button>
        <SaveIndicator state={saveState} onRetry={() => void flush()} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setModal('import')}>
            <Upload className="size-4" /> Excel
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setModal('bank')}>
            <Database className="size-4" /> Banco
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await flush()
              await exportQuizToExcel(quiz.title, qsRef.current)
            }}
            disabled={!qs.length}
          >
            <FileSpreadsheet className="size-4" /> Exportar
          </Button>
          <Button size="sm" variant="gold" onClick={() => setModal('preview')} disabled={!qs.length}>
            <Eye className="size-4" /> Vista previa
          </Button>
          <Button size="sm" variant={quiz.status === 'published' ? 'secondary' : 'success'} onClick={() => void togglePublish()}>
            {quiz.status === 'published' ? <Undo2 className="size-4" /> : <Rocket className="size-4" />}
            {quiz.status === 'published' ? 'Pasar a borrador' : 'Publicar'}
          </Button>
          {quiz.status === 'published' && qs.length > 0 && (
            <Button size="sm" variant="success" onClick={() => void flush().then(() => setLaunchOpen(true))}>
              <Radio className="size-4" /> Lanzar
            </Button>
          )}
        </div>
      </div>

      {!qs.length ? (
        <SolidCard className="p-8">
          <EmptyState
            icon={<Plus className="size-8" />}
            title="Agrega tu primera pregunta"
            text="Elige un tipo, súbelas todas desde Excel o tráelas del banco de preguntas de esta asignatura."
            action={
              <div className="flex w-full max-w-2xl flex-col gap-4">
                <TypeGrid onPick={addQuestion} />
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="secondary" onClick={() => setModal('import')}>
                    <Upload className="size-5" /> Importar desde Excel
                  </Button>
                  <Button variant="secondary" onClick={() => setModal('bank')}>
                    <Database className="size-5" /> Traer del banco
                  </Button>
                </div>
              </div>
            }
          />
        </SolidCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          {/* Lista de preguntas */}
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
            <Reorder.Group
              axis="y"
              values={qs}
              onReorder={(next) => {
                setQs(next)
                orderDirty.current = true
                schedule()
              }}
              className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"
            >
              {qs.map((q, i) => {
                const Icon = TYPE_ICONS[q.type]
                const bad = (issues.get(q.key)?.length ?? 0) > 0
                return (
                  <Reorder.Item
                    key={q.key}
                    value={q}
                    onClick={() => setSel(q.key)}
                    className={cn(
                      'relative flex w-52 shrink-0 cursor-pointer items-start gap-2 rounded-2xl border-2 bg-surface-2 p-2.5 lg:w-auto',
                      current?.key === q.key ? 'border-uap-blue shadow-md dark:border-game-electric' : 'border-transparent hover:border-line',
                    )}
                  >
                    <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-ink-soft" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
                        {i + 1} · <Icon className="size-3.5" /> {QUESTION_TYPES[q.type].short} · {q.time_limit_sec}s
                      </p>
                      <p className={cn('line-clamp-2 text-sm font-semibold', !q.prompt && 'italic text-ink-soft')}>{q.prompt || 'Pregunta sin texto'}</p>
                    </div>
                    {q.image_url && <img src={q.image_url} alt="" className="size-9 shrink-0 rounded-lg object-cover" />}
                    {bad && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-uap-gold" title="Incompleta" />}
                  </Reorder.Item>
                )
              })}
            </Reorder.Group>
            <Button variant="success" block className="mt-2" onClick={() => setModal('add')}>
              <Plus className="size-5" /> Pregunta
            </Button>
            <p className="mt-2 text-center text-xs text-ink-soft">
              {qs.length} pregunta{qs.length === 1 ? '' : 's'} · {Math.ceil(qs.reduce((s, q) => s + q.time_limit_sec, 0) / 60)} min aprox.
            </p>
          </aside>

          {/* Lienzo */}
          <SolidCard className="min-w-0 bg-gradient-to-b from-uap-blue/[0.04] to-transparent">
            {current && (
              <>
                <p className="mb-3 text-center text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Pregunta {currentIndex + 1} de {qs.length} · así la verá el estudiante
                </p>
                <QuestionCanvas q={current} onChange={update} />
              </>
            )}
          </SolidCard>

          {/* Ajustes */}
          <SolidCard className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
            {current && (
              <SettingsPanel
                q={current}
                issues={issues.get(current.key) ?? []}
                onChange={update}
                onDuplicate={duplicate}
                onMove={() => setModal('move')}
                onDelete={() => void remove()}
              />
            )}
          </SolidCard>
        </div>
      )}

      {/* Modales */}
      {modal === 'add' && (
        <AddTypeModal onClose={() => setModal(null)} onPick={addQuestion} />
      )}
      <PreviewModal open={modal === 'preview'} onClose={() => setModal(null)} questions={qs} startIndex={Math.max(0, currentIndex)} />
      <BankModal open={modal === 'bank'} onClose={() => setModal(null)} subjectId={quiz.subject_id} currentQuizId={quiz.id} onCopy={onCopy} />
      <MoveModal open={modal === 'move'} onClose={() => setModal(null)} currentQuizId={quiz.id} onMove={onMove} />
      <ImportQuestionsModal open={modal === 'import'} onClose={() => setModal(null)} onImport={onImport} />
      <QuizSettingsModal open={modal === 'settings'} onClose={() => setModal(null)} quiz={quiz} />
      <LaunchModal open={launchOpen} onClose={() => setLaunchOpen(false)} quiz={{ id: quiz.id, title: quiz.title, subject_id: quiz.subject_id, questionCount: qs.length }} />
    </div>
  )
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'saving' || state === 'dirty')
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        <Loader2 className="size-4 animate-spin" /> Guardando…
      </span>
    )
  if (state === 'error')
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 text-sm font-semibold text-uap-red dark:text-game-coral">
        <CloudOff className="size-4" /> Sin guardar · Reintentar
      </button>
    )
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-uap-green dark:text-game-selva">
      <CheckCircle2 className="size-4" /> Guardado ✓
    </span>
  )
}

function TypeGrid({ onPick }: { onPick: (t: QuestionType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => {
        const Icon = TYPE_ICONS[t]
        return (
          <button
            key={t}
            onClick={() => onPick(t)}
            className="flex flex-col items-center gap-2 rounded-3xl border-2 border-line bg-surface-2 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-uap-green hover:shadow-md"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-uap-green/12 text-uap-green dark:text-game-selva">
              <Icon className="size-6" />
            </span>
            <span className="font-display font-bold">{QUESTION_TYPES[t].label}</span>
            <span className="text-xs text-ink-soft">{QUESTION_TYPES[t].description}</span>
          </button>
        )
      })}
    </div>
  )
}

function AddTypeModal({ onClose, onPick }: { onClose: () => void; onPick: (t: QuestionType) => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-uap-blue-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl bg-surface-2 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-xl font-extrabold">¿Qué tipo de pregunta?</h2>
        <TypeGrid onPick={onPick} />
      </div>
    </div>
  )
}
