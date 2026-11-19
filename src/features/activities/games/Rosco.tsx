import { AnimatePresence, motion } from 'framer-motion'
import { SkipForward, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'

export default function Rosco() {
  const { board, progress, play, busy } = useGame<'rosco'>()
  const items = board.board.items
  const [cur, setCur] = useState(() => Math.max(0, items.findIndex((it) => !progress[it.key]?.done)))
  const [val, setVal] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const curRef = useRef(cur)
  curRef.current = cur
  const it = items[cur]
  const p = it ? progress[it.key] : undefined

  useEffect(() => input.current?.focus(), [cur])

  function next(from = cur) {
    for (let s = 1; s <= items.length; s++) {
      const j = (from + s) % items.length
      if (!progress[items[j].key]?.done || j === from) {
        if (!progress[items[j].key]?.done) {
          setCur(j)
          setVal('')
          return
        }
      }
    }
  }
  async function answer() {
    if (!it || !val.trim() || busy) return
    const r = await play('answer', { item: it.key, value: val })
    const at = cur
    if (r?.ok && r.done) setTimeout(() => curRef.current === at && next(), r.correct ? 350 : 1100)
    else setVal('')
  }

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div className="relative">
      <div className="relative mx-auto aspect-square w-[min(100%,22rem)] sm:w-full">
        {items.map((x, i) => {
          const a = (i / items.length) * Math.PI * 2 - Math.PI / 2
          const pr = progress[x.key]
          return (
            <button
              key={x.key}
              onClick={() => !pr?.done && (setCur(i), setVal(''))}
              aria-label={`Letra ${x.letter}${pr?.done ? (pr.correct ? ', acertada' : ', fallada') : ''}`}
              className={cn(
                'absolute grid size-[9%] min-h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-display text-[clamp(0.75rem,2.6vw,1.1rem)] font-black text-white shadow-md transition-transform',
                pr?.done ? (pr.correct ? 'bg-uap-green' : 'bg-uap-red') : 'bg-uap-blue',
                i === cur && 'z-10 scale-125 bg-uap-gold text-ink ring-4 ring-uap-gold/40',
              )}
              style={{ left: `${50 + 45 * Math.cos(a)}%`, top: `${50 + 45 * Math.sin(a)}%` }}
            >
              {x.letter}
            </button>
          )
        })}
        {/* en el celular, el centro del rosco muestra la letra en grande y la pista va debajo */}
        {it && (
          <div className="absolute inset-[18%] grid place-items-center rounded-full bg-surface-2 shadow-inner ring-1 ring-line sm:hidden" aria-hidden>
            <span className="font-display text-7xl font-black text-uap-gold">{it.letter}</span>
          </div>
        )}
      </div>
        <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-3xl bg-surface-2 p-4 text-center shadow-sm ring-1 ring-line sm:absolute sm:inset-[14%] sm:mt-0 sm:rounded-full sm:p-[8%] sm:shadow-inner">
          <AnimatePresence initial={false}>
            {it && (
              <motion.div key={it.key} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} className="flex w-full flex-col items-center gap-2">
                <p className="font-display text-xs font-black uppercase tracking-widest text-ink-soft sm:text-sm">
                  {it.contains ? 'Contiene la' : 'Empieza por'} <span className="text-2xl text-uap-gold sm:text-3xl">{it.letter}</span>
                </p>
                <ClueImage src={it.image_url} className="h-16 w-24 bg-white sm:h-20" />
                <p className="line-clamp-4 text-sm font-semibold leading-snug sm:text-base">{it.clue}</p>
                {p?.done ? (
                  <p className={cn('font-display text-lg font-black', p.correct ? 'text-uap-green' : 'text-uap-red')}>{p.correct ? '¡Correcto!' : p.answer ? `Era: ${p.answer}` : 'Fallada'}</p>
                ) : (
                  <form
                    className="flex w-full flex-col items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void answer()
                    }}
                  >
                    <input
                      ref={input}
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="Escriba la respuesta"
                      aria-label={`Respuesta que ${it.contains ? 'contiene la' : 'empieza por'} ${it.letter}`}
                      autoComplete="off"
                      spellCheck={false}
                      className="h-11 w-full max-w-[14rem] rounded-2xl border-2 border-line bg-white px-3 text-center font-display font-bold outline-none focus:border-uap-gold dark:bg-white/10"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" type="submit" disabled={busy || !val.trim()}>
                        <Send className="size-4" /> Responder
                      </Button>
                      <Button size="sm" variant="secondary" type="button" onClick={() => next()} disabled={busy}>
                        <SkipForward className="size-4" /> Pasapalabra
                      </Button>
                    </div>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">
        {board.tries === 1 ? 'Una sola oportunidad por letra.' : `${board.tries} oportunidades por letra.`} Con “Pasapalabra” la deja para la siguiente vuelta.
      </p>
    </div>
  )
}
