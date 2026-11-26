import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileSearch, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { researchGrade, researchList, type ResearchSubmission } from '../../lib/api/activities'
import { cn } from '../../lib/cn'
import { useConfirm } from '../../components/ui/Confirm'
import { autoGradeResearch } from './researchAutoGrade'

const LEVELS = [
  { v: 2, label: 'Cumple', emoji: '✅', on: 'border-uap-green bg-uap-green/15' },
  { v: 1, label: 'A medias', emoji: '🌗', on: 'border-uap-gold bg-uap-gold/20' },
  { v: 0, label: 'No cumple', emoji: '❌', on: 'border-uap-red bg-uap-red/10' },
] as const
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

/** El docente lee cada investigación y marca cada criterio: Cumple · A medias · No cumple. */
export function useResearch(sessionId: string) {
  return useQuery({ queryKey: ['research', sessionId], queryFn: () => researchList(sessionId) })
}

export function ResearchGrader({ sessionId, onGraded }: { sessionId: string; onGraded?: () => void }) {
  const q = useResearch(sessionId)
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState<null | { done: number; total: number }>(null)
  const confirm = useConfirm()
  const toast = useToast()

  /** Califica solas, por cumplimiento, todas las entregas que aún no tienen nota. */
  async function autoGradeAll() {
    const data = q.data
    if (!data) return
    const todo = data.items.filter((x) => x.grade === null)
    if (!todo.length) return
    const ok = await confirm({
      title: `¿Calificar automáticamente ${todo.length} entrega${todo.length === 1 ? '' : 's'}?`,
      message:
        'Cada criterio sale Cumple, A medias o No cumple según si respondió todo con suficiente texto, usó los conceptos del tema y, si se piden, puso datos o números. Después puede cambiar cualquier nota a mano. Si los correos están activados, a cada estudiante le llega su nota.',
      confirmText: 'Calificar ahora',
    })
    if (!ok) return
    setAuto({ done: 0, total: todo.length })
    let done = 0
    for (const x of todo) {
      const g = autoGradeResearch({ criteria: data.criteria, minWords: data.min_words, answers: x.answers })
      try {
        await researchGrade(x.attempt, g.scores, g.comment)
        done++
        setAuto({ done, total: todo.length })
      } catch (e) {
        toast.error(`No se pudo calificar a ${x.name}`, (e as Error).message)
      }
    }
    setAuto(null)
    toast.success(`${done} entrega${done === 1 ? '' : 's'} calificada${done === 1 ? '' : 's'} automáticamente`)
    void q.refetch()
    onGraded?.()
  }

  if (q.isLoading) return <Skeleton className="h-64" />
  const data = q.data
  if (!data || !data.items.length)
    return (
      <SolidCard className="p-8 text-center">
        <FileSearch className="mx-auto size-10 text-ink-soft" />
        <p className="mt-2 font-display text-xl font-black">Todavía nadie entregó</p>
        <p className="text-ink-soft">Las entregas aparecen aquí apenas los estudiantes pulsan «Entregar».</p>
      </SolidCard>
    )
  const items = data.items
  const cur = items[Math.min(i, items.length - 1)]
  const pending = items.filter((x) => x.grade === null).length
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <SolidCard className="max-h-[70vh] overflow-y-auto p-2">
        <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
          {items.length} entregas · {pending} sin calificar
        </p>
        {pending > 0 && (
          <Button size="sm" variant="gold" className="mx-1 mb-2 w-[calc(100%-0.5rem)]" disabled={!!auto} onClick={() => void autoGradeAll()}>
            <Wand2 className="size-4" /> {auto ? `Calificando ${auto.done}/${auto.total}…` : `Calificar solas (${pending})`}
          </Button>
        )}
        {items.map((x, k) => (
          <button
            key={x.attempt}
            onClick={() => setI(k)}
            className={cn('flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm', k === i ? 'bg-uap-blue/10 font-bold' : 'hover:bg-ink/5')}
          >
            {x.grade === null ? <span className="size-2.5 shrink-0 rounded-full bg-uap-gold" aria-label="Sin calificar" /> : <CheckCircle2 className="size-4 shrink-0 text-uap-green" />}
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            {x.grade !== null && <span className="font-display font-black tabular-nums">{Math.round(Number(x.grade))}</span>}
          </button>
        ))}
      </SolidCard>
      <Submission
        key={cur.attempt}
        sub={cur}
        criteria={data.criteria}
        minWords={data.min_words}
        onPrev={i > 0 ? () => setI(i - 1) : undefined}
        onNext={i < items.length - 1 ? () => setI(i + 1) : undefined}
        onSaved={() => {
          void q.refetch()
          onGraded?.()
          const nextPending = items.findIndex((x, k) => k > i && x.grade === null)
          if (nextPending >= 0) setI(nextPending)
        }}
      />
    </div>
  )
}

