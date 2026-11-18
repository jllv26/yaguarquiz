import { Calculator, CheckCircle2, Plus, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useGradingPlan, useSaveGradingPlan } from '../../lib/api/academic'
import { cn } from '../../lib/cn'
import type { GradingItem, GradingSource } from '../../types/db'
import { DEFAULT_GRADING_PLAN, TERM_LABEL } from './gradingDefaults'

interface Row {
  key: string
  category: string
  source: GradingSource
  weights: Record<number, string> // term -> texto del input ('' = no aplica)
}

let rowSeq = 0
const newKey = () => `r${++rowSeq}`

function toRows(items: GradingItem[]): { rows: Row[]; terms: number[] } {
  const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const rows: Row[] = []
  const terms = new Set<number>()
  for (const it of sorted) {
    terms.add(it.term)
    let r = rows.find((x) => x.category === it.category)
    if (!r) {
      r = { key: newKey(), category: it.category, source: it.source, weights: {} }
      rows.push(r)
    }
    r.weights[it.term] = String(it.weight)
  }
  return { rows, terms: [...terms].sort((a, b) => a - b) }
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : 0
}
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-BO')

export function GradingTab({ subjectId }: { subjectId: string }) {
  const plan = useGradingPlan(subjectId)
  if (plan.isLoading) return <Skeleton className="h-96" />
  return <GradingEditor key={plan.data?.id ?? 'none'} subjectId={subjectId} initialItems={plan.data?.grading_items ?? []} initialPass={plan.data?.pass_mark ?? 51} hasPlan={!!plan.data} />
}

