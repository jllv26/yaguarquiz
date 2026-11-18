import { useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, Download, Info, Link2, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { MODE_LABEL, saveManualScore, setSessionItem, useGradebook } from '../../lib/api/reports'
import { cn } from '../../lib/cn'
import { fmtDay as fmtDate } from '../../lib/dates'
import { buildWorkbook, downloadBlob, headerCell, titleCell } from '../../lib/excel'
import { computeGradebook, type GbData, type GbItem } from '../../lib/gradebook'
import { TERM_LABEL } from './gradingDefaults'

const fmt = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100).replace('.', ','))

/** Libreta de notas: convierte las notas de cada actividad al plan 30 + 30 + 40 (o el que tenga la asignatura). */
export function GradebookTab({ subjectId }: { subjectId: string }) {
  const gb = useGradebook(subjectId)
  if (gb.isLoading) return <Skeleton className="h-80" />
  if (!gb.data) return <SolidCard className="p-6 text-center text-ink-soft">{(gb.error as Error | null)?.message ?? 'No se pudo cargar la libreta.'}</SolidCard>
  if (!gb.data.plan?.items.length)
    return (
      <SolidCard className="p-8">
        <EmptyState icon={<BookOpenCheck className="size-8" />} title="Primero defina el plan de calificación" text="En la pestaña “Plan de calificación” guarde las categorías y sus pesos (por defecto 30 + 30 + 40)." />
      </SolidCard>
    )
  return <Book data={gb.data} />
}

