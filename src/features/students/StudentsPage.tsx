import { Pencil, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useAllStudents, useDeleteStudent, useSetStudentActive } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import { normalizeText } from '../../lib/text'
import type { Student } from '../../types/db'
import { StudentModal } from './StudentModal'

type Filter = 'all' | 'active' | 'inactive'

/** Directorio de todos los estudiantes del docente (de todas las asignaturas). */
export function StudentsPage() {
  const students = useAllStudents()
  const setActive = useSetStudentActive()
  const del = useDeleteStudent()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [edit, setEdit] = useState<Student | undefined>()

  const list = useMemo(() => {
    const nq = normalizeText(q)
    return (students.data ?? []).filter(
      (s) =>
        (filter === 'all' || (filter === 'active' ? s.active : !s.active)) &&
        (!nq || normalizeText(`${s.university_code} ${s.ci ?? ''} ${s.last_names} ${s.first_names} ${s.email ?? ''} ${s.phone ?? ''}`).includes(nq)),
    )
  }, [students.data, q, filter])

  async function toggle(s: Student) {
    try {
      await setActive.mutateAsync({ id: s.id, active: !s.active })
      toast.success(s.active ? 'Estudiante dado de baja' : 'Estudiante reactivado', `${s.first_names} ${s.last_names}`)
    } catch (e) {
      toast.error('No se pudo actualizar', (e as Error).message)
    }
  }

  async function remove(s: Student) {
    const ok = await confirm({
      title: `¿Eliminar a ${s.first_names} ${s.last_names}?`,
      message: 'Se borra del directorio y de todas sus asignaturas. Sus resultados pasados quedan sin nombre. Si solo dejó de asistir, mejor “dar de baja”.',
      confirmText: 'Eliminar definitivamente',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(s.id)
      toast.success('Estudiante eliminado')
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message)
    }
  }

  const counts = {
    all: students.data?.length ?? 0,
    active: students.data?.filter((s) => s.active).length ?? 0,
    inactive: students.data?.filter((s) => !s.active).length ?? 0,
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">Estudiantes</h1>
        <p className="text-ink-soft">
          Tu directorio de estudiantes de todas las asignaturas. Para inscribir una lista, entra a la asignatura y usa “Importar Excel”.
        </p>
      </header>
      <SolidCard>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, RU, CI o correo"
              className="h-11 w-full rounded-2xl border-2 border-line bg-surface-2 pl-10 pr-4 outline-none focus:border-uap-blue"
            />
          </div>
          <div className="flex rounded-2xl bg-ink/5 p-1">
            {(
              [
                ['active', 'Activos'],
                ['inactive', 'De baja'],
                ['all', 'Todos'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn('rounded-xl px-3 py-1.5 text-sm font-semibold', filter === k ? 'bg-surface-2 shadow-sm' : 'text-ink-soft')}
              >
                {label} <span className="text-ink-soft">({counts[k]})</span>
              </button>
            ))}
          </div>
        </div>

        {students.isLoading ? (
          <Skeleton className="h-64" />
        ) : !list.length ? (
          <EmptyState icon={<Users className="size-8" />} title={q ? 'Sin resultados' : 'Aún no tienes estudiantes'} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ink/[0.04] text-left text-ink-soft">
                <tr>
                  <th className="px-3 py-2.5">RU</th>
                  <th className="px-3 py-2.5">Apellidos y nombres</th>
                  <th className="px-3 py-2.5">CI</th>
                  <th className="px-3 py-2.5">Asignaturas</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className={cn('border-t border-line', !s.active && 'opacity-60')}>
                    <td className="px-3 py-2 font-mono font-semibold">{s.university_code}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{s.last_names}</span>, {s.first_names}
                      {(s.email || s.phone) && (
                        <p className="text-xs text-ink-soft">
                          {[s.email, s.phone && `cel. ${s.phone}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.ci}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.enrollments
                          .filter((e) => e.subjects)
                          .map((e, i) => (
                            <Badge key={i} tone="blue">
                              {e.subjects!.code} {e.subjects!.parallel}
                            </Badge>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(s)} aria-label="Editar">
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void toggle(s)} aria-label={s.active ? 'Dar de baja' : 'Reactivar'} title={s.active ? 'Dar de baja' : 'Reactivar'}>
                          {s.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(s)} aria-label="Eliminar">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SolidCard>
      <StudentModal open={!!edit} onClose={() => setEdit(undefined)} student={edit} />
    </div>
  )
}
