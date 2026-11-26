import { CheckCircle2, CircleDashed, Clock, DoorOpen, Printer, Search, UserSearch, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { useEnrolled } from '../../lib/api/academic'
import { useSubjectsLite } from '../../lib/api/quizzes'
import { useStudentTrace, type TraceRow } from '../../lib/api/studentTrace'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'
import { normalizeText } from '../../lib/text'

const KIND: Record<TraceRow['kind'], { label: string; tone: 'blue' | 'green' | 'violet' | 'gold' | 'red' | 'neutral' }> = {
  clase: { label: 'Clase', tone: 'blue' },
  casa: { label: 'Casa', tone: 'green' },
  inv: { label: 'Investigación', tone: 'violet' },
  actividad: { label: 'Actividad', tone: 'neutral' },
  examen: { label: 'Examen', tone: 'red' },
  vivo: { label: 'En vivo', tone: 'gold' },
  tarea: { label: 'Tarea', tone: 'neutral' },
}
const REASON: Record<string, string> = { student: 'la entregó', time: 'se acabó el tiempo', closed: 'cerró la actividad', teacher: 'la cerró el docente' }
const hm = (ts: string) => new Date(ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })
const dur = (a: string, b: string) => {
  const m = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Reporte de seguimiento de un estudiante: qué hizo en cada actividad y evaluación, con horas y notas. */
export function StudentTracePage() {
  const [params, setParams] = useSearchParams()
  const subjects = useSubjectsLite()
  const subjectId = params.get('asignatura') ?? ''
  const studentId = params.get('estudiante') ?? ''
  const roster = useEnrolled(subjectId)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'todas' | 'hechas' | 'abiertas' | 'nunca'>('todas')
  const trace = useStudentTrace(subjectId, studentId)

  // con una sola asignatura, se elige sola
  useEffect(() => {
    if (!subjectId && subjects.data?.length === 1) setParams({ asignatura: subjects.data[0].id }, { replace: true })
  }, [subjectId, subjects.data, setParams])

  const student = roster.data?.find((s) => s.id === studentId)
  const matches = useMemo(() => {
    const n = normalizeText(q)
    if (!n) return roster.data ?? []
    return (roster.data ?? []).filter((s) => normalizeText(`${s.last_names} ${s.first_names} ${s.university_code}`).includes(n))
  }, [roster.data, q])

  const rows = (trace.data?.rows ?? []).filter((r) => {
    const done = r.attempts.some((a) => a.submitted_at) || (r.mode === 'live' && r.live_answers > 0)
    if (filter === 'hechas') return done
    if (filter === 'abiertas') return r.entered && !done
    if (filter === 'nunca') return !r.entered
    return true
  })
  const sum = trace.data?.summary

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl font-black">Seguimiento por estudiante</h1>
          <p className="text-ink-soft">Busca a un estudiante y mira, actividad por actividad, si entró, cuándo empezó y entregó, cuántas respondió y su nota.</p>
        </div>
        <Link to="/admin/reportes" className="text-sm font-semibold text-uap-blue hover:underline dark:text-game-electric">
          ← Volver a reportes
        </Link>
      </div>

      <SolidCard className="grid gap-3 p-4 md:grid-cols-[16rem_1fr] print:hidden">
        <Select aria-label="Asignatura" value={subjectId} onChange={(e) => setParams(e.target.value ? { asignatura: e.target.value } : {})}>
          <option value="">Elige la asignatura…</option>
          {(subjects.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · Paralelo {s.parallel}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <Input
            aria-label="Buscar estudiante por nombre o RU"
            placeholder={subjectId ? 'Escribe un apellido, nombre o RU…' : 'Primero elige la asignatura'}
            disabled={!subjectId}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-12"
          />
        </div>
        {subjectId && (q || !studentId) && (
          <ul className="max-h-72 overflow-y-auto rounded-2xl border border-line md:col-span-2">
            {roster.isLoading && <li className="p-3 text-ink-soft">Cargando lista…</li>}
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  className={cn('flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-ink/5', s.id === studentId && 'bg-uap-blue/10 font-bold')}
                  onClick={() => {
                    setParams({ asignatura: subjectId, estudiante: s.id })
                    setQ('')
                  }}
                >
                  <span>
                    {s.last_names} {s.first_names}
                  </span>
                  <span className="font-mono text-sm text-ink-soft">RU {s.university_code}</span>
                </button>
              </li>
            ))}
            {!roster.isLoading && !matches.length && <li className="p-3 text-ink-soft">Nadie coincide con «{q}».</li>}
          </ul>
        )}
      </SolidCard>

      {!studentId ? (
        <SolidCard className="p-8">
          <EmptyState icon={<UserSearch className="size-8" />} title="Elige un estudiante" text="Busca por apellido, nombre o RU y tócalo para ver su reporte." />
        </SolidCard>
      ) : trace.isLoading || !student ? (
        <Skeleton className="h-96" />
      ) : trace.error ? (
        <SolidCard className="p-6 text-uap-red">No se pudo cargar: {(trace.error as Error).message}</SolidCard>
      ) : (
        <>
          <SolidCard className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Reporte de seguimiento</p>
              <h2 className="font-display text-2xl font-black">
                {student.last_names} {student.first_names}
              </h2>
              <p className="text-ink-soft">
                RU {student.university_code} · generado el {fmtDateTime(new Date().toISOString())}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Stat icon={<CheckCircle2 className="size-5 text-uap-green" />} n={sum?.done ?? 0} label="hechas" />
              <Stat icon={<DoorOpen className="size-5 text-uap-gold" />} n={sum?.opened ?? 0} label="abrió sin terminar" />
              <Stat icon={<CircleDashed className="size-5 text-ink-soft" />} n={sum?.never ?? 0} label="nunca entró" />
              <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden">
                <Printer className="size-4" /> Imprimir
              </Button>
            </div>
          </SolidCard>

          <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filtrar">
            {(
              [
                ['todas', `Todas (${sum?.total ?? 0})`],
                ['hechas', `Hechas (${sum?.done ?? 0})`],
                ['abiertas', `Abrió sin terminar (${sum?.opened ?? 0})`],
                ['nunca', `Nunca entró (${sum?.never ?? 0})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn('rounded-full border-2 px-3 py-1 text-sm font-semibold', filter === k ? 'border-uap-blue bg-uap-blue text-white' : 'border-line hover:bg-ink/5')}
              >
                {label}
              </button>
            ))}
          </div>

          <SolidCard className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Actividad</th>
                  <th className="px-4 py-3">Cuándo</th>
                  <th className="px-4 py-3">Qué pasó</th>
                  <th className="px-4 py-3 text-right">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <TraceLine key={r.session_id} r={r} />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                      Nada en este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SolidCard>
          <p className="text-xs text-ink-soft">
            Cada respuesta queda registrada con la hora en que el estudiante la dio, entrando con su RU y su CI. Al resolver todo, una actividad se entrega sola. La nota de la
            actividad es la de su mejor intento.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-2xl bg-ink/5 px-3 py-2">
      {icon}
      <span className="font-display text-xl font-black tabular-nums">{n}</span>
      <span className="text-sm text-ink-soft">{label}</span>
    </span>
  )
}

function TraceLine({ r }: { r: TraceRow }) {
  const k = KIND[r.kind]
  const best = r.attempts.reduce<number | null>((m, a) => (a.grade !== null && (m === null || a.grade > m) ? a.grade : m), null)
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{r.title}</span>
          <span className="flex gap-1">
            <Badge tone={k.tone}>{k.label}</Badge>
            {r.mode !== 'live' && <Badge tone="neutral">{r.max_attempts} intento{r.max_attempts === 1 ? '' : 's'}</Badge>}
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {r.attempts.length ? (
          r.attempts.map((a) => (
            <div key={a.number} className="tabular-nums">
              {r.attempts.length > 1 && <span className="text-ink-soft">#{a.number} </span>}
              {fmtDateTime(a.started_at)}
              {a.submitted_at ? ` → ${hm(a.submitted_at)}` : ''}
              {a.submitted_at && <span className="text-ink-soft"> ({dur(a.started_at, a.submitted_at)})</span>}
            </div>
          ))
        ) : r.entered && r.last_seen ? (
          <span className="text-ink-soft">{fmtDateTime(r.last_seen)}</span>
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {r.mode === 'live' ? (
          r.live_answers ? (
            <span>
              Jugó en vivo: {r.live_answers} respuestas, {r.live_correct} bien
            </span>
          ) : r.entered ? (
            <span className="text-uap-gold">Entró a la sala pero no respondió</span>
          ) : (
            <Never />
          )
        ) : r.attempts.length ? (
          r.attempts.map((a) => (
            <div key={a.number} className="flex flex-wrap items-center gap-x-2">
              {a.submitted_at ? <CheckCircle2 className="size-4 text-uap-green" /> : <Clock className="size-4 text-uap-gold" />}
              <span>
                {a.answers} respuesta{a.answers === 1 ? '' : 's'}
                {a.answers ? `, ${a.correct} bien` : ''} · {a.submitted_at ? REASON[a.submit_reason ?? 'student'] : 'en curso, sin entregar'}
              </span>
              {(a.focus_losses > 0 || a.paste_count > 0) && (
                <span className="text-xs text-uap-red">
                  {a.focus_losses ? `${a.focus_losses} salida${a.focus_losses === 1 ? '' : 's'} de pantalla` : ''}
                  {a.focus_losses && a.paste_count ? ' · ' : ''}
                  {a.paste_count ? `${a.paste_count} intento${a.paste_count === 1 ? '' : 's'} de pegar` : ''}
                </span>
              )}
            </div>
          ))
        ) : r.entered ? (
          <span className="flex items-center gap-1.5 text-uap-gold">
            <DoorOpen className="size-4" /> La abrió, pero no empezó
          </span>
        ) : (
          <Never />
        )}
      </td>
      <td className="px-4 py-3 text-right font-display text-lg font-black tabular-nums">
        {best === null ? <span className="text-ink-soft">—</span> : <span className={cn(best < 51 && 'text-uap-red dark:text-game-coral')}>{Math.round(best * 100) / 100}</span>}
      </td>
    </tr>
  )
}

const Never = () => (
  <span className="flex items-center gap-1.5 text-ink-soft">
    <XCircle className="size-4" /> Nunca entró
  </span>
)
