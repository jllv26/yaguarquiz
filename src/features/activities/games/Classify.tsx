import { motion } from 'framer-motion'
import { FolderInput } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../lib/cn'
import { looseNorm } from '../types'
import { ClueImage, useGame } from '../ActivityGame'
import { ChoiceSheet } from './ChoiceSheet'

const COLORS = ['#1F3864', '#1B7339', '#8B1A1A', '#7C3AED', '#8a6416', '#0f766e']

export default function Classify() {
  const { board, progress, play, busy } = useGame<'classify'>()
  const { groups, cards } = board.board
  const [pick, setPick] = useState<string | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [placedIn, setPlacedIn] = useState<Record<string, string>>({})

  const groupOf = (k: string) => {
    const p = progress[k]
    if (!p?.done) return null
    const g = p.correct ? (placedIn[k] ?? p.answer ?? p.value) : p.answer
    return groups.find((x) => looseNorm(x) === looseNorm(g ?? '')) ?? null
  }
  const pool = cards.filter((c) => !groupOf(c.key) && !(progress[c.key]?.done && !progress[c.key]?.correct && !progress[c.key]?.answer))
  const lost = cards.filter((c) => progress[c.key]?.done && !progress[c.key]?.correct && !progress[c.key]?.answer)

  async function drop(g: string) {
    if (!pick || busy) return
    const k = pick
    const r = await play('answer', { item: k, value: g })
    if (!r?.ok) return
    if (r.correct) {
      setPlacedIn((x) => ({ ...x, [k]: g }))
      setPick(null)
    } else {
      // tras un error se suelta la selección: el estudiante vuelve a elegir con calma
      setShake(k + Date.now())
      setPick(null)
    }
  }

  const picked = pick ? cards.find((c) => c.key === pick) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-20 rounded-3xl border-2 border-dashed border-line bg-surface-2/70 p-3">
        <p className="mb-2 text-center text-sm text-ink-soft">
          <FolderInput className="mr-1 inline size-4" />
          {picked ? (
            <span className="font-semibold text-ink">
              <span className="text-ink-soft">Paso 2:</span> elige su grupo en la ventana
            </span>
          ) : (
            <span className="font-semibold text-ink">
              <span className="text-ink-soft">Paso 1:</span> toca un elemento y se abrirá la lista de grupos
            </span>
          )}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {pool.map((c) => {
            const p = progress[c.key]
            return (
              <motion.button
                key={c.key}
                layout
                animate={shake?.startsWith(c.key) ? { x: [0, -8, 8, -4, 4, 0] } : {}}
                onClick={() => setPick(c.key === pick ? null : c.key)}
                aria-pressed={pick === c.key}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border-2 px-4 py-2 font-display font-bold shadow-sm transition',
                  pick === c.key ? '-translate-y-1 border-uap-gold bg-uap-gold/25 shadow-lg' : 'border-line bg-surface-2 hover:border-uap-gold/60',
                )}
              >
                <ClueImage src={c.image_url} className="size-10 bg-white" />
                {c.text}
                {p?.tries ? <span className="text-xs text-uap-red">({board.tries - p.tries})</span> : null}
              </motion.button>
            )
          })}
          {!pool.length && <p className="py-2 text-sm font-semibold text-ink-soft">¡Todo clasificado!</p>}
        </div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${groups.length > 3 ? 11 : 14}rem, 1fr))` }}>
        {groups.map((g, i) => (
          <button
            key={g}
            onClick={() => void drop(g)}
            disabled={!pick}
            className={cn('flex min-h-40 flex-col rounded-3xl border-4 bg-surface-2 p-3 text-left transition', pick ? 'border-dashed hover:scale-[1.01] hover:shadow-lg' : 'border-solid')}
            style={{ borderColor: COLORS[i % COLORS.length] }}
          >
            <span className="mb-2 rounded-xl px-3 py-1.5 text-center font-display font-black text-white" style={{ background: COLORS[i % COLORS.length] }}>
              {g}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {cards
                .filter((c) => groupOf(c.key) === g)
                .map((c) => {
                  const ok = progress[c.key]?.correct
                  return (
                    <motion.span key={c.key} layout initial={{ scale: 0.6 }} animate={{ scale: 1 }} className={cn('rounded-xl px-2.5 py-1 text-sm font-semibold', ok ? 'bg-uap-green/15 text-uap-green dark:text-game-selva' : 'bg-uap-red/10 text-uap-red line-through dark:text-game-coral')}>
                      {c.text}
                    </motion.span>
                  )
                })}
            </span>
          </button>
        ))}
      </div>
      {lost.length > 0 && <p className="text-center text-sm text-uap-red">Sin intentos: {lost.map((c) => c.text).join(', ')}</p>}

      {/* al tocar un elemento se abre la ventana con los grupos (no hace falta bajar la pantalla) */}
      <ChoiceSheet
        open={!!picked}
        title="¿A qué grupo pertenece?"
        subject={
          picked && (
            <span className="flex items-center gap-2">
              <ClueImage src={picked.image_url} className="size-12 shrink-0 bg-white" />
              {picked.text}
            </span>
          )
        }
        choices={groups.map((g, i) => ({ key: g, label: g, color: COLORS[i % COLORS.length] }))}
        cols={groups.length === 2 || groups.length === 4 ? 2 : groups.length === 3 ? 3 : 1}
        onChoose={(g) => void drop(g)}
        onClose={() => setPick(null)}
        busy={busy}
      />
    </div>
  )
}
