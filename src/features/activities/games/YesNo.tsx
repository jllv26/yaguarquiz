import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { triesLeft } from './common'

export default function YesNo() {
  const { board, progress, play, busy } = useGame<'yesno'>()
  const items = board.board.items
  const pending = items.filter((x) => !progress[x.key]?.done)
  const it = pending[0]
  const [fly, setFly] = useState<{ key: string; dir: 1 | -1; ok: boolean | null } | null>(null)
  const [shake, setShake] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yesOp = useTransform(x, [20, 120], [0, 1])
  const noOp = useTransform(x, [-120, -20], [1, 0])
  const doneN = items.length - pending.length

  async function answer(dir: 1 | -1) {
    if (!it || busy || fly) return
    setMsg(null)
    setFly({ key: it.key, dir, ok: null })
    const r = await play('answer', { item: it.key, value: dir === 1 ? 'Sí' : 'No' })
    if (!r?.ok) return setFly(null)
    if (r.done) {
      setFly({ key: it.key, dir, ok: !!r.correct })
      setTimeout(() => {
        setFly(null)
        x.set(0)
      }, 450)
    } else {
      setFly(null)
      x.set(0)
      setShake((s) => s + 1)
      setMsg(triesLeft(board.tries, r.tries))
    }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight') void answer(1)
      if (e.key === 'ArrowLeft') void answer(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110) void answer(1)
    else if (info.offset.x < -110) void answer(-1)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <p className="rounded-2xl bg-[#e8590c] px-4 py-2 text-center font-display text-lg font-black text-white shadow">{board.board.question}</p>
      <p className="text-sm font-bold text-ink-soft">
        Tarjeta {Math.min(doneN + 1, items.length)} de {items.length}
      </p>

      <div className="relative h-72 w-full sm:h-80">
        {/* la siguiente tarjeta asoma detrás */}
        {pending[1] && <div className="absolute inset-x-4 top-3 h-full rounded-3xl bg-surface-2 opacity-70 shadow ring-1 ring-line" aria-hidden />}
        <AnimatePresence>
          {it ? (
            <motion.div
              key={`${it.key}-${shake}`}
              drag={fly ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.9}
              onDragEnd={onDragEnd}
              style={{ x, rotate }}
              initial={{ scale: 0.92, opacity: 0, y: 10 }}
              animate={shake ? { x: [0, -12, 12, -8, 8, 0], scale: 1, opacity: 1, y: 0 } : { scale: 1, opacity: 1, y: 0 }}
              exit={{ x: (fly?.dir ?? 1) * 420, opacity: 0, rotate: (fly?.dir ?? 1) * 20, transition: { duration: 0.35 } }}
              className={cn(
                'absolute inset-0 flex cursor-grab touch-pan-y flex-col items-center justify-center gap-3 rounded-3xl border-4 bg-surface p-5 text-center shadow-xl active:cursor-grabbing',
                fly?.ok === true ? 'border-uap-green' : fly?.ok === false ? 'border-uap-red' : 'border-transparent',
              )}
            >
              <motion.span style={{ opacity: yesOp }} className="absolute left-4 top-4 -rotate-12 rounded-xl border-4 border-uap-green px-2 font-display text-2xl font-black text-uap-green">
                SÍ
              </motion.span>
              <motion.span style={{ opacity: noOp }} className="absolute right-4 top-4 rotate-12 rounded-xl border-4 border-uap-red px-2 font-display text-2xl font-black text-uap-red">
                NO
              </motion.span>
              <ClueImage src={it.image_url} className="h-28 w-40 bg-white" />
              <p className="font-display text-xl font-black leading-snug sm:text-2xl">{it.text}</p>
            </motion.div>
          ) : (
            <motion.div key="end" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 grid place-items-center rounded-3xl bg-surface-2 p-5 text-center font-display text-xl font-black">
              ¡Terminaste todas las tarjetas! 🎉
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {it && (
        <div className="grid w-full grid-cols-2 gap-3">
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => void answer(-1)} disabled={!!fly || busy} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-uap-red font-display text-xl font-black text-white shadow-lg" aria-label="No">
            <X className="size-7" strokeWidth={3} /> No
          </motion.button>
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => void answer(1)} disabled={!!fly || busy} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-uap-green font-display text-xl font-black text-white shadow-lg" aria-label="Sí">
            <Check className="size-7" strokeWidth={3} /> Sí
          </motion.button>
        </div>
      )}
      <p className="text-center text-xs font-semibold text-ink-soft">{msg ?? 'Desliza la tarjeta: a la derecha es Sí, a la izquierda es No (o toca los botones).'}</p>

      {/* resultados */}
      {doneN > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {items
            .filter((x) => progress[x.key]?.done)
            .map((x) => (
              <span key={x.key} className={cn('max-w-[12rem] truncate rounded-full px-2 py-0.5 text-xs font-bold', progress[x.key]?.correct ? 'bg-uap-green/15 text-uap-green' : 'bg-uap-red/10 text-uap-red')}>
                {progress[x.key]?.correct ? '✓' : '✗'} {x.text}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
