import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Lightbulb, Play, Pointer } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import { cn } from '../../lib/cn'
import { GUIDES, GuideDemo } from './HowToPlay'
import type { ActivityType } from './types'

/* ───────────── Guía dentro del juego: «¿Qué hago ahora?» con los pasos, el ejemplo animado y una mano que señala ───────────── */

const ACTION = /toca|escribe|desliza|arrastra|elige|dale play|responde|ordena|busca|lee|escucha/i

/** Lo que dice la burbuja de la mano en cada juego (si no está, se usa el primer paso que dice «Toca»). */
const POINTER_TEXT: Partial<Record<ActivityType, string>> = {
  classify: 'Toca una tarjeta: se abre una ventana para elegir su grupo.',
  matching: 'Toca un concepto: se abre una ventana con las definiciones.',
  fill_text: 'Toca el espacio para completarlo.',
  map: 'Toca en la imagen la parte que dice arriba.',
  rows: 'Arrastra desde ⠿ (o usa las flechas ▲▼) para poner cada elemento en su lugar.',
  riddle: 'Escribe aquí tu respuesta. Si no sabes, pide otra pista.',
  wordsearch: 'Arrastra el dedo sobre la palabra, de la primera a la última letra.',
  crossword: 'Toca una casilla o una pista y escribe la palabra.',
  yesno: 'Desliza la tarjeta o toca Sí / No.',
  dialogue: 'Toca «Escuchar» para oír la conversación.',
  dictation: 'Toca «Escuchar» y escribe lo que oyes.',
}

function seenCount(type: ActivityType): number {
  try {
    return Number(localStorage.getItem(`yq-coach:${type}`) ?? 0) || 0
  } catch {
    return 0
  }
}
function markSeen(type: ActivityType) {
  try {
    localStorage.setItem(`yq-coach:${type}`, String(seenCount(type) + 1))
  } catch {
    /* sin almacenamiento: la guía se muestra siempre */
  }
}

