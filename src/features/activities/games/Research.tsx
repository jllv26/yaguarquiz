import { CheckCircle2, ClipboardCheck, FileSearch, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

/** Investigación: el caso que le tocó, las preguntas y sus respuestas (se guardan solas; no se puede pegar). */
export default function Research() {
  const { board } = useGame<'research'>()
  const b = board.board
  return (
    <div className="flex flex-col gap-4">
      {b.case && (
        <section className="rounded-3xl border-2 border-uap-red/30 bg-uap-red/5 p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-uap-red">
            <FileSearch className="size-4" /> Tu caso (a cada compañero le tocó otro)
          </p>
          <h2 className="mt-1 font-display text-2xl font-black leading-tight">{b.case.title}</h2>
          {b.case.context && <p className="mt-1 whitespace-pre-line">{b.case.context}</p>}
          {!!b.case.tasks?.length && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {b.case.tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {b.criteria.length > 0 && (
        <section className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
          <p className="mb-1 flex items-center gap-2 font-display font-black">
            <ClipboardCheck className="size-4" /> Así te califica tu docente
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {b.criteria.map((c, i) => (
              <li key={i}>
                <b>{c.title}</b>
                {c.desc ? ` — ${c.desc}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-soft">Cada criterio: Cumple · A medias · No cumple. Escribe con tus palabras: no se puede pegar texto y queda registrado.</p>
        </section>
      )}
      {b.questions.map((q, i) => (
        <Answer key={q.key} n={i + 1} q={q} min={b.min_words} />
      ))}
    </div>
  )
}

function Answer({ n, q, min }: { n: number; q: { key: string; text: string; hint: string | null; value: string | null }; min: number }) {
  const { play } = useGame<'research'>()
  const [val, setVal] = useState(q.value ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(q.value ? 'saved' : 'idle')
  const last = useRef(q.value ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save(v: string) {
    if (v === last.current) return
    setState('saving')
    const r = await play('save', { item: q.key, value: v })
    if (r?.ok) {
      last.current = v
      setState('saved')
    } else setState('error')
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const w = words(val)
  return (
    <section className="rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line">
      <label htmlFor={`r-${q.key}`} className="font-display text-lg font-black leading-snug">
        {n}. {q.text}
      </label>
      {q.hint && <p className="text-sm text-ink-soft">{q.hint}</p>}
      <textarea
        id={`r-${q.key}`}
        value={val}
        rows={6}
        onChange={(e) => {
          const v = e.target.value
          setVal(v)
          setState('idle')
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => void save(v), 1500)
        }}
        onBlur={() => void save(val)}
        className="mt-2 w-full rounded-2xl border-2 border-line bg-surface p-3 text-base leading-relaxed outline-none focus:border-uap-blue"
        placeholder="Escribe aquí con tus palabras…"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn('font-bold', w >= min ? 'text-uap-green' : 'text-ink-soft')}>
          {w} palabras {w < min ? `(mínimo ${min})` : '✓'}
        </span>
        <span className="flex items-center gap-1 text-ink-soft" aria-live="polite">
          {state === 'saving' && (
            <>
              <Loader2 className="size-3 animate-spin" /> Guardando…
            </>
          )}
          {state === 'saved' && (
            <>
              <CheckCircle2 className="size-3 text-uap-green" /> Guardado
            </>
          )}
          {state === 'error' && <span className="font-bold text-uap-red">No se guardó; revisa tu conexión</span>}
        </span>
      </div>
    </section>
  )
}
