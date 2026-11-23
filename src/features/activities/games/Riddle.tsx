import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CornerDownLeft, Lightbulb } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { sfx } from '../../../lib/sound'
import { ClueImage, useGame } from '../ActivityGame'
import { ItemDots, triesLeft, useCursor } from './common'

export default function Riddle() {
  const { board, progress, play, busy } = useGame<'riddle'>()
  const items = board.board.items
  const keys = items.map((x) => x.key)
  const { cur, setCur, next, curRef } = useCursor(keys, progress)
  // pistas que ya se ven de cada adivinanza (empiezan con las que trae el tablero)
  const [clues, setClues] = useState<Record<string, string[]>>(() => Object.fromEntries(items.map((x) => [x.key, x.clues ?? []])))
  const [val, setVal] = useState('')
  const [shake, setShake] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  useEffect(() => setVal(''), [cur])
  if (!it) return null
  const shown = clues[it.key] ?? []
  const used = Math.max(1, shown.length)
  const worth = Math.max(20, 100 - 20 * (used - 1) - 20 * (p?.tries ?? 0))

  async function moreClue() {
    if (busy || p?.done || shown.length >= it.total) return
    const r = await play('clue', { item: it.key })
    if (r?.ok && r.clue) {
      sfx.tick()
      setClues((c) => ({ ...c, [it.key]: [...(c[it.key] ?? []), r.clue!] }))
    }
  }
  async function check() {
    if (busy || p?.done || !val.trim()) return
    const r = await play('answer', { item: it.key, value: val.trim() })
    if (!r?.ok) return
    const at = curRef.current
    if (r.correct) setTimeout(() => curRef.current === at && next(at), 900)
    else {
      setShake((s) => s + 1)
      setVal('')
      input.current?.focus()
      if (r.done) setTimeout(() => curRef.current === at && next(at), 1600)
    }
  }
  const answer = p?.done ? (p.correct ? p.value : p.answer) : null

  return (
    <div className="flex flex-col gap-4">
      {items.length > 1 && <ItemDots keys={keys} progress={progress} cur={cur} onPick={setCur} label="Adivinanza" />}
      <motion.div key={`${it.key}-${shake}`} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { opacity: [0, 1] }} className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line sm:p-6">
        <div className="flex items-center justify-between">
          <p className="font-display font-black text-[#f08c00]">💡 Adivinanza {cur + 1}</p>
          {!p?.done && <span className="rounded-full bg-[#f08c00]/15 px-3 py-1 text-xs font-black text-[#b35c00] dark:text-[#ffc078]">Si aciertas ahora: {worth * 10} pts</span>}
        </div>
        <ClueImage src={it.image_url} className="mx-auto h-28 w-40 bg-white" />

        {/* casillas de la respuesta */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label={`Respuesta de ${it.words.reduce((a, b) => a + b, 0)} letras`}>
          {it.words.map((len, w) => (
            <div key={w} className="flex gap-1">
              {Array.from({ length: len }, (_, k) => (
                <span key={k} className={cn('grid h-9 w-7 place-items-center rounded-md border-b-4 font-display font-black', answer ? (p?.correct ? 'border-uap-green text-uap-green' : 'border-uap-red text-uap-red') : 'border-ink/30 bg-ink/5')}>
                  {answer ? (answer.replace(/\s+/g, ' ').split(' ')[w] ?? '')[k]?.toUpperCase() : ''}
                </span>
              ))}
            </div>
          ))}
        </div>

        {/* pistas */}
        <ol className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {shown.map((c, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 rounded-2xl bg-[#fff4e6] px-3 py-2 dark:bg-[#3d2a12]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f08c00] text-xs font-black text-white">{i + 1}</span>
                <span className="font-semibold">{c}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {answer ? (
          <p className={cn('rounded-2xl px-4 py-2 text-center font-display text-xl font-black', p?.correct ? 'bg-uap-green/15 text-uap-green' : 'bg-uap-red/10 text-uap-red')}>
            {p?.correct ? '✓ ' : 'Era: '}
            {answer}
          </p>
        ) : p?.done ? (
          <p className="text-center font-display font-black text-uap-red">Sin intentos · la respuesta se ve al cerrar la actividad</p>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void moreClue()} disabled={busy || shown.length >= it.total} className="self-center">
              <Lightbulb className="size-4" /> {shown.length >= it.total ? 'No hay más pistas' : `Otra pista (${shown.length + 1} de ${it.total}) · vale −20 %`}
            </Button>
            <div className="flex gap-2">
              <input
                ref={input}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void check()}
                placeholder="¿Qué es?"
                aria-label="Tu respuesta"
                autoComplete="off"
                spellCheck={false}
                className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-[#f08c00]/50 bg-surface px-4 font-display text-lg font-bold outline-none focus:border-[#f08c00]"
              />
              <Button variant="success" onClick={() => void check()} disabled={busy || !val.trim()} className="h-12">
                <CornerDownLeft className="size-4" /> Comprobar
              </Button>
            </div>
            {p?.tries ? <p className="text-center text-sm font-bold text-uap-red">{triesLeft(board.tries, p.tries)}</p> : null}
          </>
        )}
      </motion.div>
      {items.length > 1 && (
        <div className="flex justify-between">
          <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c - 1 + items.length) % items.length)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c + 1) % items.length)}>
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