function GradingEditor({
  subjectId,
  initialItems,
  initialPass,
  hasPlan,
}: {
  subjectId: string
  initialItems: GradingItem[]
  initialPass: number
  hasPlan: boolean
}) {
  const toast = useToast()
  const save = useSaveGradingPlan(subjectId)
  const start = toRows(initialItems.length ? initialItems : DEFAULT_GRADING_PLAN)
  const [rows, setRows] = useState<Row[]>(start.rows)
  const [terms, setTerms] = useState<number[]>(start.terms)
  const [pass, setPass] = useState(String(initialPass))
  const [dirty, setDirty] = useState(!hasPlan)

  const termTotals = useMemo(() => terms.map((t) => rows.reduce((s, r) => s + num(r.weights[t]), 0)), [rows, terms])
  const total = termTotals.reduce((a, b) => a + b, 0)
  const ok = Math.abs(total - 100) < 0.001
  const sistema = rows.reduce((s, r) => s + (r.source === 'yaguarquiz' ? terms.reduce((a, t) => a + num(r.weights[t]), 0) : 0), 0)

  const update = (fn: (rs: Row[]) => Row[]) => {
    setRows(fn)
    setDirty(true)
  }

  function loadDefault() {
    const d = toRows(DEFAULT_GRADING_PLAN)
    setRows(d.rows)
    setTerms(d.terms)
    setPass('51')
    setDirty(true)
  }

  async function onSave() {
    const names = rows.map((r) => r.category.trim())
    if (names.some((n) => !n)) return toast.error('Hay una categoría sin nombre')
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return toast.error('Hay categorías repetidas')
    const items: GradingItem[] = []
    rows.forEach((r) =>
      terms.forEach((t) => {
        const raw = r.weights[t]
        if (raw !== undefined && raw.trim() !== '') items.push({ term: t, category: r.category.trim(), weight: num(raw), source: r.source })
      }),
    )
    try {
      await save.mutateAsync({ passMark: num(pass) || 51, items })
      setDirty(false)
      toast.success('Plan de calificación guardado', `Total ${fmt(total)} puntos · aprobación con ${pass}.`)
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <SolidCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Calculator className="size-5 text-uap-gold" /> Plan de calificación
            </h2>
            <p className="text-sm text-ink-soft">Puntos que aporta cada categoría en cada parcial. Deja vacío si no aplica.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={loadDefault}>
              <RotateCcw className="size-4" /> Mi plan 30+30+40
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (terms.length >= 6) return
                setTerms([...terms, (terms.at(-1) ?? 0) + 1])
                setDirty(true)
              }}
            >
              <Plus className="size-4" /> Parcial
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-uap-blue text-white dark:bg-uap-blue-700">
                <th className="min-w-60 px-4 py-3 text-left font-display">Categoría</th>
                <th className="px-2 py-3 text-center font-display">Se califica en</th>
                {terms.map((t, i) => (
                  <th key={t} className="px-2 py-3 text-center font-display">
                    <div className="flex items-center justify-center gap-1">
                      {TERM_LABEL(t)}
                      {terms.length > 1 && i === terms.length - 1 && (
                        <button
                          onClick={() => {
                            setTerms(terms.slice(0, -1))
                            update((rs) => rs.map((r) => ({ ...r, weights: Object.fromEntries(Object.entries(r.weights).filter(([k]) => Number(k) !== t)) })))
                          }}
                          className="rounded p-0.5 hover:bg-white/20"
                          aria-label={`Quitar ${TERM_LABEL(t)}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line odd:bg-ink/[0.02]">
                  <td className="px-3 py-2">
                    <input
                      value={r.category}
                      onChange={(e) => update((rs) => rs.map((x) => (x.key === r.key ? { ...x, category: e.target.value } : x)))}
                      className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1.5 font-semibold outline-none hover:border-line focus:border-uap-blue"
                      aria-label="Nombre de la categoría"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() =>
                        update((rs) => rs.map((x) => (x.key === r.key ? { ...x, source: x.source === 'yaguarquiz' ? 'manual' : 'yaguarquiz' } : x)))
                      }
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-bold',
                        r.source === 'yaguarquiz' ? 'bg-uap-green/15 text-uap-green dark:text-game-selva' : 'bg-ink/10 text-ink-soft',
                      )}
                      title="Clic para cambiar"
                    >
                      {r.source === 'yaguarquiz' ? 'YaguarQuiz' : 'Manual'}
                    </button>
                  </td>
                  {terms.map((t) => (
                    <td key={t} className="px-2 py-2 text-center">
                      <input
                        inputMode="decimal"
                        value={r.weights[t] ?? ''}
                        placeholder="–"
                        onChange={(e) =>
                          update((rs) =>
                            rs.map((x) => (x.key === r.key ? { ...x, weights: { ...x.weights, [t]: e.target.value.replace(/[^0-9.,]/g, '') } } : x)),
                          )
                        }
                        className="h-10 w-16 rounded-xl border-2 border-line bg-surface-2 text-center font-display text-base font-bold outline-none focus:border-uap-blue"
                        aria-label={`${r.category} — ${TERM_LABEL(t)}`}
                      />
                    </td>
                  ))}
                  <td className="pr-3 text-center">
                    <button
                      onClick={() => update((rs) => rs.filter((x) => x.key !== r.key))}
                      className="rounded-lg p-1.5 text-ink-soft hover:bg-uap-red/10 hover:text-uap-red"
                      aria-label={`Quitar ${r.category}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink/[0.04] font-display font-black">
                <td className="px-4 py-3" colSpan={2}>
                  <button
                    onClick={() => update((rs) => [...rs, { key: newKey(), category: 'Nueva categoría', source: 'yaguarquiz', weights: {} }])}
                    className="flex items-center gap-1 text-sm font-semibold text-uap-green dark:text-game-selva"
                  >
                    <Plus className="size-4" /> Agregar categoría
                  </button>
                </td>
                {termTotals.map((v, i) => (
                  <td key={terms[i]} className="px-2 py-3 text-center text-lg">
                    {fmt(v)}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </SolidCard>

      <div className="flex flex-col gap-4">
        <SolidCard className={cn('text-center', ok ? 'ring-2 ring-uap-green/40' : 'ring-2 ring-uap-red/40')}>
          <p className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Nota final</p>
          <p className={cn('font-display text-6xl font-black tabular-nums', ok ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral')}>
            {fmt(total)}
          </p>
          <p className="text-sm text-ink-soft">{termTotals.map((v) => fmt(v)).join(' + ')}</p>
          <p className={cn('mt-2 flex items-center justify-center gap-1 text-sm font-semibold', ok ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral')}>
            {ok ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
            {ok ? 'Suma exactamente 100' : `Debe sumar 100 (faltan ${fmt(100 - total)})`}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <label htmlFor="pass" className="text-sm font-semibold">
              Aprobación con
            </label>
            <input
              id="pass"
              inputMode="numeric"
              value={pass}
              onChange={(e) => {
                setPass(e.target.value.replace(/[^0-9]/g, ''))
                setDirty(true)
              }}
              className="h-10 w-16 rounded-xl border-2 border-line bg-surface-2 text-center font-display font-bold"
            />
          </div>
          <Button variant="success" block className="mt-5" disabled={!ok || !dirty || save.isPending} onClick={() => void onSave()}>
            <Save className="size-5" /> {dirty ? 'Guardar plan' : 'Guardado ✓'}
          </Button>
        </SolidCard>

        <SolidCard>
          <h3 className="mb-2 font-display font-bold">¿Cómo se convierte la nota?</h3>
          <p className="text-sm text-ink-soft">
            Cada actividad de YaguarQuiz se califica sobre 100 y se convierte al peso de su categoría:
          </p>
          <div className="mt-3 rounded-2xl bg-uap-gold/12 p-3 text-sm">
            <p className="font-semibold">Ejemplo: examen del 1er parcial</p>
            <p className="font-display text-lg font-black">85 / 100 × 7 = 5,95 pts</p>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Si hay varias actividades en la misma categoría y parcial, se promedian. <strong>{fmt(sistema)}</strong> de los 100 puntos se
            califican con YaguarQuiz; el resto es <em>manual</em> (asistencia, exposiciones, proyecto).
          </p>
        </SolidCard>
      </div>
    </div>
  )
}
