import { motion, Reorder, useDragControls } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CornerDownLeft, GripVertical } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { ItemDots, triesLeft, useCursor } from './common'

function Row({ value, i, n, move, locked, state }: { value: string; i: number; n: number; move: (from: number, to: number) => void; locked: boolean; state: 'idle' | 'ok' | 'bad' }) {
  const ctl = useDragControls()
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={ctl}
      className={cn(
        'flex select-none items-center gap-2 rounded-2xl border-2 bg-surface px-2 py-2 shadow-sm',
        state === 'ok' ? 'border-uap-green bg-uap-green/10' : state === 'bad' ? 'border-uap-red/60' : 'border-[#5c7cfa]/40',
      )}
    >
      {!locked && (
        <span onPointerDown={(e) => ctl.start(e)} className="cursor-grab touch-none rounded-lg p-1.5 text-ink-soft active:cursor-grabbing" aria-hidden>
          <GripVertical className="size-5" />
        </span>
      )}
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-black text-white', state === 'ok' ? 'bg-uap-green' : 'bg-[#5c7cfa]')}>{i + 1}</span>
      <span className="flex-1 font-semibold leading-tight">{value}</span>
      {!locked && (
        <span className="flex flex-col">
          <button onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded p-0.5 text-ink-soft hover:bg-ink/10 disabled:opacity-20" aria-label={`Subir «${value}»`}>
            <ChevronUp className="size-5" />
          </button>
          <button onClick={() => move(i, i + 1)} disabled={i === n - 1} className="rounded p-0.5 text-ink-soft hover:bg-ink/10 disabled:opacity-20" aria-label={`Bajar «${value}»`}>
            <ChevronDown className="size-5" />
          </button>
        </span>
      )}
    </Reorder.Item>
  )
}

export default function Rows() {
  const { board, progress, play, busy } = useGame<'rows'>()
  const items = board.board.items
  const keys = items.map((x) => x.key)
  const { cur, setCur, next, curRef } = useCursor(keys, progress)
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  const [order, setOrder] = useState<string[]>(it?.tiles ?? [])
  const [shake, setShake] = useState(0)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setOrder(it?.tiles ?? [])
    setBad(false)
  }, [it?.key, it?.tiles])
  if (!it) return null
  const final = p?.done ? String((p.correct ? (p.value ?? '') : (p.answer ?? '')) || '').split(/\s*\|\s*/).filter(Boolean) : null
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    setOrder((o) => {
      const x = [...o]
      const [v] = x.splice(from, 1)
      x.splice(to, 0, v)
      return x
    })
    setBad(false)
  }
  async function check() {
    if (busy || p?.done) return
    const r = await play('answer', { item: it.key, value: order.join(' | ') })
    if (!r?.ok) return
    const at = curRef.current
    if (r.correct) setTimeout(() => curRef.current === at && next(at), 900)
    else {
      setShake((s) => s + 1)
      setBad(true)
      if (r.done) setTimeout(() => curRef.current === at && next(at), 1600)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {items.length > 1 && <ItemDots keys={keys} progress={progress} cur={cur} onPick={setCur} label="Fila" />}
      <motion.div key={`${it.key}-${shake}`} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { opacity: [0, 1] }} className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line sm:p-5">
        <p className="text-center font-display text-lg font-black leading-snug">{it.title}</p>
        <ClueImage src={it.image_url} className="mx-auto h-24 w-36 bg-white" />
        <p className="text-center text-xs font-semibold text-ink-soft">{final ? (p?.correct ? '✓ Orden correcto' : 'Orden correcto:') : 'Arrastra desde ⠿ o usa las flechas: el 1 va primero.'}</p>
        {final ? (
          <ol className="flex flex-col gap-2">
            {final.map((v, i) => (
              <li key={i} className={cn('flex items-center gap-2 rounded-2xl border-2 px-3 py-2 font-semibold', p?.correct ? 'border-uap-green bg-uap-green/10' : 'border-uap-red/40')}>
                <span className={cn('grid size-7 place-items-center rounded-full text-sm font-black text-white', p?.correct ? 'bg-uap-green' : 'bg-uap-red')}>{i + 1}</span>
                {v}
              </li>
            ))}
          </ol>
        ) : p?.done ? (
          <p className="text-center font-display font-black text-uap-red">Sin intentos · el orden correcto se ve al cerrar la actividad</p>
        ) : (
          <>
            <Reorder.Group axis="y" values={order} onReorder={(o) => (setOrder(o), setBad(false))} className="flex flex-col gap-2">
              {order.map((v, i) => (
                <Row key={v} value={v} i={i} n={order.length} move={move} locked={false} state={bad ? 'bad' : 'idle'} />
              ))}
            </Reorder.Group>
            <Button variant="success" className="self-center" onClick={() => void check()} disabled={busy}>
              <CornerDownLeft className="size-4" /> Comprobar
            </Button>
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
