import { motion } from 'framer-motion'
import { CheckCircle2, CornerDownLeft, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { gameLetters } from '../types'

type Word = ReturnType<typeof useGame<'crossword'>>['board']['board']['words'][number]
const id = (r: number, c: number) => `${r},${c}`
const cellsOf = (w: Word) => Array.from({ length: w.len }, (_, k) => (w.dir === 'across' ? id(w.row, w.col + k) : id(w.row + k, w.col)))

export default function Crossword() {
  const { board, progress, play, busy, flash } = useGame<'crossword'>()
  const { rows, cols, words } = board.board
  const map = useMemo(() => {
    const m = new Map<string, { words: Word[]; n?: number }>()
    for (const w of words)
      cellsOf(w).forEach((c, k) => {
        const e = m.get(c) ?? { words: [] }
        e.words.push(w)
        if (k === 0) e.n = w.n
        m.set(c, e)
      })
    return m
  }, [words])

  // letras escritas; las palabras ya resueltas (o reveladas) se rellenan desde el progreso
  const [letters, setLettersState] = useState<Record<string, string>>({})
  // copia inmediata de las letras (Enter puede llegar antes de que React vuelva a dibujar)
  const lettersRef = useRef<Record<string, string>>({})
  const setLetters = (fn: (l: Record<string, string>) => Record<string, string>) => {
    lettersRef.current = fn(lettersRef.current)
    setLettersState(lettersRef.current)
  }
  useEffect(() => {
    setLetters((prev) => {
      const next = { ...prev }
      for (const w of words) {
        const p = progress[w.key]
        const txt = p?.done ? gameLetters(p.correct ? (p.value ?? p.answer ?? '') : (p.answer ?? '')) : ''
        if (txt) cellsOf(w).forEach((c, k) => (next[c] = txt[k] ?? next[c] ?? ''))
      }
      return next
    })
  }, [progress, words])

  const [active, setActiveState] = useState<{ key: string; cell: string }>(() => {
    const w = words.find((x) => !progress[x.key]?.done) ?? words[0]
    return { key: w?.key ?? '', cell: w ? cellsOf(w)[0] : '' }
  })
  // copia inmediata (el foco cambia antes de que React vuelva a dibujar)
  const activeRef = useRef(active)
  const setActive = (v: { key: string; cell: string }) => {
    activeRef.current = v
    setActiveState(v)
  }
  const word = words.find((w) => w.key === active.key)
  const refs = useRef(new Map<string, HTMLInputElement>())
  const wasActive = useRef(false)
  const focus = (c: string) => refs.current.get(c)?.focus()
  const [shake, setShake] = useState(0)

  const lockedCell = (c: string) => (map.get(c)?.words ?? []).some((w) => progress[w.key]?.done && progress[w.key]?.correct)
  const status = (c: string) => {
    const ws = map.get(c)?.words ?? []
    if (ws.some((w) => progress[w.key]?.done && progress[w.key]?.correct)) return 'ok'
    if (ws.some((w) => progress[w.key]?.done && !progress[w.key]?.correct)) return 'bad'
    return ''
  }

  function select(c: string, toggle = false) {
    const ws = map.get(c)?.words ?? []
    if (!ws.length) return
    const a = activeRef.current
    // al tocar de nuevo una celda de cruce, cambia de dirección
    const same = toggle && a.cell === c && ws.length > 1
    const w = same ? ws.find((x) => x.key !== a.key)! : (ws.find((x) => x.key === a.key) ?? ws.find((x) => !progress[x.key]?.done) ?? ws[0])
    setActive({ key: w.key, cell: c })
  }
  function move(step: number) {
    const a = activeRef.current
    const wd = words.find((w) => w.key === a.key)
    if (!wd) return
    const cs = cellsOf(wd)
    const i = cs.indexOf(a.cell)
    const j = Math.max(0, Math.min(cs.length - 1, i + step))
    setActive({ key: wd.key, cell: cs[j] })
    focus(cs[j])
  }
  function nextWord(dir = 1) {
    const open = words.filter((w) => !progress[w.key]?.done)
    if (!open.length) return
    const i = open.findIndex((w) => w.key === activeRef.current.key)
    const w = open[(i + dir + open.length) % open.length]
    const c = cellsOf(w)[0]
    setActive({ key: w.key, cell: c })
    focus(c)
  }
  function type(c: string, ch: string) {
    if (lockedCell(c)) return move(1)
    setLetters((l) => ({ ...l, [c]: ch }))
    move(1)
  }
  async function check() {
    const word = words.find((w) => w.key === activeRef.current.key)
    if (!word || progress[word.key]?.done || busy) return
    const value = cellsOf(word).map((c) => lettersRef.current[c] ?? '').join('')
    if (value.length < word.len) {
      flash(false, 'Completa la palabra')
      return
    }
    const r = await play('answer', { item: word.key, value })
    if (r?.ok && !r.correct) setShake((s) => s + 1)
    // pasa sola a la siguiente palabra, salvo que el estudiante ya haya elegido otra
    if (r?.ok && r.done) setTimeout(() => activeRef.current.key === word.key && nextWord(), 400)
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>, c: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void check()
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      if (!lockedCell(c) && lettersRef.current[c]) setLetters((l) => ({ ...l, [c]: '' }))
      else move(-1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      nextWord(e.shiftKey ? -1 : 1)
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const [r, k] = c.split(',').map(Number)
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]!
      for (let s = 1; s < Math.max(rows, cols); s++) {
        const t = id(r + d[0] * s, k + d[1] * s)
        if (map.has(t)) {
          const ws = map.get(t)!.words
          const w = ws.find((x) => x.dir === (d[0] ? 'down' : 'across')) ?? ws[0]
          setActive({ key: w.key, cell: t })
          focus(t)
          break
        }
      }
    } else if (/^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ0-9]$/.test(e.key)) {
      e.preventDefault()
      type(c, gameLetters(e.key) || e.key.toUpperCase())
    }
  }

  const activeCells = new Set(word ? cellsOf(word) : [])
  const p = word ? progress[word.key] : undefined
  const across = words.filter((w) => w.dir === 'across')
  const down = words.filter((w) => w.dir === 'down')

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        {word && (
          <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} className="sticky top-2 z-10 flex flex-wrap items-start gap-3 rounded-2xl bg-uap-blue p-3 text-white shadow-lg">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 font-display font-black">{word.n}</span>
            <div className="min-w-[12rem] flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                {word.dir === 'across' ? 'Horizontal' : 'Vertical'} · {word.len} letras
                {p?.tries && !p.done ? ` · intento ${p.tries + 1} de ${board.tries}` : ''}
              </p>
              <p className="font-semibold leading-snug">{word.clue}</p>
            </div>
            <ClueImage src={word.image_url} className="h-14 w-14 bg-white" />
            {!p?.done && (
              <Button size="sm" variant="gold" onClick={() => void check()} disabled={busy}>
                <CornerDownLeft className="size-4" /> Comprobar
              </Button>
            )}
          </motion.div>
        )}
        <div className="overflow-x-auto rounded-3xl bg-surface-2 p-2 shadow-sm ring-1 ring-line sm:p-3" style={{ containerType: 'inline-size' }}>
          <div
            className="mx-auto grid w-fit gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${cols}, var(--cw))`, ['--cw' as string]: `min(2.6rem, calc((100cqi - ${cols * 2}px) / ${cols}))` }}
            role="group" data-board
            aria-label="Crucigrama"
          >
            {Array.from({ length: rows * cols }, (_, k) => {
              const r = Math.floor(k / cols)
              const c = k % cols
              const cid = id(r, c)
              const e = map.get(cid)
              if (!e) return <div key={cid} className="aspect-square" />
              const st = status(cid)
              return (
                <div key={cid} className="relative aspect-square">
                  {e.n && <span className="pointer-events-none absolute left-0.5 top-0 z-10 text-[0.55rem] font-bold leading-none text-ink-soft sm:text-[0.65rem]">{e.n}</span>}
                  <input
                    ref={(el) => {
                      if (el) refs.current.set(cid, el)
                    }}
                    value={letters[cid] ?? ''}
                    onChange={(ev) => {
                      const ch = gameLetters(ev.target.value.slice(-1))
                      if (ch) type(cid, ch)
                    }}
                    onKeyDown={(ev) => onKey(ev, cid)}
                    onPointerDown={() => (wasActive.current = activeRef.current.cell === cid)}
                    onFocus={() => activeRef.current.cell !== cid && select(cid)}
                    onClick={() => wasActive.current && select(cid, true)}
                    readOnly={lockedCell(cid)}
                    maxLength={2}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-label={`${e.words.map((w) => `${w.n} ${w.dir === 'across' ? 'horizontal' : 'vertical'}`).join(', ')}, letra`}
                    className={cn(
                      'size-full rounded-md border-2 text-center font-display text-[min(1.3rem,calc(var(--cw)*0.55))] font-black uppercase caret-transparent outline-none transition-colors',
                      st === 'ok' ? 'border-uap-green bg-uap-green/15 text-uap-green dark:text-game-selva' : st === 'bad' ? 'border-uap-red bg-uap-red/10 text-uap-red dark:text-game-coral' : 'border-line bg-white text-ink dark:bg-white/10',
                      activeCells.has(cid) && !st && 'border-uap-gold bg-uap-gold/15',
                      active.cell === cid && 'ring-4 ring-uap-gold/60',
                    )}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <p className="text-center text-xs text-ink-soft">Escriba con el teclado · Enter comprueba · Tab pasa a la siguiente palabra · toque dos veces un cruce para cambiar de dirección</p>
      </div>
      <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {[
          ['Horizontales', across],
          ['Verticales', down],
        ].map(([title, list]) =>
          (list as Word[]).length ? (
            <div key={title as string} className="rounded-3xl bg-surface-2 p-3 shadow-sm ring-1 ring-line">
              <h3 className="mb-2 font-display font-black">{title as string}</h3>
              <ol className="flex flex-col gap-1">
                {(list as Word[]).map((w) => {
                  const pr = progress[w.key]
                  return (
                    <li key={w.key}>
                      <button
                        onClick={() => {
                          const c = cellsOf(w)[0]
                          setActive({ key: w.key, cell: c })
                          focus(c)
                        }}
                        className={cn('flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm', w.key === active.key ? 'bg-uap-gold/20' : 'hover:bg-ink/5', pr?.done && 'opacity-80')}
                      >
                        <span className="w-5 shrink-0 font-display font-black">{w.n}</span>
                        <span className={cn('flex-1', pr?.done && pr.correct && 'line-through decoration-uap-green')}>{w.clue}</span>
                        {pr?.done && (pr.correct ? <CheckCircle2 className="size-4 shrink-0 text-uap-green" /> : <XCircle className="size-4 shrink-0 text-uap-red" />)}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}