/** Tarjeta «¿Qué hago ahora?»: el paso actual se ilumina y avanza a medida que el estudiante juega. */
export function GameCoach({ type, instructions, moves, touched }: { type: ActivityType; instructions?: string | null; moves: number; touched: boolean }) {
  const g = GUIDES[type]
  const [first] = useState(() => seenCount(type) < 2)
  const [demo, setDemo] = useState(first)
  const [open, setOpen] = useState(true)
  useEffect(() => markSeen(type), [type])
  // al acertar o fallar la primera vez se cierra el ejemplo; después de dos jugadas la tarjeta se achica
  useEffect(() => {
    if (moves >= 1) setDemo(false)
    if (moves >= 2) setOpen(false)
  }, [moves])
  const last = g.steps.length - 1
  const step = moves >= 1 ? last : touched ? Math.min(1, last) : 0

  return (
    <motion.section layout className="overflow-hidden rounded-3xl bg-uap-gold/10 ring-1 ring-uap-gold/40" aria-label="Qué hacer en esta actividad">
      <div className="flex items-center gap-2 px-3 pt-2.5 sm:px-4">
        <motion.span animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 1.4, repeat: open ? Infinity : 0, repeatDelay: 2 }} className="grid size-7 shrink-0 place-items-center rounded-full bg-uap-gold text-ink" aria-hidden>
          <Lightbulb className="size-4" />
        </motion.span>
        <button type="button" onClick={() => setOpen((x) => !x)} className="flex min-w-0 flex-1 items-center gap-1 text-left font-display text-sm font-black" aria-expanded={open}>
          <span className="truncate">{open ? '¿Qué hago ahora?' : (instructions ?? g.steps[0])}</span>
          <ChevronDown className={cn('size-4 shrink-0 transition', open && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={() => {
            setDemo((x) => !x)
            setOpen(true)
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-uap-blue px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:brightness-110"
        >
          <Play className="size-3.5" /> {demo ? 'Ocultar ejemplo' : 'Ver ejemplo'}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-3 pb-3 sm:px-4">
            {instructions && <p className="mt-1.5 text-sm font-semibold">{instructions}</p>}
            <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
              {g.steps.map((t, i) => {
                const active = i === step
                const past = i < step
                return (
                  <motion.li
                    key={i}
                    animate={active ? { scale: [1, 1.025, 1] } : { scale: 1 }}
                    transition={active ? { duration: 1.6, repeat: Infinity } : undefined}
                    className={cn(
                      'relative flex items-start gap-2 rounded-2xl px-2.5 py-2 text-xs leading-snug transition-colors sm:text-[13px]',
                      active ? 'bg-surface font-semibold shadow-md ring-2 ring-uap-blue' : past ? 'bg-uap-green/10 text-ink-soft' : 'bg-surface/60 text-ink-soft',
                    )}
                  >
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full font-display text-[11px] font-black text-white', active ? 'bg-uap-blue' : past ? 'bg-uap-green' : 'bg-ink/30')}>
                      {past ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span>{t}</span>
                    {active && (
                      <motion.span animate={{ x: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="absolute -right-1 -top-2 rounded-full bg-uap-blue px-1.5 py-0.5 text-[10px] font-black text-white shadow" aria-hidden>
                        Ahora
                      </motion.span>
                    )}
                  </motion.li>
                )
              })}
            </ol>
            <AnimatePresence initial={false}>
              {demo && (
                <motion.div key="demo" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 sm:mx-auto sm:max-w-md">
                  <GuideDemo type={type} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

/** Mano animada que señala lo primero que hay que tocar, con el paso escrito al lado. Desaparece al primer toque. */
export function PointerHint({ type, area, hidden }: { type: ActivityType; area: RefObject<HTMLDivElement | null>; hidden: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null)
  const g = GUIDES[type]
  const text = POINTER_TEXT[type] ?? g.steps.find((s) => /\btoca\b/i.test(s)) ?? g.steps.find((s) => ACTION.test(s) && !/^lee/i.test(s)) ?? g.steps[0]
  useEffect(() => {
    if (hidden) return
    const place = () => {
      const root = area.current
      if (!root) return
      const el =
        root.querySelector<HTMLElement>('[data-coach]') ??
        root.querySelector<HTMLElement>('button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [role="button"]')
      if (!el) return setPos(null)
      const r = el.getBoundingClientRect()
      const o = root.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return setPos(null)
      const big = r.width > o.width * 0.6 || r.height > 160
      const x = big ? r.left - o.left + r.width / 2 : r.left - o.left + Math.min(r.width * 0.7, r.width - 8)
      const y = big ? r.top - o.top + Math.min(r.height / 2, 120) : r.top - o.top + r.height * 0.7
      setPos({ x, y, w: o.width })
    }
    place()
    const t = setInterval(place, 450)
    window.addEventListener('resize', place)
    return () => {
      clearInterval(t)
      window.removeEventListener('resize', place)
    }
  }, [area, hidden, type])

  return (
    <AnimatePresence>
      {!hidden && pos && (
        <motion.div
          key="hand"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, left: pos.x, top: pos.y }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ left: { duration: 0.3 }, top: { duration: 0.3 } }}
          className="pointer-events-none absolute z-30"
          style={{ left: pos.x, top: pos.y }}
          aria-hidden
        >
          <motion.span animate={{ y: [8, 0, 8], scale: [1, 0.92, 1] }} transition={{ duration: 0.9, repeat: Infinity }} className="relative block -translate-x-1/2">
            <span className="absolute -left-3 -top-3 size-8 animate-ping rounded-full bg-uap-blue/30" />
            <Pointer className="relative size-9 fill-white text-uap-blue drop-shadow-[0_2px_4px_rgba(0,0,0,.35)]" />
          </motion.span>
          <span
            className="absolute top-10 w-60 max-w-[calc(100vw-2rem)] rounded-2xl bg-uap-blue px-3 py-1.5 text-xs font-bold leading-snug text-white shadow-lg"
            style={{ left: Math.max(8, Math.min(pos.x - 40, pos.w - 248)) - pos.x }}
          >
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
