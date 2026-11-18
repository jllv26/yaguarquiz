import { motion } from 'framer-motion'
import { BookOpen, CalendarPlus, CalendarRange, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useDeletePeriod, useDeleteYear, usePeriods, useSaveYear, useSubjects, useYears } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import { CURRENT_YEAR, fmtDate } from '../../lib/dates'
import type { Period, SubjectWithCounts } from '../../types/db'
import { PeriodModal, SubjectModal, YearModal } from './AcademicModals'

const YEAR_KEY = 'yq-year'

export function AcademicPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const years = useYears()
  const [yearId, setYearId] = useState<string | undefined>(() => localStorage.getItem(YEAR_KEY) ?? undefined)
  const periods = usePeriods(yearId)
  const subjects = useSubjects(yearId)
  const saveYear = useSaveYear()
  const deleteYear = useDeleteYear()
  const deletePeriod = useDeletePeriod()

  const [yearModal, setYearModal] = useState(false)
  const [periodModal, setPeriodModal] = useState<{ open: boolean; period?: Period }>({ open: false })
  const [subjectModal, setSubjectModal] = useState<{ open: boolean; periodId?: string }>({ open: false })

  // Selecciona la gestión más reciente si no hay una guardada válida
  const validYearId = useMemo(() => {
    const list = years.data ?? []
    return list.find((y) => y.id === yearId)?.id ?? list[0]?.id
  }, [years.data, yearId])
  useEffect(() => {
    if (validYearId && validYearId !== yearId) setYearId(validYearId)
    if (validYearId) localStorage.setItem(YEAR_KEY, validYearId)
  }, [validYearId, yearId])

  const currentYear = years.data?.find((y) => y.id === validYearId)
  const byPeriod = useMemo(() => {
    const map = new Map<string, SubjectWithCounts[]>()
    subjects.data?.forEach((s) => map.set(s.period_id, [...(map.get(s.period_id) ?? []), s]))
    return map
  }, [subjects.data])

  async function quickStart() {
    const y = CURRENT_YEAR
    try {
      const created = await saveYear.mutateAsync({ year: y, withPeriods: true })
      setYearId(created.id)
      toast.success(`Gestión ${y} creada`, `Con los periodos I/${y} y II/${y}.`)
    } catch (e) {
      toast.error('No se pudo crear', (e as Error).message)
    }
  }

  async function removeYear() {
    if (!currentYear) return
    const ok = await confirm({
      title: `¿Eliminar la gestión ${currentYear.year}?`,
      message: 'Se borrarán sus periodos, asignaturas, temas, evaluaciones y resultados. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar gestión',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteYear.mutateAsync(currentYear.id)
      localStorage.removeItem(YEAR_KEY)
      setYearId(undefined)
      toast.success('Gestión eliminada')
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message)
    }
  }

  async function removePeriod(p: Period) {
    const ok = await confirm({
      title: `¿Eliminar el periodo ${p.name}?`,
      message: 'Se borrarán sus asignaturas, temas, evaluaciones y resultados. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar periodo',
      danger: true,
    })
    if (!ok) return
    try {
      await deletePeriod.mutateAsync(p.id)
      toast.success('Periodo eliminado')
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">Asignaturas</h1>
          <p className="text-ink-soft">Gestiones, periodos y asignaturas con sus listas de estudiantes.</p>
        </div>
        <Button variant="secondary" onClick={() => setYearModal(true)}>
          <CalendarPlus className="size-5" /> Nueva gestión
        </Button>
      </header>

      {years.isLoading ? (
        <Skeleton className="h-40" />
      ) : !years.data?.length ? (
        <EmptyState
          icon={<Sparkles className="size-8" />}
          title="Empecemos por la gestión"
          text={`Crea la gestión ${CURRENT_YEAR} con sus dos periodos (I y II) en un clic. Luego podrás agregar invierno o verano.`}
          action={
            <Button variant="success" onClick={() => void quickStart()} disabled={saveYear.isPending}>
              <CalendarPlus className="size-5" /> Crear gestión {CURRENT_YEAR}
            </Button>
          }
        />
      ) : (
        <>
          {/* Selector de gestión */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Gestiones">
            {years.data.map((y) => (
              <button
                key={y.id}
                role="tab"
                aria-selected={y.id === validYearId}
                onClick={() => setYearId(y.id)}
                className={cn(
                  'rounded-2xl px-5 py-2.5 font-display text-lg font-bold transition-all',
                  y.id === validYearId
                    ? 'bg-uap-blue text-white shadow-lg dark:bg-game-electric'
                    : 'glass text-ink-soft hover:text-ink',
                )}
              >
                {y.year}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPeriodModal({ open: true })}>
                <CalendarRange className="size-4" /> Nuevo periodo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void removeYear()} aria-label="Eliminar gestión">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {periods.isLoading || subjects.isLoading ? (
            <Skeleton className="h-56" />
          ) : !periods.data?.length ? (
            <EmptyState
              icon={<CalendarRange className="size-8" />}
              title="Esta gestión no tiene periodos"
              action={
                <Button variant="success" onClick={() => setPeriodModal({ open: true })}>
                  <Plus className="size-5" /> Crear periodo
                </Button>
              }
            />
          ) : (
            periods.data.map((p) => (
              <section key={p.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl font-extrabold">{p.name}</h2>
                  {p.starts_on && (
                    <Badge>
                      {fmtDate(p.starts_on)} – {p.ends_on ? fmtDate(p.ends_on) : '…'}
                    </Badge>
                  )}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="success" onClick={() => setSubjectModal({ open: true, periodId: p.id })}>
                      <Plus className="size-4" /> Asignatura
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPeriodModal({ open: true, period: p })} aria-label="Editar periodo">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removePeriod(p)} aria-label="Eliminar periodo">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {byPeriod.get(p.id)?.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {byPeriod.get(p.id)!.map((s, i) => (
                      <SubjectCard key={s.id} s={s} index={i} />
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setSubjectModal({ open: true, periodId: p.id })}
                    className="rounded-3xl border-2 border-dashed border-line px-6 py-8 text-ink-soft transition-colors hover:border-uap-green hover:text-uap-green"
                  >
                    <Plus className="mx-auto mb-1 size-6" /> Agregar la primera asignatura de {p.name}
                  </button>
                )}
              </section>
            ))
          )}
        </>
      )}

      <YearModal open={yearModal} onClose={() => setYearModal(false)} onCreated={(id) => setYearId(id)} />
      {validYearId && (
        <PeriodModal
          open={periodModal.open}
          onClose={() => setPeriodModal({ open: false })}
          yearId={validYearId}
          year={currentYear?.year ?? CURRENT_YEAR}
          period={periodModal.period}
        />
      )}
      <SubjectModal
        open={subjectModal.open}
        onClose={() => setSubjectModal({ open: false })}
        periods={periods.data ?? []}
        defaultPeriodId={subjectModal.periodId}
      />
    </div>
  )
}

function SubjectCard({ s, index }: { s: SubjectWithCounts; index: number }) {
  const color = s.theme_color || '#1B7339'
  const students = s.enrollments?.[0]?.count ?? 0
  const topics = s.topics?.[0]?.count ?? 0
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link to={`/admin/asignaturas/${s.id}`} className="group block h-full">
        <SolidCard className="relative h-full overflow-hidden p-0 transition-transform group-hover:-translate-y-1">
          <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <BookOpen className="absolute -right-3 -top-3 size-24 text-white/15" />
            <span className="absolute left-5 top-4 rounded-xl bg-white/20 px-3 py-1 font-display text-sm font-bold text-white backdrop-blur">
              {s.code}
            </span>
            <span className="absolute right-5 top-4 rounded-xl bg-white px-3 py-1 font-display text-sm font-black" style={{ color }}>
              Paralelo {s.parallel}
            </span>
          </div>
          <div className="p-5">
            <h3 className="font-display text-lg font-bold leading-snug group-hover:underline">{s.name}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">{[s.career, s.semester].filter(Boolean).join(' · ') || '—'}</p>
            <div className="mt-4 flex gap-2">
              <Badge tone="green">
                <Users className="size-3.5" /> {students} estudiante{students === 1 ? '' : 's'}
              </Badge>
              <Badge tone="blue">
                {topics} tema{topics === 1 ? '' : 's'}
              </Badge>
            </div>
          </div>
        </SolidCard>
      </Link>
    </motion.div>
  )
}
