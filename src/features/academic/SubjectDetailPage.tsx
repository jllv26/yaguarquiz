import { ArrowLeft, BookMarked, Calculator, Pencil, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirm } from '../../components/ui/Confirm'
import { EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useDeleteSubject, usePeriods, useSubject } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import { StudentsTab } from '../students/StudentsTab'
import { SubjectModal } from './AcademicModals'
import { GradingTab } from './GradingTab'
import { TopicsTab } from './TopicsTab'

const TABS = [
  { id: 'estudiantes', label: 'Estudiantes', icon: Users },
  { id: 'temas', label: 'Temas', icon: BookMarked },
  { id: 'plan', label: 'Plan de calificación', icon: Calculator },
] as const
type TabId = (typeof TABS)[number]['id']

export function SubjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const subject = useSubject(id)
  const [tab, setTab] = useState<TabId>('estudiantes')
  const [edit, setEdit] = useState(false)
  const del = useDeleteSubject()
  const s = subject.data
  const periods = usePeriods(s?.periods?.academic_year_id)

  if (subject.isLoading) return <Skeleton className="h-64" />
  if (!s)
    return (
      <EmptyState
        icon={<BookMarked className="size-8" />}
        title="Asignatura no encontrada"
        action={
          <Link to="/admin/asignaturas" className="font-semibold text-uap-green">
            Volver a asignaturas
          </Link>
        }
      />
    )

  const color = s.theme_color || '#1B7339'

  async function remove() {
    const ok = await confirm({
      title: `¿Eliminar ${s!.code} (${s!.parallel})?`,
      message:
        'Se borrarán sus temas, evaluaciones, sesiones y resultados. Los estudiantes NO se borran (siguen en tu directorio). Esta acción no se puede deshacer.',
      confirmText: 'Eliminar asignatura',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(s!.id)
      toast.success('Asignatura eliminada')
      navigate('/admin/asignaturas')
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/asignaturas" className="flex w-fit items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Asignaturas
      </Link>

      <header
        className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl sm:p-8"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}bb 60%, #0d1a33)` }}
      >
        <BookMarked className="absolute -bottom-6 -right-6 size-40 text-white/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
              {s.periods?.name} · Gestión {s.periods?.academic_years?.year}
            </p>
            <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">{s.name}</h1>
            <p className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded-xl bg-white/20 px-3 py-1 font-bold">{s.code}</span>
              <span className="rounded-xl bg-white px-3 py-1 font-bold" style={{ color }}>
                Paralelo {s.parallel}
              </span>
              {s.career && <span className="rounded-xl bg-white/15 px-3 py-1">{s.career}</span>}
              {s.semester && <span className="rounded-xl bg-white/15 px-3 py-1">{s.semester}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEdit(true)} className="rounded-2xl bg-white/20 p-3 backdrop-blur hover:bg-white/30" aria-label="Editar asignatura">
              <Pencil className="size-5" />
            </button>
            <button onClick={() => void remove()} className="rounded-2xl bg-white/20 p-3 backdrop-blur hover:bg-white/30" aria-label="Eliminar asignatura">
              <Trash2 className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 font-semibold transition-colors',
              tab === t.id ? 'bg-uap-blue text-white shadow-md dark:bg-game-electric' : 'glass text-ink-soft hover:text-ink',
            )}
          >
            <t.icon className="size-5" /> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'estudiantes' && <StudentsTab subjectId={s.id} subjectLabel={`${s.code}_${s.parallel}`} />}
      {tab === 'temas' && <TopicsTab subjectId={s.id} />}
      {tab === 'plan' && <GradingTab subjectId={s.id} />}

      <SubjectModal
        open={edit}
        onClose={() => setEdit(false)}
        periods={periods.data ?? []}
        subject={s}
      />
    </div>
  )
}
