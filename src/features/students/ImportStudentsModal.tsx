import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, PartyPopper, Upload, XCircle } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { fetchExistingCodes, useImportStudents } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import { readTable } from '../../lib/excel'
import type { ImportSummary } from '../../types/db'
import { parseStudentMatrix, type ParsedStudentRow, type ParseResult } from './studentImport'
import { downloadStudentTemplate } from './studentTemplate'

type Step = 'pick' | 'preview' | 'done'

const STATUS: Record<ParsedStudentRow['status'], { label: string; tone: 'green' | 'blue' | 'neutral' | 'red' }> = {
  new: { label: 'Nuevo', tone: 'green' },
  existing: { label: 'Ya registrado', tone: 'blue' },
  enrolled: { label: 'Ya inscrito', tone: 'neutral' },
  error: { label: 'Error', tone: 'red' },
}

export function ImportStudentsModal({
  open,
  onClose,
  subjectId,
  enrolledCodes,
}: {
  open: boolean
  onClose: () => void
  subjectId: string
  enrolledCodes: Set<string>
}) {
  const toast = useToast()
  const importer = useImportStudents(subjectId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [skipInvalid, setSkipInvalid] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [drag, setDrag] = useState(false)

  function reset() {
    setStep('pick')
    setParsed(null)
    setFileName('')
    setOnlyErrors(false)
    setSkipInvalid(false)
    setUpdateExisting(false)
    setSummary(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function handleFile(file?: File | null) {
    if (!file) return
    setReading(true)
    setFileName(file.name)
    try {
      const [matrix, existing] = await Promise.all([readTable(file), fetchExistingCodes()])
      const res = parseStudentMatrix(matrix, existing, enrolledCodes)
      setParsed(res)
      if (res.fatal) toast.error('No se pudo leer la lista', res.fatal)
      else {
        setStep('preview')
        setOnlyErrors(res.stats.errors > 0)
      }
    } catch (e) {
      toast.error('No se pudo abrir el archivo', (e as Error).message || 'Verifica que sea un .xlsx o .csv válido.')
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const rows = useMemo(() => (parsed ? (onlyErrors ? parsed.rows.filter((r) => r.status === 'error') : parsed.rows) : []), [parsed, onlyErrors])
  const stats = parsed?.stats
  const hasErrors = (stats?.errors ?? 0) > 0
  const toImport = parsed?.rows.filter((r) => r.status !== 'error') ?? []
  const canImport = !!stats && toImport.length > 0 && (!hasErrors || skipInvalid)

  async function doImport() {
    try {
      const res = await importer.mutateAsync({ rows: toImport.map((r) => r.data), updateExisting })
      setSummary(res)
      setStep('done')
    } catch (e) {
      toast.error('No se pudo importar', (e as Error).message)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDrag(false)
    void handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size={step === 'preview' ? 'xl' : 'md'}
      title="Importar lista de estudiantes"
      subtitle={step === 'preview' ? fileName : 'Desde Excel (.xlsx) o CSV'}
      footer={
        step === 'preview' ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Elegir otro archivo
            </Button>
            <Button variant="success" onClick={() => void doImport()} disabled={!canImport || importer.isPending}>
              {importer.isPending ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              Importar {toImport.length} estudiante{toImport.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : step === 'done' ? (
          <Button variant="success" onClick={close}>
            Listo
          </Button>
        ) : undefined
      }
    >
      {step === 'pick' && (
        <div className="flex flex-col gap-5">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              drag ? 'border-uap-green bg-uap-green/8' : 'border-line hover:border-uap-green/60',
            )}
          >
            {reading ? <Loader2 className="size-12 animate-spin text-uap-green" /> : <FileSpreadsheet className="size-12 text-uap-green" />}
            <p className="font-display text-xl font-bold">{reading ? 'Leyendo la lista…' : 'Arrastra aquí tu Excel'}</p>
            <p className="text-ink-soft">o haz clic para elegirlo (.xlsx o .csv)</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-uap-blue/5 p-4 dark:bg-white/5">
            <p className="text-sm text-ink-soft">
              Columnas: <strong>codigo_universitario, ci, apellidos, nombres, correo, carrera</strong>. También se acepta una sola
              columna “Apellidos y nombres”.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void downloadStudentTemplate()}>
              <Download className="size-4" /> Descargar plantilla
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && stats && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{stats.total} filas</Badge>
            <Badge tone="green">{stats.new} nuevos</Badge>
            <Badge tone="blue">{stats.existing} ya registrados</Badge>
            <Badge tone="neutral">{stats.enrolled} ya inscritos</Badge>
            <Badge tone={hasErrors ? 'red' : 'green'}>
              {hasErrors ? `${stats.errors} con errores` : 'Sin errores'}
            </Badge>
          </div>

          {hasErrors ? (
            <div className="rounded-2xl border border-uap-red/30 bg-uap-red/8 p-4">
              <p className="flex items-center gap-2 font-semibold text-uap-red dark:text-game-coral">
                <AlertTriangle className="size-5" /> Hay {stats.errors} fila{stats.errors === 1 ? '' : 's'} con errores
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Corrígelas en tu Excel y vuelve a subirlo, o importa solo las filas válidas.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5 accent-uap-green" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                Importar solo las {toImport.length} filas válidas
              </label>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-uap-green/10 p-3 font-semibold text-uap-green dark:text-game-selva">
              <CheckCircle2 className="size-5" /> Todo correcto. Revisa la lista y presiona “Importar”.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-uap-blue" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
              Mostrar solo filas con errores
            </label>
            {stats.existing > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-uap-blue" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Actualizar los datos de los {stats.existing} ya registrados
              </label>
            )}
          </div>

          <div className="max-h-[50dvh] overflow-auto rounded-2xl border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-uap-blue text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Fila</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">RU</th>
                  <th className="px-3 py-2 text-left">Apellidos</th>
                  <th className="px-3 py-2 text-left">Nombres</th>
                  <th className="px-3 py-2 text-left">CI</th>
                  <th className="px-3 py-2 text-left">Correo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNumber} className={cn('border-t border-line align-top', r.status === 'error' && 'bg-uap-red/8')}>
                    <td className="px-3 py-2 font-mono text-ink-soft">{r.rowNumber}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS[r.status].tone}>
                        {r.status === 'error' && <XCircle className="size-3.5" />}
                        {STATUS[r.status].label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-semibold">{r.data.university_code || <Missing />}</td>
                    <td className="px-3 py-2">{r.data.last_names || <Missing />}</td>
                    <td className="px-3 py-2">{r.data.first_names || <Missing />}</td>
                    <td className="px-3 py-2">{r.data.ci}</td>
                    <td className="px-3 py-2">
                      {r.data.email}
                      {r.data.phone && <span className="block text-xs text-ink-soft">cel. {r.data.phone}</span>}
                      {[...r.errors, ...r.warnings].map((m) => (
                        <p
                          key={m}
                          className={cn('mt-1 text-xs font-semibold', r.errors.includes(m) ? 'text-uap-red dark:text-game-coral' : 'text-[#8f6c12] dark:text-uap-gold-300')}
                        >
                          {r.errors.includes(m) ? '✖ ' : '⚠ '}
                          {m}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="grid size-20 place-items-center rounded-3xl bg-uap-green/15">
            <PartyPopper className="size-10 text-uap-green dark:text-game-selva" />
          </div>
          <p className="font-display text-2xl font-black">¡Lista importada!</p>
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat n={summary.enrolled} label="Inscritos ahora" />
            <Stat n={summary.created} label="Estudiantes nuevos" />
            <Stat n={summary.existing + summary.updated} label="Ya existían" />
            <Stat n={summary.already_enrolled} label="Ya estaban inscritos" />
          </div>
        </div>
      )}
    </Modal>
  )
}

function Missing() {
  return <span className="font-semibold text-uap-red dark:text-game-coral">(vacío)</span>
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] p-3">
      <p className="font-display text-3xl font-black">{n}</p>
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
    </div>
  )
}
