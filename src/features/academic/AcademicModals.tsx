import { Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useSavePeriod, useSaveSubject, useSaveYear } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import { CURRENT_YEAR } from '../../lib/dates'
import type { Period, Subject } from '../../types/db'
import { DEFAULT_GRADING_PLAN, SUBJECT_COLORS } from './gradingDefaults'

// ------------------------------------------------------------------ Gestión
export function YearModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const save = useSaveYear()
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [withPeriods, setWithPeriods] = useState(true)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return toast.error('Año inválido', 'Escribe un año entre 2000 y 2100.')
    try {
      const created = await save.mutateAsync({ year: y, withPeriods })
      toast.success(`Gestión ${y} creada`)
      onCreated(created.id)
      onClose()
    } catch (err) {
      toast.error('No se pudo crear', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva gestión"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="year-form" disabled={save.isPending}>
            Crear
          </Button>
        </>
      }
    >
      <form id="year-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Año" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} autoFocus />
        <label className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] p-3">
          <input type="checkbox" className="size-5 accent-uap-green" checked={withPeriods} onChange={(e) => setWithPeriods(e.target.checked)} />
          <span>
            Crear también los periodos <strong>I/{year}</strong> y <strong>II/{year}</strong>
          </span>
        </label>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Periodo
export function PeriodModal({
  open,
  onClose,
  yearId,
  year,
  period,
}: {
  open: boolean
  onClose: () => void
  yearId: string
  year: number
  period?: Period
}) {
  const toast = useToast()
  const save = useSavePeriod()
  const [name, setName] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [lastKey, setLastKey] = useState<string | null>(null)

  // Reinicia el formulario cada vez que se abre
  const key = open ? (period?.id ?? 'new') : null
  if (key !== lastKey) {
    setLastKey(key)
    setName(period?.name ?? '')
    setStarts(period?.starts_on ?? '')
    setEnds(period?.ends_on ?? '')
  }

  const presets = [`I/${year}`, `II/${year}`, `Invierno ${year}`, `Verano ${year}`]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Escribe el nombre del periodo')
    if (starts && ends && ends < starts) return toast.error('Fechas inválidas', 'La fecha de fin es anterior al inicio.')
    try {
      await save.mutateAsync({ id: period?.id, academic_year_id: yearId, name, starts_on: starts || null, ends_on: ends || null })
      toast.success(period ? 'Periodo actualizado' : 'Periodo creado')
      onClose()
    } catch (err) {
      toast.error('No se pudo guardar', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={period ? 'Editar periodo' : 'Nuevo periodo'}
      subtitle={`Gestión ${year}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="period-form" disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="period-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder={`I/${year}`} autoFocus />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setName(p)}
              className={cn('rounded-xl border border-line px-3 py-1.5 text-sm font-semibold', name === p ? 'bg-uap-green text-white' : 'hover:bg-ink/5')}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Inicio (opcional)" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <Input label="Fin (opcional)" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Asignatura
export function SubjectModal({
  open,
  onClose,
  periods,
  defaultPeriodId,
  subject,
}: {
  open: boolean
  onClose: () => void
  periods: Period[]
  defaultPeriodId?: string
  subject?: Subject
}) {
  const toast = useToast()
  const save = useSaveSubject()
  const [f, setF] = useState({ period_id: '', code: '', name: '', career: '', semester: '', parallel: 'A', theme_color: SUBJECT_COLORS[0] })
  const [applyPlan, setApplyPlan] = useState(true)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = open ? (subject?.id ?? `new-${defaultPeriodId}`) : null
  if (key !== lastKey) {
    setLastKey(key)
    setF({
      period_id: subject?.period_id ?? defaultPeriodId ?? periods[0]?.id ?? '',
      code: subject?.code ?? '',
      name: subject?.name ?? '',
      career: subject?.career ?? '',
      semester: subject?.semester ?? '',
      parallel: subject?.parallel ?? 'A',
      theme_color: subject?.theme_color ?? SUBJECT_COLORS[0],
    })
    setApplyPlan(true)
  }

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.period_id) return toast.error('Elige el periodo')
    if (!f.code.trim() || !f.name.trim()) return toast.error('Faltan datos', 'La sigla y el nombre son obligatorios.')
    try {
      await save.mutateAsync({ id: subject?.id, ...f, applyPlan: !subject && applyPlan ? DEFAULT_GRADING_PLAN : undefined })
      toast.success(subject ? 'Asignatura actualizada' : 'Asignatura creada')
      onClose()
    } catch (err) {
      toast.error('No se pudo guardar', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? 'Editar asignatura' : 'Nueva asignatura'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="subject-form" disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Select label="Periodo" value={f.period_id} onChange={(e) => set('period_id')(e.target.value)}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sigla" value={f.code} onChange={(e) => set('code')(e.target.value)} placeholder="TSOS 023" autoFocus />
          <Input label="Paralelo" value={f.parallel} onChange={(e) => set('parallel')(e.target.value)} placeholder="A" maxLength={5} />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Nombre de la asignatura"
            value={f.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Tecnologías de la Información y Comunicación"
          />
        </div>
        <Input label="Carrera" value={f.career} onChange={(e) => set('career')(e.target.value)} placeholder="Turismo Sostenible" />
        <Input label="Semestre" value={f.semester} onChange={(e) => set('semester')(e.target.value)} placeholder="5to semestre" />
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-ink-soft">Color de la asignatura</p>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => set('theme_color')(c)}
                className="grid size-10 place-items-center rounded-2xl ring-offset-2 ring-offset-surface-2 transition-transform hover:scale-110"
                style={{ background: c, boxShadow: f.theme_color === c ? `0 0 0 3px ${c}66` : undefined }}
                aria-label={`Color ${c}`}
                aria-pressed={f.theme_color === c}
              >
                {f.theme_color === c && <Check className="size-5 text-white" />}
              </button>
            ))}
          </div>
        </div>
        {!subject && (
          <label className="flex items-start gap-3 rounded-2xl bg-uap-green/8 p-3 sm:col-span-2">
            <input type="checkbox" className="mt-1 size-5 accent-uap-green" checked={applyPlan} onChange={(e) => setApplyPlan(e.target.checked)} />
            <span>
              Aplicar mi plan de calificación (<strong>30 + 30 + 40 = 100</strong>). Podrás modificarlo después en la pestaña
              “Plan de calificación”.
            </span>
          </label>
        )}
      </form>
    </Modal>
  )
}