function Submission({
  sub,
  criteria,
  minWords,
  onPrev,
  onNext,
  onSaved,
}: {
  sub: ResearchSubmission
  criteria: { title: string; desc?: string }[]
  minWords: number
  onPrev?: () => void
  onNext?: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [scores, setScores] = useState<(number | null)[]>(() => criteria.map((_, k) => sub.scores?.[k] ?? null))
  const [comment, setComment] = useState(sub.comment ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => setScores(criteria.map((_, k) => sub.scores?.[k] ?? null)), [sub, criteria])
  const complete = scores.every((x) => x !== null)
  const preview = complete ? Math.round((100 * (scores as number[]).reduce((a, b) => a + b, 0)) / (criteria.length * 2)) : null

  async function save() {
    setBusy(true)
    try {
      const r = await researchGrade(sub.attempt, scores as number[], comment || null)
      toast.success(`Nota: ${Math.round(Number(r.grade))}`, 'Se guardó y le llegará por correo.')
      await qc.invalidateQueries({ queryKey: ['report'] })
      onSaved()
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SolidCard className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {sub.ru ? `RU ${sub.ru} · ` : ''}Entregó el {new Date(sub.submitted_at).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <h2 className="font-display text-2xl font-black leading-tight">{sub.name}</h2>
          {sub.case && <p className="mt-1 inline-block rounded-xl bg-uap-red/10 px-2 py-0.5 text-sm font-bold text-uap-red">Caso: {sub.case.title}</p>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={onPrev} disabled={!onPrev} aria-label="Anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={onNext} disabled={!onNext} aria-label="Siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {(sub.focus_losses > 0 || sub.paste > 0) && (
        <p className="flex items-center gap-2 rounded-xl bg-uap-gold/15 px-3 py-2 text-sm">
          <AlertTriangle className="size-4" /> Salió de la pestaña {sub.focus_losses} {sub.focus_losses === 1 ? 'vez' : 'veces'}
          {sub.paste > 0 && ` · intentó pegar texto ${sub.paste} ${sub.paste === 1 ? 'vez' : 'veces'}`}
        </p>
      )}
      {sub.answers.map((a, k) => (
        <div key={k}>
          <p className="font-display font-black">
            {k + 1}. {a.question}
          </p>
          <p className={cn('mt-1 whitespace-pre-line rounded-2xl bg-ink/5 p-3 leading-relaxed', !a.text && 'italic text-ink-soft')}>{a.text || 'Sin respuesta'}</p>
          <p className={cn('text-xs', words(a.text) < minWords ? 'font-bold text-uap-red' : 'text-ink-soft')}>
            {words(a.text)} palabras{words(a.text) < minWords ? ` (pedía al menos ${minWords})` : ''}
          </p>
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-uap-gold/60 bg-uap-gold/5 p-3">
        <p className="font-display font-black">Su calificación</p>
        {criteria.map((c, k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[10rem] flex-1 text-sm">
              <b>{c.title}</b>
              {c.desc && <span className="block text-xs text-ink-soft">{c.desc}</span>}
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={c.title}>
              {LEVELS.map((l) => (
                <button
                  key={l.v}
                  role="radio"
                  aria-checked={scores[k] === l.v}
                  onClick={() => setScores((s) => s.map((x, j) => (j === k ? l.v : x)))}
                  className={cn('rounded-xl border-2 px-2 py-1.5 text-sm font-bold', scores[k] === l.v ? l.on : 'border-line hover:border-uap-gold')}
                >
                  {l.emoji} {l.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Comentario para el estudiante (opcional)"
          className="w-full rounded-xl border-2 border-line bg-surface p-2 text-sm"
          aria-label="Comentario"
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-black tabular-nums">{preview ?? '—'}</span>
          <span className="text-xs text-ink-soft">Cumple = 2 · A medias = 1 · No cumple = 0 → puntos ÷ {criteria.length * 2} × 100</span>
          <Button className="ml-auto" onClick={() => void save()} disabled={!complete || busy}>
            {sub.grade === null ? 'Guardar nota' : 'Actualizar nota'}
          </Button>
        </div>
      </div>
    </SolidCard>
  )
}
