import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useSaveStudent } from '../../lib/api/academic'
import { EMAIL_RE } from '../../lib/text'
import type { Student } from '../../types/db'

/** Crear o editar un estudiante. Si se pasa enrollIn, lo inscribe en esa asignatura. */
export function StudentModal({
  open,
  onClose,
  student,
  enrollIn,
}: {
  open: boolean
  onClose: () => void
  student?: Student
  enrollIn?: string
}) {
  const toast = useToast()
  const save = useSaveStudent()
  const [f, setF] = useState({ university_code: '', ci: '', last_names: '', first_names: '', email: '', career: '' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? (student?.id ?? 'new') : null
  if (key !== lastKey) {
    setLastKey(key)
    setF({
      university_code: student?.university_code ?? '',
      ci: student?.ci ?? '',
      last_names: student?.last_names ?? '',
      first_names: student?.first_names ?? '',
      email: student?.email ?? '',
      career: student?.career ?? '',
    })
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.university_code.trim() || !f.last_names.trim() || !f.first_names.trim())
      return toast.error('Faltan datos', 'El código universitario, los apellidos y los nombres son obligatorios.')
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) return toast.error('Correo inválido')
    try {
      await save.mutateAsync({ id: student?.id, ...f, active: student?.active ?? true, enrollIn: student ? undefined : enrollIn })
      toast.success(student ? 'Datos actualizados' : 'Estudiante agregado')
      onClose()
    } catch (err) {
      toast.error('No se pudo guardar', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={student ? 'Editar estudiante' : 'Agregar estudiante'}
      subtitle={!student && enrollIn ? 'Si el RU ya existe en tu directorio, se reutiliza y solo se inscribe.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="student-form" disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Código universitario (RU) *" value={f.university_code} onChange={set('university_code')} autoFocus />
        <Input label="Carnet de identidad (CI)" value={f.ci} onChange={set('ci')} />
        <Input label="Apellidos *" value={f.last_names} onChange={set('last_names')} />
        <Input label="Nombres *" value={f.first_names} onChange={set('first_names')} />
        <Input label="Correo" type="email" value={f.email} onChange={set('email')} />
        <Input label="Carrera" value={f.career} onChange={set('career')} />
      </form>
    </Modal>
  )
}
