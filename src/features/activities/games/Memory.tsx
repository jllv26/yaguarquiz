import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { JAGUAR } from '../../../components/jaguar/assets'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'

export default function Memory() {
  const { board, progress, play, busy } = useGame<'memory'>()
  const { cards } = board.board
  const [open, setOpen] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const matched = useMemo(() => {
    const s = new Set<string>()
    for (const p of Object.values(progress)) p.pair?.forEach((k) => s.add(k))
    return s
  }, [progress])

  async function flip(k: string) {
    if (busy || matched.has(k) || open.includes(k) || open.length >= 2 || wrong.length) return
    const now = [...open, k]
    setOpen(now)
    if (now.length < 2) return
    const r = await play('pair', { a: now[0], b: now[1] })
    if (r?.ok && r.correct) setOpen([])
    else {
      setWrong(now)
      setTimeout(() => {
        setOpen([])
        setWrong([])
      }, 1000)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-[repeat(auto-fill,minmax(5.2rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-3">
        {cards.map((c, i) => {
          const up = matched.has(c.key) || open.includes(c.key)
          return (
            <button
              key={c.key}
              onClick={() => void flip(c.key)}
              aria-label={up ? `Carta ${i + 1}: ${c.text || 'imagen'}` : `Carta ${i + 1}, boca abajo`}
              className="aspect-[3/4] [perspective:800px]"
            >
              <motion.div
                aria-hidden
                className="relative size-full [transform-style:preserve-3d]"
                animate={{ rotateY: up ? 180 : 0, x: wrong.includes(c.key) ? [0, -6, 6, -3, 3, 0] : 0 }}
                transition={{ duration: 0.35 }}
              >
                <div
                  className="absolute inset-0 grid place-items-center overflow-hidden rounded-2xl bg-[#3a2a12] shadow-md ring-2 ring-uap-gold/40 [backface-visibility:hidden]"
                  style={{ backgroundImage: `url(${JAGUAR.piel})`, backgroundSize: '140px' }}
                >
                  <img src={JAGUAR.huella} alt="" className="w-1/3 opacity-90 drop-shadow" />
                </div>
                <div
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl p-2 text-center shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)]',
                    matched.has(c.key) ? 'bg-uap-green text-white' : wrong.includes(c.key) ? 'bg-uap-red text-white' : 'bg-surface-2 ring-2 ring-uap-gold',
                  )}
                >
                  {up && c.image_url && <img src={c.image_url} alt="" className="max-h-[65%] w-full rounded-lg bg-white object-contain" />}
                  {up && c.text && <span className={cn('font-display font-bold leading-tight', c.text.length > 40 ? 'text-[0.7rem] sm:text-xs' : c.text.length > 18 ? 'text-xs sm:text-sm' : 'text-sm sm:text-lg')}>{c.text}</span>}
                </div>
              </motion.div>
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs text-ink-soft">Voltee dos cartas: si son pareja se quedan descubiertas. Cuantos menos errores, más puntos.</p>
    </div>
  )
}
