import { CheckCircle2 } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'

const COLORS = ['#1DBF73', '#2D7DFF', '#FFB800', '#FF3355', '#7C3AED', '#14B8A6', '#C9A23A', '#8B1A1A', '#1F3864', '#e8590c', '#0ca678', '#ae3ec9', '#1971c2', '#f08c00', '#5c940d']
type Cell = [number, number]

/** Celdas en línea recta entre dos puntos (horizontal, vertical o diagonal); null si no es una línea. */
function line(a: Cell, b: Cell): Cell[] | null {
  const dy = Math.sign(b[0] - a[0])
  const dx = Math.sign(b[1] - a[1])
  const ly = Math.abs(b[0] - a[0])
  const lx = Math.abs(b[1] - a[1])
  if (ly && lx && ly !== lx) return null
  const n = Math.max(ly, lx)
  return Array.from({ length: n + 1 }, (_, k) => [a[0] + dy * k, a[1] + dx * k] as Cell)
}

export default function Wordsearch() {
  const { board, progress, play, busy } = useGame<'wordsearch'>()
  const { grid, clues, show_words } = board.board
  const size = grid.length
  const cols = grid[0]?.length ?? 0
  const [start, setStart] = useState<Cell | null>(null)
  const [end, setEnd] = useState<Cell | null>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const [focusCell, setFocusCell] = useState<Cell>([0, 0])

  const color = useMemo(() => {
    const m = new Map<string, string>()
    clues.forEach((c, i) => m.set(c.key, COLORS[i % COLORS.length]))
    return m
  }, [clues])
  const found = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clues) for (const cell of progress[c.key]?.cells ?? []) m.set(`${cell[0]},${cell[1]}`, color.get(c.key)!)
    return m
  }, [clues, progress, color])
  const sel = start && end ? line(start, end) : start ? [start] : null
  const selSet = new Set((sel ?? []).map((c) => `${c[0]},${c[1]}`))

  async function submit(a: Cell, b: Cell) {
    const cells = line(a, b)
    setStart(null)
    setEnd(null)
    if (!cells || cells.length < 2 || busy) return
    const value = cells.map(([y, x]) => grid[y][x]).join('')
    await play('find', { value, cells })
  }
  const cellAt = (e: PointerEvent): Cell | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const d = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell
    return d ? (d.split(',').map(Number) as Cell) : null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="overflow-x-auto rounded-3xl bg-surface-2 p-2 shadow-sm ring-1 ring-line sm:p-3" style={{ containerType: 'inline-size' }}>
        <div
          role="group" data-board
          aria-label="Sopa de letras: arrastre desde la primera letra hasta la última, o toque la primera y luego la última"
          className="mx-auto grid w-fit touch-none select-none gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${cols}, var(--cw))`, ['--cw' as string]: `min(2.5rem, calc((100cqi - ${cols * 2}px) / ${cols}))` }}
          onPointerDown={(e) => {
            const c = cellAt(e)
            if (!c) return
            ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
            dragging.current = true
            moved.current = false
            if (start && !end && (start[0] !== c[0] || start[1] !== c[1])) {
              // segundo toque: cierra la selección
              dragging.current = false
              void submit(start, c)
              return
            }
            setStart(c)
            setEnd(null)
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !start) return
            const c = cellAt(e)
            if (c && (c[0] !== start[0] || c[1] !== start[1]) && line(start, c)) {
              moved.current = true
              setEnd(c)
            }
          }}
          onPointerUp={() => {
            if (!dragging.current) return
            dragging.current = false
            if (moved.current && start && end) void submit(start, end)
          }}
        >
          {grid.flatMap((row, y) =>
            [...row].map((ch, x) => {
              const k = `${y},${x}`
              const f = found.get(k)
              const s = selSet.has(k)
              return (
                <button
                  key={k}
                  data-cell={k}
                  tabIndex={focusCell[0] === y && focusCell[1] === x ? 0 : -1}
                  onKeyDown={(e) => {
                    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
                    if (d) {
                      e.preventDefault()
                      const n: Cell = [Math.max(0, Math.min(size - 1, y + d[0])), Math.max(0, Math.min(cols - 1, x + d[1]))]
                      setFocusCell(n)
                      ;(document.querySelector(`[data-cell="${n[0]},${n[1]}"]`) as HTMLElement | null)?.focus()
                      if (start) setEnd(line(start, n) ? n : end)
                    } else if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!start) setStart([y, x])
                      else void submit(start, [y, x])
                    } else if (e.key === 'Escape') {
                      setStart(null)
                      setEnd(null)
                    }
                  }}
                  aria-label={`Fila ${y + 1}, columna ${x + 1}: ${ch}`}
                  className={cn(
                    'grid aspect-square place-items-center rounded-md font-display text-[min(1.25rem,calc(var(--cw)*0.55))] font-black transition-colors focus-visible:ring-4 focus-visible:ring-uap-gold/60',
                    s ? 'scale-105 bg-uap-gold text-ink shadow' : f ? 'text-white' : 'bg-white text-ink dark:bg-white/10 dark:text-white',
                  )}
                  style={f && !s ? { background: f } : undefined}
                >
                  {ch}
                </button>
              )
            }),
          )}
        </div>
        <p className="mt-2 text-center text-xs text-ink-soft">👆 Arrastra el dedo de la primera a la última letra (o tócalas una tras otra). Pueden estar en horizontal, vertical, diagonal o al revés.</p>
      </div>
      <div className="rounded-3xl bg-surface-2 p-3 shadow-sm ring-1 ring-line">
        <h3 className="mb-2 font-display font-black">{show_words ? 'Palabras a encontrar' : 'Busca la palabra que corresponde a…'}</h3>
        <ul className="flex flex-wrap gap-2 lg:flex-col">
          {clues.map((c) => {
            const p = progress[c.key]
            return (
              <li
                key={c.key}
                className={cn('flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold', p?.done ? 'text-white' : 'bg-ink/5')}
                style={p?.done ? { background: color.get(c.key) } : undefined}
              >
                {p?.done && <CheckCircle2 className="size-4 shrink-0" />}
                <ClueImage src={c.image_url} className="size-10 bg-white" />
                <span className={cn(show_words && p?.done && 'line-through')}>
                  {p?.done && !show_words ? p.value : c.text}
                  {c.len && !p?.done ? <span className="ml-1 text-ink-soft">({c.len})</span> : null}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
