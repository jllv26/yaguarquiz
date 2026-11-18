import { Download, FileSpreadsheet, Pencil, Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useEnrolled, useUnenroll } from '../../lib/api/academic'
import { buildWorkbook, downloadBlob, headerCell } from '../../lib/excel'
import { normalizeText } from '../../lib/text'
import type { EnrolledStudent } from '../../types/db'
import { ImportStudentsModal } from './ImportStudentsModal'
import { downloadStudentTemplate } from './studentTemplate'
import { StudentModal } from './StudentModal'

export function StudentsTab({ subjectId, subjectLabel }: { subjectId: string; subjectLabel: string }) {
  const enrolled = useEnrolled(subjectId)
  const unenroll = useUnenroll(subjectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; student?: EnrolledStudent }>({ open: false })

  const list = useMemo(() => {
    const all = enrolled.data ?? []
    const nq = normalizeText(q)
    if (!nq) return all
    return all.filter((s) => normalizeText(`${s.university_code} ${s.ci ?? ''} ${s.last_names} ${s.first_names} ${s.email ?? ''}`).includes(nq))
  }, [enrolled.data, q])

  const codes = useMemo(() => new Set((enrolled.data ?? []).map((s) => s.university_code)), [enrolled.data])

  async function remove(s: EnrolledStudent) {
    const ok = await confirm({
      title: `¿Quitar a ${s.first_names} ${s.last_names}?`,
      message: 'Se quita de esta asignatura. El estudiante sigue en tu directorio y puedes volver a inscribirlo.',
      confirmText: 'Quitar de la asignatura',
      danger: true,
    })
    if (!ok) return
    try {
      await unenroll.mutateAsync(s.id)
      toast.success('Estudiante quitado de la asignatura')
    } catch (e) {
      toast.error('No se pudo quitar', (e as Error).message)
    }
  }

  async function exportList() {
    const rows = enrolled.data ?? []
    const blob = await buildWorkbook([
      {
        sheet: 'Lista',
        data: [
          ['N°', 'codigo_universitario', 'ci', 'apellidos', 'nombres', 'correo', 'carrera'].map(headerCell),
          ...rows.map((s, i) => [i + 1, s.university_code, s.ci, s.last_names, s.first_names, s.email, s.career]),
        ],
        columns: [{ width: 6 }, { width: 20 }, { width: 14 }, { width: 26 }, { width: 24 }, { width: 30 }, { width: 24 }],
        stickyRowsCount: 1,
      },
    ])
    downloadBlob(blob, `lista_${subjectLabel.replace(/\s+/g, '')}.xlsx`)
  }

  return (
    <SolidCard>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-display text-xl font-bold">Lista oficial</h2>
          <p className="text-sm text-ink-soft">
            {enrolled.data?.length ?? 0} estudiante{enrolled.data?.length === 1 ? '' : 's'} inscrito{enrolled.data?.length === 1 ? '' : 's'}. Solo ellos podrán entrar
            a los exámenes de esta asignatura.
          </p>
        </div>
        <Button variant="success" onClick={() => setImportOpen(true)}>
          <FileSpreadsheet className="size-5" /> Importar Excel
        </Button>
        <Button variant="secondary" onClick={() => setModal({ open: true })}>
          <UserPlus className="size-5" /> Agregar
        </Button>
      </div>

      {enrolled.isLoading ? (
        <Skeleton className="h-64" />
      ) : !enrolled.data?.length ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="Aún no hay estudiantes"
          text="Descarga la plantilla, pega tu lista y súbela. El sistema revisa cada fila antes de guardar."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={() => void downloadStudentTemplate()}>
                <Download className="size-5" /> Descargar plantilla
              </Button>
              <Button variant="success" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="size-5" /> Importar Excel
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, RU, CI o correo"
                className="h-11 w-full rounded-2xl border-2 border-line bg-surface-2 pl-10 pr-4 outline-none focus:border-uap-blue"
              />
            </div>
            <Button size="sm" variant="ghost" onClick={() => void exportList()}>
              <Download className="size-4" /> Exportar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void downloadStudentTemplate()}>
              <FileSpreadsheet className="size-4" /> Plantilla
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ink/[0.04] text-left text-ink-soft">
                <tr>
                  <th className="px-3 py-2.5">N°</th>
                  <th className="px-3 py-2.5">RU</th>
                  <th className="px-3 py-2.5">Apellidos y nombres</th>
                  <th className="px-3 py-2.5">CI</th>
                  <th className="px-3 py-2.5">Correo</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={s.id} className="border-t border-line hover:bg-ink/[0.02]">
                    <td className="px-3 py-2 text-ink-soft">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{s.university_code}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{s.last_names}</span>, {s.first_names}
                      {!s.active && (
                        <Badge tone="gold" className="ml-2">
                          De baja
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.ci}</td>
                    <td className="px-3 py-2 text-ink-soft">{s.email}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setModal({ open: true, student: s })} aria-label="Editar">
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(s)} aria-label="Quitar de la asignatura">
                          <UserMinus className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ImportStudentsModal open={importOpen} onClose={() => setImportOpen(false)} subjectId={subjectId} enrolledCodes={codes} />
      <StudentModal open={modal.open} onClose={() => setModal({ open: false })} student={modal.student} enrollIn={subjectId} />
    </SolidCard>
  )
}