function Book({ data }: { data: GbData }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { rows, items, terms, maxByTerm } = useMemo(() => computeGradebook(data), [data])
  const pass = Number(data.plan?.pass_mark ?? 51)
  const passed = rows.filter((r) => r.passed).length
  const sessionsOf = (it: GbItem) => data.sessions.filter((s) => s.grading_item_id === it.id)
  const unlinked = data.sessions.filter((s) => !s.grading_item_id)
  const refresh = () => qc.invalidateQueries({ queryKey: ['gradebook', data.subject.id] })

  async function exportExcel() {
    const head1: (string | ReturnType<typeof headerCell>)[] = [headerCell('N°'), headerCell('RU'), headerCell('Apellidos y nombres')]
    for (const t of terms) {
      for (const it of items.filter((i) => i.term === t)) head1.push(headerCell(`${TERM_LABEL(t)} · ${it.category} (${it.weight})`))
      head1.push(headerCell(`Total ${TERM_LABEL(t).toLowerCase()} (${maxByTerm[t]})`))
    }
    head1.push(headerCell('Nota final (100)'), headerCell('Observación'))
    const body = rows.map((r, i) => {
      const line: (string | number)[] = [i + 1, r.student.code, r.student.name]
      for (const t of terms) {
        for (const it of items.filter((x) => x.term === t)) line.push(r.cells[it.id].contribution ?? '')
        line.push(r.termTotals[t] ?? 0)
      }
      line.push(r.finalRounded, r.pending ? `${r.passed ? 'Aprobado' : 'Reprobado'} (faltan ${r.pending} notas)` : r.passed ? 'Aprobado' : 'Reprobado')
      return line
    })
    const acts = [
      ['RU', 'Apellidos y nombres', ...data.sessions.map((s) => `${s.title} (${fmtDate(s.date)})`)].map(headerCell),
      ...data.students.map((st) => [st.code, st.name, ...data.sessions.map((s) => data.grades.find((g) => g.session_id === s.id && g.student_id === st.id)?.grade ?? (s.done ? 0 : ''))]),
    ]
    const blob = await buildWorkbook([
      {
        sheet: 'Libreta',
        data: [
          [titleCell(`Libreta de notas — ${data.subject.code} Paralelo ${data.subject.parallel}`)],
          [`${data.subject.name}${data.subject.period ? ` · ${data.subject.period}` : ''} · Aprobación: ${pass} · Cada celda es el aporte = (nota/100) × peso`],
          [],
          head1,
          ...body,
        ],
        columns: [{ width: 5 }, { width: 13 }, { width: 32 }, ...head1.slice(3).map(() => ({ width: 14 }))],
        stickyRowsCount: 4,
      },
      { sheet: 'Notas por actividad', data: acts, columns: [{ width: 13 }, { width: 32 }, ...data.sessions.map(() => ({ width: 18 }))], stickyRowsCount: 1 },
    ])
    downloadBlob(blob, `Libreta ${data.subject.code} ${data.subject.parallel}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex max-w-3xl items-start gap-2 text-sm text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Cada celda muestra el <strong>aporte</strong> = (nota / 100) × peso. Varias actividades en la misma categoría se promedian; si una actividad ya cerró y el estudiante no
            participó, cuenta 0. Las categorías manuales se escriben aquí directamente (nota sobre 100).
          </span>
        </p>
        <Button variant="success" onClick={() => void exportExcel()}>
          <Download className="size-4" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Estudiantes" value={rows.length} />
        <Mini label={`Aprobados (≥${pass})`} value={`${passed}/${rows.length}`} />
        <Mini label="Actividades con nota" value={data.sessions.filter((s) => s.grading_item_id).length} />
        <Mini label="Promedio final" value={rows.length ? Math.round((rows.reduce((a, r) => a + r.final, 0) / rows.length) * 10) / 10 : '—'} />
      </div>

      <SolidCard className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-uap-blue text-white">
                <th rowSpan={2} className="sticky left-0 z-20 bg-uap-blue px-3 py-2 text-left">
                  Estudiante
                </th>
                {terms.map((t) => (
                  <th key={t} colSpan={items.filter((i) => i.term === t).length + 1} className="border-l border-white/20 px-2 py-1.5 text-center font-display">
                    {TERM_LABEL(t)} ({maxByTerm[t]} pts)
                  </th>
                ))}
                <th rowSpan={2} className="border-l border-white/20 px-3 py-2 text-center font-display">
                  Final
                  <span className="block text-[10px] font-normal opacity-80">sobre 100</span>
                </th>
              </tr>
              <tr className="bg-uap-blue/90 text-white">
                {terms.flatMap((t) => [
                  ...items
                    .filter((i) => i.term === t)
                    .map((it) => (
                      <th key={it.id} className="max-w-28 border-l border-white/20 px-2 py-1.5 text-center align-top text-[11px] font-semibold leading-tight" title={sessionsOf(it).map((s) => s.title).join(', ')}>
                        {it.category}
                        <span className="block font-normal opacity-80">
                          {it.weight} pts · {it.source === 'manual' ? 'manual' : `${sessionsOf(it).length} act.`}
                        </span>
                      </th>
                    )),
                  <th key={`t${t}`} className="border-l border-white/20 bg-uap-blue-900/40 px-2 py-1.5 text-center text-[11px]">
                    Total
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student.id} className="odd:bg-ink/[0.02]">
                  <td className="sticky left-0 z-[5] border-b border-line bg-surface px-3 py-1.5">
                    <span className="block max-w-56 truncate font-semibold">{r.student.name}</span>
                    <span className="text-xs text-ink-soft">RU {r.student.code}</span>
                  </td>
                  {terms.flatMap((t) => [
                    ...items
                      .filter((i) => i.term === t)
                      .map((it) =>
                        it.source === 'manual' ? (
                          <td key={it.id} className="border-b border-l border-line px-1 py-1 text-center">
                            <ManualInput
                              item={it}
                              studentId={r.student.id}
                              value={r.cells[it.id].score}
                              contribution={r.cells[it.id].contribution}
                              onSaved={() => void refresh()}
                              onError={(m) => toast.error('No se pudo guardar', m)}
                            />
                          </td>
                        ) : (
                          <td
                            key={it.id}
                            className="border-b border-l border-line px-2 py-1 text-center tabular-nums"
                            title={r.cells[it.id].parts.map((p) => `${data.sessions.find((s) => s.id === p.session_id)?.title}: ${p.grade ?? 'sin nota'}`).join('\n') || 'Sin actividades vinculadas'}
                          >
                            {r.cells[it.id].contribution === null ? <span className="text-ink-soft/60">·</span> : <span className="font-semibold">{fmt(r.cells[it.id].contribution)}</span>}
                            {r.cells[it.id].score !== null && <span className="block text-[10px] text-ink-soft">{fmt(r.cells[it.id].score)}/100</span>}
                          </td>
                        ),
                      ),
                    <td key={`t${t}`} className="border-b border-l border-line bg-uap-blue/5 px-2 py-1 text-center font-display font-bold tabular-nums">
                      {fmt(r.termTotals[t] ?? 0)}
                    </td>,
                  ])}
                  <td className="border-b border-l border-line px-3 py-1 text-center">
                    <span className={cn('font-display text-xl font-black tabular-nums', r.passed ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral')}>{r.finalRounded}</span>
                    {r.pending > 0 && <span className="block text-[10px] text-ink-soft">faltan {r.pending}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SolidCard>

      <Activities data={data} unlinked={unlinked} onChange={() => void refresh()} />
    </div>
  )
}

function ManualInput({
  item,
  studentId,
  value,
  contribution,
  onSaved,
  onError,
}: {
  item: GbItem
  studentId: string
  value: number | null
  contribution: number | null
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [v, setV] = useState(value === null ? '' : String(value))
  const [busy, setBusy] = useState(false)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setV(value === null ? '' : String(value))
  }
  async function save() {
    const t = v.trim().replace(',', '.')
    const n = t === '' ? null : Number(t)
    if (n === value) return
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
      onError('La nota debe estar entre 0 y 100')
      setV(value === null ? '' : String(value))
      return
    }
    setBusy(true)
    try {
      await saveManualScore(item.id, studentId, n)
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-col items-center">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="—"
        aria-label={`${item.category}, nota sobre 100`}
        className={cn('h-8 w-14 rounded-lg border border-line bg-surface-2 text-center tabular-nums focus:border-uap-green focus:outline-none', busy && 'opacity-50')}
      />
      <span className="text-[10px] text-ink-soft">{contribution === null ? '/100' : `aporta ${fmt(contribution)}`}</span>
    </span>
  )
}

function Activities({ data, unlinked, onChange }: { data: GbData; unlinked: GbData['sessions']; onChange: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const items = (data.plan?.items ?? []).filter((i) => i.source === 'yaguarquiz')
  async function link(sessionId: string, itemId: string) {
    setBusy(sessionId)
    try {
      await setSessionItem(sessionId, itemId || null)
      onChange()
    } catch (e) {
      toast.error('No se pudo vincular', (e as Error).message)
    } finally {
      setBusy('')
    }
  }
  if (!data.sessions.length) return null
  return (
    <SolidCard className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
        <Link2 className="size-5" /> Actividades de esta asignatura
      </h3>
      <p className="mb-3 text-sm text-ink-soft">Elija a qué categoría corresponde cada actividad. Las que quedan “solo práctica” no cuentan para la nota.</p>
      <ul className="divide-y divide-line">
        {[...unlinked, ...data.sessions.filter((s) => s.grading_item_id)].map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <Link to={`/admin/reportes/${s.id}`} className="font-semibold hover:underline">
                {s.title}
              </Link>
              <span className="ml-2 text-xs text-ink-soft">
                {MODE_LABEL[s.mode as keyof typeof MODE_LABEL] ?? s.mode} · {fmtDate(s.date)}
                {!s.done && ' · todavía abierta'}
              </span>
            </span>
            {busy === s.id && <Loader2 className="size-4 animate-spin" />}
            <select
              value={s.grading_item_id ?? ''}
              onChange={(e) => void link(s.id, e.target.value)}
              className={cn('h-10 max-w-80 rounded-xl border-2 bg-surface-2 px-3 text-sm', s.grading_item_id ? 'border-uap-green' : 'border-line')}
              aria-label={`Categoría de ${s.title}`}
            >
              <option value="">— Solo práctica —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {TERM_LABEL(i.term)} · {i.category} ({i.weight})
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </SolidCard>
  )
}

const Mini = ({ label, value }: { label: string; value: string | number }) => (
  <SolidCard className="p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
    <p className="font-display text-2xl font-black tabular-nums">{value}</p>
  </SolidCard>
)
