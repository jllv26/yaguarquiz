import { motion } from 'framer-motion'
import { CheckCircle2, Link2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { ChoiceSheet } from './ChoiceSheet'

const COLORS = ['#1DBF73', '#2D7DFF', '#FFB800', '#7C3AED', '#14B8A6', '#FF3355', '#C9A23A', '#1F3864', '#e8590c', '#0ca678', '#ae3ec9', '#1971c2', '#f08c00', '#5c940d', '#8B1A1A']

export default function Matching() {
  const { board, progress, play, busy } = useGame<'matching'>()
  const { left, right } = board.board
  const [pick, setPick] = useState<string | null>(() => left.find((l) => !progress[l.key]?.done)?.key ?? null)
  const [shake, setShake] = useState<{ l: string; r: string; n: number } | null>(null)
  const [sheet, setSheet] = useState(false)

  // definición (clave B) que ya quedó unida a cada término
  const linked = useMemo(() => {
    const m = new Map<string, { left: string; ok: boolean; color: string }>()
    left.forEach((l, i) => {
      const p = progress[l.key]
      if (!p?.done) return
      const key = p.correct ? (p.answer ?? lastKey.get(l.key)) : p.answer
      if (key) m.set(key, { left: l.key, ok: !!p.correct, color: COLORS[i % COLORS.length] })
    })
    return m
  }, [left, progress])

  async function choose(rkey: string) {
    if (!pick || busy || linked.has(rkey)) return
    const r = await play('answer', { item: pick, value: rkey })
    if (!r?.ok) return
    if (r.correct) {
      lastKey.set(pick, rkey)
      const next = left.find((l) => l.key !== pick && !progress[l.key]?.done)
      setPick(next?.key ?? null)
    } else {
      setShake({ l: pick, r: rkey, n: Date.now() })
      if (r.done) setPick(left.find((l) => l.key !== pick && !progress[l.key]?.done)?.key ?? null)
    }
  }
  const pickedText = pick ? left.find((l) => l.key === pick)?.text : null
  const leftColor = (k: string) => {
    const i = left.findIndex((l) => l.key === k)
    return COLORS[i % COLORS.length]
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm font-semibold">
        <Link2 className="mr-1 inline size-4" />
        {pickedText ? (
          <>
            <span className="text-ink-soft">Paso 2:</span> toca la definición de <b className="text-[#8a6416] dark:text-uap-gold">{quoted(pickedText)}</b> (o toca el concepto para ver la lista)
          </>
        ) : (
          <>
            <span className="text-ink-soft">Paso 1:</span> toca un concepto: se abrirá la lista de definiciones
          </>
        )}
      </p>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-3 text-center text-[11px] font-black uppercase tracking-wider text-ink-soft sm:gap-x-5">
        <span>Conceptos</span>
        <span>Definiciones</span>
      </div>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 sm:gap-5">
        <ul className="flex flex-col gap-2">
          {left.map((l) => {
            const p = progress[l.key]
            const sel = pick === l.key
            return (
              <motion.li key={l.key} animate={shake?.l === l.key ? { x: [0, -8, 8, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                <button
                  disabled={p?.done}
                  onClick={() => {
                    setPick(l.key)
                    setSheet(true)
                  }}
                  aria-pressed={sel}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-display font-bold transition-all',
                    p?.done ? 'text-white' : sel ? 'scale-[1.02] border-uap-gold bg-uap-gold/20 shadow-md' : 'border-line bg-surface-2 hover:border-uap-gold/60',
                  )}
                  style={p?.done ? { background: p.correct ? leftColor(l.key) : '#8B1A1A', borderColor: 'transparent' } : undefined}
                >
                  {p?.done && (p.correct ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />)}
                  <span className="flex-1">{l.text}</span>
                  {!p?.done && p?.tries ? <span className="text-xs font-semibold text-uap-red">{board.tries - p.tries} intento(s)</span> : null}
                </button>
              </motion.li>
            )
          })}
        </ul>
        <ul className="flex flex-col gap-2">
          {right.map((r) => {
            const lk = linked.get(r.key)
            return (
              <motion.li key={r.key} animate={shake?.r === r.key ? { x: [0, 8, -8, 4, -4, 0] } : {}} transition={{ duration: 0.4 }}>
                <button
                  disabled={!!lk || !pick}
                  onClick={() => void choose(r.key)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left text-sm transition-all',
                    lk ? 'border-transparent text-white' : 'border-line bg-surface-2 hover:border-uap-blue/50 hover:bg-uap-blue/5 disabled:opacity-100',
                  )}
                  style={lk ? { background: lk.ok ? leftColor(lk.left) : '#8B1A1A' } : undefined}
                >
                  <ClueImage src={r.image_url} className="size-14 shrink-0 bg-white" />
                  <span className="flex-1">{r.text}</span>
                  {lk && <span className="shrink-0 rounded-lg bg-white/20 px-2 py-0.5 text-xs font-bold">{left.find((l) => l.key === lk.left)?.text}</span>}
                </button>
              </motion.li>
            )
          })}
        </ul>
      </div>
      {/* al tocar un concepto se abre la ventana con las definiciones que quedan */}
      <ChoiceSheet
        open={sheet && !!pickedText}
        title="Elige su definición"
        hint="Toca la definición que corresponde a este concepto."
        subject={pickedText}
        choices={right.filter((r) => !linked.has(r.key)).map((r) => ({ key: r.key, label: r.text, image_url: r.image_url }))}
        onChoose={(k) => {
          setSheet(false)
          void choose(k)
        }}
        onClose={() => setSheet(false)}
        busy={busy}
      />
    </div>
  )
}

// clave de la definición elegida por término (para pintar las parejas acertadas en esta pantalla)
const lastKey = new Map<string, string>()

const quoted = (t: string) => (t.includes('«') ? t : `«${t}»`)
