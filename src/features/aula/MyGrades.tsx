import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, Trophy } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Field'
import { portalGrades } from '../../lib/api/portal'
import { cn } from '../../lib/cn'
import { computeGradebook } from '../../lib/gradebook'

const TERM = ['', 'Primer parcial', 'Segundo parcial', 'Tercer parcial', 'Cuarto parcial']
const fmt = (n: number) => n.toLocaleString('es-BO', { maximumFractionDigits: 2 })

/** «Mis notas»: lo que lleva el estudiante en cada categoría y parcial, calculado igual que la libreta del docente. */
export function MyGrades({ code, ru, ci }: { code: string; ru: string; ci: string }) {
  const q = useQuery({
    queryKey: ['portal-grades', code, ru],
    queryFn: () => portalGrades(code, ru, ci),
    staleTime: 30_000,
  })
  if (q.isLoading) return <Skeleton className="h-64" />
  if (q.error || !q.data || !q.data.ok) return <Card className="text-center text-ink-soft">No se pudieron cargar tus notas. Toca ↻ para intentar otra vez.</Card>
  const d = q.data
  if (!d.plan) return <Card className="text-center text-ink-soft">El docente todavía no publicó el plan de calificación.</Card>
  const { rows, items, terms, maxByTerm } = computeGradebook(d)
  const row = rows[0]
  const hidden = new Set(d.sessions.filter((s) => !s.show_grade).map((s) => s.id))
  const title = (id: string) => d.sessions.find((s) => s.id === id)?.title ?? 'Actividad'
  // solo los parciales que se califican en el sistema (los anteriores se registraron fuera y saldrían como 0)
  const linked = new Set(d.sessions.map((s) => s.grading_item_id))
  const manual = new Set(d.manual.map((m) => m.item_id))
  const active = terms.filter((t) => items.some((i) => i.term === t && (linked.has(i.id) || manual.has(i.id))))
  if (!active.length) return <Card className="text-center text-ink-soft">Todavía no tienes notas registradas en esta materia.</Card>
  const cur = active[active.length - 1]
  const curPending = items.filter((i) => i.term === cur && row.cells[i.id].contribution === null).length
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-uap-gold/20 text-uap-gold">
          <Trophy className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Llevas en el {TERM[cur]?.toLowerCase() ?? `parcial ${cur}`}</p>
          <p className="font-display text-4xl font-black tabular-nums">
            {fmt(row.termTotals[cur] ?? 0)} <span className="text-lg text-ink-soft">de {fmt(maxByTerm[cur])} puntos</span>
          </p>
          <p className="text-xs text-ink-soft">
            {curPending > 0
              ? `Faltan ${curPending} ${curPending === 1 ? 'categoría' : 'categorías'} por calificar: tu nota todavía puede subir.`
              : 'Todas las categorías de este parcial ya tienen nota.'}
          </p>
        </div>
      </Card>

      {active
        .slice()
        .reverse()
        .map((term) => {
          const its = items.filter((i) => i.term === term)
          return (
            <section key={term} className="flex flex-col gap-2">
              <h2 className="flex items-baseline justify-between px-1 font-display text-lg font-black">
                <span>{TERM[term] ?? `Parcial ${term}`}</span>
                <span className="tabular-nums">
                  {fmt(row.termTotals[term] ?? 0)} <span className="text-sm text-ink-soft">de {fmt(maxByTerm[term])}</span>
                </span>
              </h2>
              {its.map((it, k) => {
                const c = row.cells[it.id]
                const pct = c.score === null ? 0 : c.score
                const parts = c.parts.filter((p) => d.sessions.find((s) => s.id === p.session_id)).sort((a, b) => title(a.session_id).localeCompare(title(b.session_id), 'es', { numeric: true }))
                const counted = parts.filter((p) => p.grade !== null || d.sessions.find((s) => s.id === p.session_id)?.done).length
                const waiting = parts.length - counted
                return (
                  <motion.div key={it.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k * 0.05, 0.4) }}>
                    <Card className="flex flex-col gap-2" data-rubro={it.category}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display font-black leading-tight">{it.category}</p>
                          <p className="text-xs text-ink-soft">
                            {c.score === null
                              ? waiting
                                ? `${waiting} ${waiting === 1 ? 'actividad' : 'actividades'} por hacer`
                                : it.source === 'manual'
                                  ? 'Pendiente · la nota la pone el docente'
                                  : 'Pendiente · aún no hay actividades'
                              : it.source === 'manual'
                                ? `Nota del docente: ${fmt(c.score)}/100`
                                : `Promedio de ${counted} ${counted === 1 ? 'actividad' : 'actividades'}: ${fmt(c.score)}/100${waiting ? ` · ${waiting} por hacer` : ''}`}
                          </p>
                        </div>
                        <p className="shrink-0 text-right font-display text-2xl font-black tabular-nums">
                          {c.contribution === null ? <Clock className="inline size-5 text-ink-soft" /> : fmt(c.contribution)}
                          <span className="text-sm text-ink-soft"> / {fmt(it.weight)}</span>
                        </p>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                        <motion.div
                          className={cn('h-full rounded-full', pct >= 51 ? 'bg-uap-green' : 'bg-uap-red')}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.2 }}
                        />
                      </div>
                      {parts.length > 0 && (
                        <details className="text-sm">
                          <summary className="cursor-pointer font-semibold text-uap-blue dark:text-game-electric">Ver actividades</summary>
                          <ul className="mt-2 flex flex-col gap-1">
                            {parts.map((p) => {
                              const s = d.sessions.find((x) => x.id === p.session_id)
                              const g = hidden.has(p.session_id) ? null : p.grade
                              return (
                                <li key={p.session_id} className="flex items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-1.5">
                                  <span className="min-w-0 truncate">{title(p.session_id)}</span>
                                  <span className="shrink-0 font-bold tabular-nums">
                                    {p.grade !== null ? (
                                      g !== null ? (
                                        `${fmt(g)}`
                                      ) : (
                                        <CheckCircle2 className="inline size-4 text-uap-green" aria-label="Entregada" />
                                      )
                                    ) : s?.done ? (
                                      <span className="text-uap-red">0 · no la hiciste</span>
                                    ) : (
                                      <span className="text-ink-soft">por hacer</span>
                                    )}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </details>
                      )}
                    </Card>
                  </motion.div>
                )
              })}
            </section>
          )
        })}
      <p className="px-1 text-xs text-ink-soft">
        Cómo se calcula: en cada categoría se promedian tus actividades (si una ya cerró y no la hiciste, cuenta 0) y ese promedio se convierte a los puntos de la categoría.
        Ejemplo: promedio 80 en una categoría de 5 puntos = 4 puntos.
        {active.length < terms.length && ' Las notas de los parciales anteriores están en la libreta oficial del docente.'}
      </p>
    </div>
  )
}
