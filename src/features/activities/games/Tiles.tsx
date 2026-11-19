import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CornerDownLeft, Eraser } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'

interface TileItem {
  key: string
  clue: string
  image_url: string | null
  tiles: string[]
  words?: number[]
}

export function Anagram() {
  const { board } = useGame<'anagram'>()
  return <TileGame items={board.board.items} mode="letters" />
}
export function Sentence() {
  const { board } = useGame<'sentence'>()
  return <TileGame items={board.board.items} mode="words" />
}

function TileGame({ items, mode }: { items: TileItem[]; mode: 'letters' | 'words' }) {
  const { board, progress, play, busy } = useGame<'anagram'>()
  const [cur, setCurRaw] = useState(() => Math.max(0, items.findIndex((x) => !progress[x.key]?.done)))
  const [placed, setPlaced] = useState<number[]>([])
  const setCur = (v: number | ((c: number) => number)) => {
    setCurRaw(v)
    setPlaced([])
  }
  const [shake, setShake] = useState(0)
  const curRef = useRef(cur)
  curRef.current = cur
  const it = items[cur]
  const p = it ? progress[it.key] : undefined

  const goNext = () => {
    for (let s = 1; s <= items.length; s++) {
      const j = (cur + s) % items.length
      if (!progress[items[j].key]?.done) return setCur(j)
    }
  }
  async function check() {
    if (!it || busy || placed.length !== it.tiles.length) return
    const value = placed.map((i) => it.tiles[i]).join(mode === 'letters' ? '' : ' ')
    const r = await play('answer', { item: it.key, value })
    if (!r?.ok) return
    const at = cur
    const advance = () => curRef.current === at && goNext()
    if (r.correct) setTimeout(advance, 700)
    else {
      setShake((s) => s + 1)
      if (r.done) setTimeout(advance, 1600)
      else setPlaced([])
    }
  }
  // teclado: escribir letras/usar Backspace y Enter
  useEffect(() => {
    if (!it || p?.done) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Enter') return void check()
      if (e.key === 'Backspace') return setPlaced((x) => x.slice(0, -1))
      if (mode === 'letters' && e.key.length === 1) {
        const ch = e.key.toUpperCase()
        const i = it.tiles.findIndex((t, k) => t === ch && !placed.includes(k))
        if (i >= 0) setPlaced((x) => [...x, i])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!it) return null

  // ranuras agrupadas por palabra (ordenar letras de varias palabras)
  const groups = mode === 'letters' && it.words?.length ? it.words : [it.tiles.length]
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((a, b) => a + b, 0))
  const shownAnswer = p?.done ? (p.correct ? p.value : p.answer) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-1.5" aria-label="Elementos">
        {items.map((x, i) => {
          const pr = progress[x.key]
          return (
            <button
              key={x.key}
              onClick={() => setCur(i)}
              aria-label={`Elemento ${i + 1}${pr?.done ? (pr.correct ? ', resuelto' : ', fallado') : ''}`}
              className={cn('size-8 rounded-full font-display text-sm font-black', pr?.done ? (pr.correct ? 'bg-uap-green text-white' : 'bg-uap-red text-white') : 'bg-ink/10', i === cur && 'ring-4 ring-uap-gold')}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <motion.div key={`${it.key}-${shake}`} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { opacity: [0, 1] }} className="flex flex-col items-center gap-4 rounded-3xl bg-surface-2 p-5 shadow-sm ring-1 ring-line">
        <div className="flex items-center gap-3">
          <ClueImage src={it.image_url} className="h-24 w-32 bg-white" />
          {it.clue && <p className="max-w-xl text-center font-display text-lg font-bold">{it.clue}</p>}
        </div>

        {shownAnswer ? (
          <p className={cn('rounded-2xl px-5 py-3 text-center font-display text-2xl font-black tracking-wider', p?.correct ? 'bg-uap-green/15 text-uap-green dark:text-game-selva' : 'bg-uap-red/10 text-uap-red dark:text-game-coral')}>
            {p?.correct ? '✓ ' : 'Era: '}
            {shownAnswer}
          </p>
        ) : p?.done ? (
          <p className="font-display text-xl font-black text-uap-red">Sin intentos</p>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label="Respuesta">
              {groups.map((len, g) => {
                const from = starts[g]
                return (
                  <div key={g} className="flex flex-wrap justify-center gap-1.5">
                    {Array.from({ length: len }, (_, k) => {
                      const slot = from + k
                      const ti = placed[slot]
                      return (
                        <button
                          key={k}
                          onClick={() => ti !== undefined && setPlaced((x) => x.filter((_, j) => j !== slot))}
                          className={cn(
                            'grid place-items-center rounded-xl border-2 font-display font-black transition',
                            mode === 'letters' ? 'size-11 text-xl sm:size-12' : 'h-11 min-w-16 px-3',
                            ti !== undefined ? 'border-uap-blue bg-uap-blue text-white' : 'border-dashed border-ink/25 bg-ink/5',
                          )}
                          aria-label={ti !== undefined ? `Quitar ${it.tiles[ti]}` : 'Espacio vacío'}
                        >
                          {ti !== undefined ? it.tiles[ti] : ''}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Fichas disponibles">
              {it.tiles.map((t, i) =>
                placed.includes(i) ? (
                  <span key={i} className={cn('rounded-xl border-2 border-transparent', mode === 'letters' ? 'size-11 sm:size-12' : 'h-11 min-w-16')} />
                ) : (
                  <motion.button
                    key={i}
                    layout
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setPlaced((x) => [...x, i])}
                    className={cn(
                      'grid place-items-center rounded-xl border-2 border-uap-gold/60 bg-uap-gold/15 font-display font-black shadow-sm hover:-translate-y-0.5',
                      mode === 'letters' ? 'size-11 text-xl sm:size-12' : 'h-11 min-w-16 px-3',
                    )}
                  >
                    {t}
                  </motion.button>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPlaced([])} disabled={!placed.length}>
                <Eraser className="size-4" /> Borrar
              </Button>
              <Button size="sm" variant="success" onClick={() => void check()} disabled={busy || placed.length !== it.tiles.length}>
                <CornerDownLeft className="size-4" /> Comprobar
              </Button>
            </div>
            {p?.tries ? <p className="text-sm font-semibold text-uap-red">Le queda{board.tries - p.tries === 1 ? '' : 'n'} {board.tries - p.tries} intento(s)</p> : null}
          </>
        )}
      </motion.div>
      <div className="flex justify-between">
        <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c - 1 + items.length) % items.length)}>
          <ChevronLeft className="size-4" /> Anterior
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c + 1) % items.length)}>
          Siguiente <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
