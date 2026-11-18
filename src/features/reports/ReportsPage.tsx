import { motion } from 'framer-motion'
import { BarChart3, CheckCircle2, ChevronRight, CloudOff, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SolidCard } from '../../components/ui/Card'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { MODE_LABEL, useReportList } from '../../lib/api/reports'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'

export function ReportsPage() {
  const list = useReportList()
  const [subject, setSubject] = useState('')
  const subjects = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of list.data ?? []) m.set(r.subject_id, `${r.code} · Paralelo ${r.parallel}`)
    return [...m.entries()]
  }, [list.data])
  const rows = (list.data ?? []).filter((r) => !subject || r.subject_id === subject)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Reportes</h1>
          <p className="text-ink-soft">Resultados de cada sesión, preguntas difíciles y envío a Google Sheets. La libreta de notas está en cada asignatura.</p>
        </div>
        {subjects.length > 1 && (
          <Select aria-label="Filtrar por asignatura" value={subject} onChange={(e) => setSubject(e.target.value)} className="min-w-64">
            <option value="">Todas las asignaturas</option>
            {subjects.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {list.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !rows.length ? (
        <SolidCard className="p-8">
          <EmptyState icon={<BarChart3 className="size-8" />} title="Todavía no hay resultados" text="Cuando sus estudiantes respondan una sesión en vivo, un examen o una tarea, su reporte aparecerá aquí." />
        </SolidCard>
      ) : (
        <SolidCard className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <Link to={`/admin/reportes/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink/[0.03]">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: r.theme_color ?? '#1B7339' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-display font-bold">{r.quiz_title}</span>
                      <Badge tone="neutral">{MODE_LABEL[r.mode]}</Badge>
                      {!r.done && <Badge tone="gold">En curso</Badge>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
                      <span>
                        {r.code} · Paralelo {r.parallel}
                      </span>
                      <span>{fmtDateTime(r.date)}</span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" /> {r.participants}
                      </span>
                    </span>
                  </span>
                  {r.sync_status === 'ok' && <CheckCircle2 className="size-5 text-uap-green" aria-label="Enviado a Google Sheets" />}
                  {r.sync_status === 'error' && <CloudOff className="size-5 text-game-coral" aria-label="Error al enviar a Google Sheets" />}
                  <span className="w-20 text-right">
                    <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">Promedio</span>
                    <span className={cn('font-display text-2xl font-black tabular-nums', r.average !== null && Number(r.average) < 51 && 'text-uap-red dark:text-game-coral')}>
                      {r.average === null ? '—' : Number(r.average)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-ink-soft" />
                </Link>
              </motion.li>
            ))}
          </ul>
        </SolidCard>
      )}
    </div>
  )
}
