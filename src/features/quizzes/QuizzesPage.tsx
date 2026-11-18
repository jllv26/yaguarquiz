import { motion } from 'framer-motion'
import { Archive, ClipboardList, Copy, FileSpreadsheet, MoreVertical, Pencil, Plus, Rocket, Search, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { fetchQuestions, useDeleteQuiz, useDuplicateQuiz, useQuizzes, useSetQuizStatus, type QuizListRow, type QuizStatus } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { normalizeText } from '../../lib/text'
import { exportQuizToExcel } from './quizExport'
import { downloadQuestionTemplate } from './questionTemplate'
import { QuizSettingsModal } from './QuizSettingsModal'
import { LaunchModal } from '../sessions/LaunchModal'

const STATUS: Record<QuizStatus, { label: string; tone: 'neutral' | 'green' | 'gold' }> = {
  draft: { label: 'Borrador', tone: 'gold' },
  published: { label: 'Publicada', tone: 'green' },
  archived: { label: 'Archivada', tone: 'neutral' },
}

export function QuizzesPage() {
  const quizzes = useQuizzes()
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState<'active' | QuizStatus>('active')
  const [newOpen, setNewOpen] = useState(false)

  const subjects = useMemo(() => {
    const m = new Map<string, string>()
    quizzes.data?.forEach((z) => z.subjects && m.set(z.subject_id, `${z.subjects.code} (${z.subjects.parallel})`))
    return [...m.entries()]
  }, [quizzes.data])

  const list = useMemo(() => {
    const nq = normalizeText(q)
    return (quizzes.data ?? []).filter(
      (z) =>
        (status === 'active' ? z.status !== 'archived' : z.status === status) &&
        (!subject || z.subject_id === subject) &&
        (!nq || normalizeText(`${z.title} ${z.subjects?.code ?? ''} ${z.topics?.name ?? ''}`).includes(nq)),
    )
  }, [quizzes.data, q, subject, status])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">Evaluaciones</h1>
          <p className="text-ink-soft">Crea tus evaluaciones una vez y reutilízalas en varias sesiones y paralelos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void downloadQuestionTemplate()}>
            <FileSpreadsheet className="size-5" /> Plantilla Excel
          </Button>
          <Button variant="success" onClick={() => setNewOpen(true)}>
            <Plus className="size-5" /> Nueva evaluación
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar evaluación"
            className="h-12 w-full rounded-2xl border-2 border-line bg-surface-2 pl-10 pr-4 outline-none focus:border-uap-blue"
          />
        </div>
        <div className="w-56">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filtrar por asignatura">
            <option value="">Todas las asignaturas</option>
            {subjects.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex rounded-2xl bg-ink/5 p-1">
          {(
            [
              ['active', 'Activas'],
              ['draft', 'Borradores'],
              ['published', 'Publicadas'],
              ['archived', 'Archivadas'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              className={cn('rounded-xl px-3 py-2 text-sm font-semibold', status === k ? 'bg-surface-2 shadow-sm' : 'text-ink-soft')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {quizzes.isLoading ? (
        <Skeleton className="h-64" />
      ) : !list.length ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title={quizzes.data?.length ? 'No hay evaluaciones con ese filtro' : 'Aún no tienes evaluaciones'}
          text="Crea una evaluación y agrega preguntas en el editor, o súbelas todas de una vez desde Excel."
          action={
            <Button variant="success" onClick={() => setNewOpen(true)}>
              <Plus className="size-5" /> Nueva evaluación
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((z, i) => (
            <QuizCard key={z.id} z={z} index={i} />
          ))}
        </div>
      )}
      <QuizSettingsModal open={newOpen} onClose={() => setNewOpen(false)} defaultSubjectId={subject || undefined} />
    </div>
  )
}

function QuizCard({ z, index }: { z: QuizListRow; index: number }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const dup = useDuplicateQuiz()
  const del = useDeleteQuiz()
  const setStatus = useSetQuizStatus()
  const [menu, setMenu] = useState(false)
  const [launch, setLaunch] = useState(false)
  const n = z.questions?.[0]?.count ?? 0
  const color = z.subjects?.theme_color || '#1B7339'

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMenu(false)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error('No se pudo completar', (e as Error).message)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <SolidCard className="relative flex h-full flex-col gap-3 overflow-visible p-5">
        <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl" style={{ background: color }} />
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS[z.status].tone}>{STATUS[z.status].label}</Badge>
            {z.subjects && (
              <Badge tone="blue">
                {z.subjects.code} · {z.subjects.parallel}
              </Badge>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="rounded-xl p-1.5 text-ink-soft hover:bg-ink/5" aria-label="Más acciones">
              <MoreVertical className="size-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-surface-2 py-1 shadow-xl">
                  <MenuItem icon={Copy} onClick={() => void act(async () => navigate(`/admin/evaluaciones/${await dup.mutateAsync(z.id)}`), 'Evaluación duplicada')}>
                    Duplicar
                  </MenuItem>
                  <MenuItem icon={FileSpreadsheet} onClick={() => void act(async () => exportQuizToExcel(z.title, await fetchQuestions(z.id)), 'Excel descargado')}>
                    Exportar a Excel
                  </MenuItem>
                  {z.status === 'archived' ? (
                    <MenuItem icon={Undo2} onClick={() => void act(() => setStatus.mutateAsync({ id: z.id, status: 'draft' }), 'Evaluación restaurada')}>
                      Restaurar
                    </MenuItem>
                  ) : (
                    <MenuItem icon={Archive} onClick={() => void act(() => setStatus.mutateAsync({ id: z.id, status: 'archived' }), 'Evaluación archivada')}>
                      Archivar
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={Trash2}
                    danger
                    onClick={() =>
                      void (async () => {
                        setMenu(false)
                        const ok = await confirm({
                          title: `¿Eliminar "${z.title}"?`,
                          message: 'Se borran sus preguntas, sesiones y resultados. Si solo ya no la usas, mejor archívala.',
                          confirmText: 'Eliminar',
                          danger: true,
                        })
                        if (ok) await act(() => del.mutateAsync(z.id), 'Evaluación eliminada')
                      })()
                    }
                  >
                    Eliminar
                  </MenuItem>
                </div>
              </>
            )}
          </div>
        </div>
        <Link to={`/admin/evaluaciones/${z.id}`} className="group">
          <h3 className="font-display text-xl font-bold leading-snug group-hover:underline">{z.title}</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {z.topics ? `${z.topics.unit ? z.topics.unit + ' · ' : ''}${z.topics.name}` : z.subjects?.name}
          </p>
        </Link>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-display text-2xl font-black">
            {n} <span className="text-sm font-semibold text-ink-soft">pregunta{n === 1 ? '' : 's'}</span>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/evaluaciones/${z.id}`)} aria-label="Editar">
              <Pencil className="size-4" /> {z.status === 'published' ? '' : 'Editar'}
            </Button>
            {z.status === 'published' && n > 0 && (
              <Button size="sm" variant="success" onClick={() => setLaunch(true)}>
                <Rocket className="size-4" /> En vivo
              </Button>
            )}
          </div>
          <LaunchModal open={launch} onClose={() => setLaunch(false)} quiz={launch ? { id: z.id, title: z.title, subject_id: z.subject_id } : null} />
        </div>
      </SolidCard>
    </motion.div>
  )
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: typeof Copy
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold hover:bg-ink/5', danger && 'text-uap-red dark:text-game-coral')}
    >
      <Icon className="size-4" /> {children}
    </button>
  )
}
