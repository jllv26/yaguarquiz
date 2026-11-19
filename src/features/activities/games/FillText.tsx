import { CheckCheck } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'

export default function FillText() {
  const { board, progress, play, busy, flash } = useGame<'fill_text'>()
  const { text, gaps, bank } = board.board
  const byIndex = useMemo(() => new Map(gaps.map((g) => [g.i, g])), [gaps])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [focus, setFocus] = useState<string | null>(gaps.find((g) => !progress[g.key]?.done)?.key ?? null)

  const shown = (k: string) => {
    const p = progress[k]
    if (p?.done) return p.correct ? (p.value ?? vals[k] ?? '') : (p.answer ?? vals[k] ?? '')
    return vals[k] ?? ''
  }
  // palabras del banco que siguen disponibles (cada una se usa una vez)
  const used = Object.entries(vals).filter(([k, v]) => v && !progress[k]?.done).map(([, v]) => v)
  const usedDone = gaps.filter((g) => progress[g.key]?.done && progress[g.key]?.correct).map((g) => progress[g.key]?.value ?? '')
  const available = (() => {
    const pool = [...used, ...usedDone]
    return (bank ?? []).filter((w) => {
      const i = pool.indexOf(w)
      if (i >= 0) {
        pool.splice(i, 1)
        return false
      }
      return true
    })
  })()

  function put(word: string) {
    const target = focus && !progress[focus]?.done && !vals[focus] ? focus : gaps.find((g) => !progress[g.key]?.done && !vals[g.key])?.key
    if (!target) return
    const nv = { ...vals, [target]: word }
    setVals(nv)
    setFocus(gaps.find((g) => !progress[g.key]?.done && !nv[g.key])?.key ?? null)
  }
  async function checkAll() {
    const todo = gaps.filter((g) => !progress[g.key]?.done && (vals[g.key] ?? '').trim())
    if (!todo.length) return flash(false, 'Complete al menos un espacio')
    for (const g of todo) {
      const r = await play('answer', { item: g.key, value: vals[g.key] })
      if (r?.ok && !r.correct && !r.done) setVals((v) => ({ ...v, [g.key]: bank ? '' : v[g.key] }))
    }
  }

  const parts = text.split(/(\{\{\d+\}\})/g)
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-surface-2 p-5 text-lg leading-[2.6] shadow-sm ring-1 ring-line sm:p-7">
        {parts.map((part, idx) => {
          const m = part.match(/^\{\{(\d+)\}\}$/)
          if (!m) return <Fragment key={idx}>{part.split('\n').map((line, j) => (j ? [<br key={`b${j}`} />, line] : line))}</Fragment>
          const g = byIndex.get(Number(m[1]))
          if (!g) return null
          const p = progress[g.key]
          const cls = cn(
            'mx-1 inline-block min-w-[4.5rem] rounded-xl border-2 px-2 py-0.5 text-center align-middle font-display font-bold leading-normal',
            p?.done ? (p.correct ? 'border-uap-green bg-uap-green/15 text-uap-green dark:text-game-selva' : 'border-uap-red bg-uap-red/10 text-uap-red line-through dark:text-game-coral') : focus === g.key ? 'border-uap-gold bg-uap-gold/15' : 'border-dashed border-ink/30 bg-ink/5',
          )
          const width = { width: `${Math.max(4.5, Math.min(14, g.len * 0.75 + 1.5))}rem` }
          if (bank)
            return (
              <button
                key={idx}
                className={cls}
                style={width}
                disabled={p?.done}
                onClick={() => {
                  if (vals[g.key]) setVals((v) => ({ ...v, [g.key]: '' }))
                  setFocus(g.key)
                }}
                aria-label={`Espacio ${g.i + 1}${shown(g.key) ? `: ${shown(g.key)}` : ', vacío'}`}
              >
                {shown(g.key) || ' '}
              </button>
            )
          return (
            <input
              key={idx}
              className={cls}
              style={width}
              value={shown(g.key)}
              readOnly={p?.done}
              onFocus={() => setFocus(g.key)}
              onChange={(e) => setVals((v) => ({ ...v, [g.key]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void checkAll()}
              aria-label={`Espacio ${g.i + 1}`}
              autoComplete="off"
              spellCheck={false}
            />
          )
        })}
      </div>
      {bank && (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Banco de palabras">
          {available.map((w, i) => (
            <button key={`${w}-${i}`} onClick={() => put(w)} className="rounded-2xl border-2 border-uap-blue/30 bg-surface-2 px-4 py-2 font-display font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-uap-blue">
              {w}
            </button>
          ))}
          {!available.length && <p className="text-sm text-ink-soft">No quedan palabras en el banco.</p>}
        </div>
      )}
      <Button variant="success" className="self-center" onClick={() => void checkAll()} disabled={busy}>
        <CheckCheck className="size-5" /> Comprobar
      </Button>
    </div>
  )
}
