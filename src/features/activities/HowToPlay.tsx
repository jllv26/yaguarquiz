import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleHelp, Flame, Pointer, Star, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { ACTIVITY_META, type ActivityType } from './types'

/* ───────────── Guía «Cómo se juega»: pasos + un ejemplo animado de cada tipo de actividad ───────────── */

interface Guide {
  steps: string[]
  tips?: string[]
  /** leyenda de cada fotograma del ejemplo animado */
  captions: string[]
  Demo: (p: { s: number }) => ReactNode
}

/** Avanza un fotograma cada `ms` y vuelve a empezar. */
function useLoop(n: number, ms = 1500) {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setS((x) => (x + 1) % n), ms)
    return () => clearInterval(t)
  }, [n, ms])
  return s
}

/** Mano que «toca» el elemento donde se dibuja. */
function Tap({ on, className }: { on: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.span
          initial={{ opacity: 0, y: 14, x: 8 }}
          animate={{ opacity: 1, y: [6, 0, 6], x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ y: { duration: 0.7, repeat: Infinity }, opacity: { duration: 0.2 } }}
          className={cn('pointer-events-none absolute -bottom-4 right-0 z-10 text-ink drop-shadow-[0_2px_2px_rgba(255,255,255,.9)]', className)}
          aria-hidden
        >
          <Pointer className="size-7 fill-white" strokeWidth={2.2} />
        </motion.span>
      )}
    </AnimatePresence>
  )
}

const chip = 'relative rounded-xl border-2 px-2.5 py-1.5 font-display text-xs font-bold leading-tight transition-all duration-300'
const ok = 'border-uap-green bg-uap-green text-white'
const sel = 'border-uap-gold bg-uap-gold/25 shadow'
const idle = 'border-line bg-surface-2'

function Plus({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.span initial={{ opacity: 0, y: 6, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="absolute right-1 top-1 rounded-full bg-uap-green px-2 py-0.5 font-display text-xs font-black text-white">
          +1000
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/* ───────────── Ejemplos animados ───────────── */

function ClassifyDemo({ s }: { s: number }) {
  const inGroup = s >= 3
  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <Plus on={inGroup} />
      <div className="h-9">{!inGroup && <span className={cn(chip, s >= 1 ? sel : idle, 'inline-block')}>Publica el reel del día<Tap on={s === 1} /></span>}</div>
      <div className="grid w-full grid-cols-2 gap-2">
        <div className={cn('relative min-h-16 rounded-2xl border-[3px] p-1.5 text-center transition', s === 2 ? 'border-dashed border-uap-green' : 'border-uap-green/60')}>
          <p className="rounded-lg bg-uap-green px-1 py-0.5 font-display text-[11px] font-black text-white">Día a día</p>
          {inGroup && <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="mt-1 rounded-lg bg-uap-green/15 px-1 text-[11px] font-semibold text-uap-green">✓ Publica el reel…</motion.p>}
          <Tap on={s === 2} className="right-2" />
        </div>
        <div className="min-h-16 rounded-2xl border-[3px] border-uap-blue/60 p-1.5 text-center">
          <p className="rounded-lg bg-uap-blue px-1 py-0.5 font-display text-[11px] font-black text-white">Estrategia</p>
        </div>
      </div>
    </div>
  )
}

function MatchingDemo({ s }: { s: number }) {
  const done = s >= 3
  return (
    <div className="relative grid w-full grid-cols-[0.8fr_1.2fr] gap-2">
      <Plus on={done} />
      <div className="flex flex-col gap-2">
        <span className={cn(chip, done ? ok : s >= 1 ? sel : idle)}>CTR<Tap on={s === 1} /></span>
        <span className={cn(chip, idle)}>CPA</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className={cn(chip, idle, 'font-sans font-medium')}>Costo por cada cliente</span>
        <span className={cn(chip, done ? ok : idle, 'font-sans font-medium')}>
          Clics ÷ impresiones {done && <b className="ml-1 rounded bg-white/25 px-1">CTR</b>}
          <Tap on={s === 2} />
        </span>
      </div>
    </div>
  )
}

function MemoryDemo({ s }: { s: number }) {
  const cards = ['SMART', 'Específico, medible y con fecha', 'Alcance', 'Personas que lo vieron']
  const open = (i: number) => (i === 0 && s >= 1) || (i === 1 && s >= 2)
  return (
    <div className="relative grid w-full grid-cols-4 gap-1.5">
      <Plus on={s >= 3} />
      {cards.map((c, i) => (
        <div key={i} className="relative">
          <motion.div
            animate={{ rotateY: open(i) ? 0 : 180 }}
            transition={{ duration: 0.4 }}
            className={cn('grid h-20 place-items-center rounded-xl border-2 p-1 text-center text-[10px] font-bold leading-tight', open(i) ? (s >= 3 ? ok : 'border-uap-gold bg-surface-2') : 'border-[#c9a23a] bg-[repeating-radial-gradient(circle_at_30%_30%,#e0a83a_0_3px,#8a5a12_3px_5px,#e0a83a_5px_9px)]')}
          >
            {open(i) ? c : ''}
          </motion.div>
          <Tap on={(i === 0 && s === 1) || (i === 1 && s === 2)} />
        </div>
      ))}
    </div>
  )
}

function TilesDemo({ s, words }: { s: number; words: string[] }) {
  // words: en orden correcto; se muestran desordenadas y se van colocando
  const shuffled = [words[1], words[2], words[0]]
  const placed = words.slice(0, Math.min(s, 3))
  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <Plus on={s >= 4} />
      <div className="flex gap-1.5">
        {words.map((_, i) => (
          <span key={i} className={cn('grid h-9 min-w-14 place-items-center rounded-xl border-2 px-2 font-display text-xs font-bold', placed[i] ? (s >= 4 ? ok : 'border-uap-blue bg-uap-blue/10') : 'border-dashed border-ink/25')}>
            {placed[i] ?? ''}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        {shuffled.map((w) => {
          const used = placed.includes(w)
          const next = !used && words[Math.min(s, 2)] === w && s < 3
          return (
            <span key={w} className={cn(chip, used ? 'opacity-20' : 'border-uap-gold/60 bg-uap-gold/10')}>
              {w}
              <Tap on={next && s >= 0 && s < 3} />
            </span>
          )
        })}
        <span className={cn(chip, s >= 3 ? 'border-uap-green bg-uap-green text-white' : 'border-line bg-surface-2 opacity-50')}>
          ✓ Comprobar
          <Tap on={s === 3} />
        </span>
      </div>
    </div>
  )
}

function HangmanDemo({ s }: { s: number }) {
  const word = 'ROAS'
  const got = new Set<string>([...(s >= 1 ? ['R'] : []), ...(s >= 3 ? ['A'] : []), ...(s >= 4 ? ['O', 'S'] : [])])
  const keys = ['R', 'X', 'A', 'O', 'S']
  const tapKey = ['', 'R', 'X', 'A', ''][s]
  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <Plus on={s >= 4} />
      <p className="text-xs">
        🐾🐾🐾{s >= 2 ? <span className="opacity-20">🐾</span> : '🐾'} <span className="text-ink-soft">{s === 2 ? '← fallaste: pierdes una huella' : 'huellas = vidas'}</span>
      </p>
      <div className="flex gap-1.5">
        {word.split('').map((c, i) => (
          <span key={i} className={cn('grid h-9 w-8 place-items-end justify-center border-b-4 pb-0.5 font-display text-lg font-black', s >= 4 ? 'border-uap-green text-uap-green' : 'border-ink/40')}>
            {got.has(c) ? c : ''}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        {keys.map((k) => (
          <span key={k} className={cn('relative grid size-8 place-items-center rounded-lg border-2 font-display text-sm font-black', k === 'X' && s >= 2 ? 'border-uap-red bg-uap-red/15 text-uap-red' : got.has(k) ? 'border-uap-green bg-uap-green/15 text-uap-green' : 'border-line bg-surface-2')}>
            {k}
            <Tap on={tapKey === k} />
          </span>
        ))}
      </div>
    </div>
  )
}

function FillDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <Plus on={s >= 3} />
      <p className="text-center text-sm leading-8">
        Invirtió Bs 100 y consiguió 4 clientes: su CPA es Bs{' '}
        <span className={cn('relative mx-1 inline-block w-14 rounded-lg border-2 text-center font-display font-bold', s >= 3 ? 'border-uap-green bg-uap-green/15 text-uap-green' : s >= 1 ? 'border-uap-gold bg-uap-gold/15' : 'border-dashed border-ink/30')}>
          {s >= 2 ? '25' : ' '}
          <Tap on={s === 1} />
        </span>
        .
      </p>
      <span className={cn(chip, s >= 3 ? ok : 'border-uap-green/50 bg-surface-2')}>
        ✓ Comprobar <Tap on={s === 2} />
      </span>
    </div>
  )
}

function CrosswordDemo({ s }: { s: number }) {
  const word = 'TITULAR'
  const n = [0, 0, 3, 7, 7][s]
  return (
    <div className="relative flex w-full flex-col items-center gap-2">
      <Plus on={s >= 4} />
      <p className={cn('relative rounded-xl px-2 py-1 text-center text-xs', s >= 1 ? 'bg-uap-blue text-white' : 'bg-ink/5')}>
        <b>1 Horizontal (7 letras):</b> primera línea del anuncio
        <Tap on={s === 1} />
      </p>
      <div className="flex gap-0.5">
        {word.split('').map((c, i) => (
          <span key={i} className={cn('grid size-7 place-items-center rounded border-2 font-display text-sm font-black', s >= 4 ? 'border-uap-green bg-uap-green/15 text-uap-green' : s >= 1 ? 'border-uap-gold bg-uap-gold/10' : 'border-line bg-surface-2')}>
            {i < n ? c : ''}
          </span>
        ))}
      </div>
      <span className={cn(chip, s >= 4 ? ok : 'border-uap-gold/60 bg-uap-gold/10')}>
        Comprobar <Tap on={s === 3} />
      </span>
    </div>
  )
}

function WordsearchDemo({ s }: { s: number }) {
  const grid = ['QMUE', 'LEAD', 'XOPR']
  const hi = (r: number, c: number) => r === 1 && ((s === 1 && c === 0) || (s >= 2 && c <= (s === 2 ? 3 : 3)))
  return (
    <div className="relative flex w-full items-center justify-center gap-4">
      <Plus on={s >= 3} />
      <div className="relative grid grid-cols-4 gap-1">
        {grid.flatMap((row, r) =>
          row.split('').map((ch, c) => (
            <span key={`${r}${c}`} className={cn('relative grid size-8 place-items-center rounded-lg font-display text-sm font-black', hi(r, c) ? (s >= 3 ? 'bg-uap-green text-white' : 'bg-uap-gold/60') : 'bg-ink/5')}>
              {ch}
              {r === 1 && c === 0 && <Tap on={s === 1} />}
              {r === 1 && c === 3 && <Tap on={s === 2} />}
            </span>
          )),
        )}
      </div>
      <div className="max-w-32 text-[11px]">
        <p className={cn('rounded-lg px-2 py-1', s >= 3 ? 'bg-uap-green/15 font-bold text-uap-green line-through' : 'bg-ink/5')}>Persona interesada que deja sus datos (4)</p>
        {s >= 3 && <p className="mt-1 font-display font-black text-uap-green">LEAD ✓</p>}
      </div>
    </div>
  )
}

function RoscoDemo({ s }: { s: number }) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const color = (l: string) => (l === 'A' && s >= 3 ? 'bg-uap-green' : l === 'B' && s >= 4 ? 'bg-uap-gold' : (l === 'A' && s < 3) || (l === 'B' && s >= 3 && s < 4) ? 'bg-uap-blue ring-4 ring-uap-gold' : 'bg-uap-blue')
  const cur = s >= 3 ? 'B' : 'A'
  return (
    <div className="relative flex w-full items-center justify-center gap-3">
      <Plus on={s === 3} />
      <div className="relative size-28 shrink-0">
        {letters.map((l, i) => {
          const a = (i / letters.length) * 2 * Math.PI - Math.PI / 2
          return (
            <span key={l} className={cn('absolute grid size-7 place-items-center rounded-full font-display text-xs font-black text-white transition-colors', color(l))} style={{ left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%`, transform: 'translate(-50%,-50%)' }}>
              {l}
            </span>
          )
        })}
        <span className="absolute inset-0 grid place-items-center font-display text-3xl font-black text-uap-gold">{cur}</span>
      </div>
      <div className="flex max-w-40 flex-col gap-1.5 text-[11px]">
        <p>
          <b>Empieza por {cur}:</b> {cur === 'A' ? 'fórmula de copy (4)' : 'tipo de correo que…'}
        </p>
        <span className="relative rounded-lg border-2 border-uap-gold bg-surface-2 px-2 py-1 font-display font-bold">{s >= 1 && s < 3 ? 'aida' : ' '}</span>
        <div className="flex gap-1">
          <span className="relative rounded-lg bg-uap-green px-2 py-1 font-bold text-white">
            Responder <Tap on={s === 2} />
          </span>
          <span className="relative rounded-lg border-2 border-line bg-surface-2 px-2 py-1 font-bold">
            Pasapalabra <Tap on={s === 4} />
          </span>
        </div>
      </div>
    </div>
  )
}

function ResearchDemo({ s }: { s: number }) {
  const text = ['', 'Elegí la Pastelería Dulce Amazonía…', 'Elegí la Pastelería Dulce Amazonía. Tiene 2.300 seguidores en Facebook y publicó 9 veces…', 'Elegí la Pastelería Dulce Amazonía. Tiene 2.300 seguidores en Facebook y publicó 9 veces…'][s]
  return (
    <div className="relative flex w-full flex-col gap-2">
      <p className="rounded-xl border-2 border-uap-red/30 bg-uap-red/5 px-2 py-1 text-[11px]">
        <b>Tu caso:</b> Pastelería · cada compañero tiene otro rubro
      </p>
      <div className="min-h-14 rounded-xl border-2 border-line bg-surface-2 px-2 py-1 text-[11px]">{text}</div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn('font-semibold', s >= 2 ? 'text-uap-green' : 'text-ink-soft')}>{s >= 2 ? '✓ Guardado solo' : 'Escribe con tus palabras…'}</span>
        <span className={cn('relative rounded-lg px-2 py-1 font-bold', s >= 3 ? 'bg-uap-gold text-ink' : 'bg-ink/10')}>
          Entregar <Tap on={s === 3} />
        </span>
      </div>
    </div>
  )
}

function DictationDemo({ s }: { s: number }) {
  const typed = ['', '', 'Castana', 'Castana', 'Castaña', 'Castaña'][s]
  return (
    <div className="relative flex w-full flex-col items-center gap-2">
      <Plus on={s >= 5} />
      <div className="flex items-center gap-2">
        <motion.span
          animate={s === 1 ? { scale: [1, 1.12, 1] } : {}}
          transition={{ repeat: s === 1 ? Infinity : 0, duration: 0.6 }}
          className="relative grid size-14 place-items-center rounded-full bg-[#0e7490] text-2xl text-white"
        >
          🔊
          <Tap on={s === 0} />
        </motion.span>
        <span className="text-xs font-bold text-[#0e7490]">{s === 1 ? '«Castaña»…' : s >= 2 ? '🐢 puedes repetir' : 'Escuchar'}</span>
      </div>
      <span className={cn('min-w-36 rounded-xl border-2 px-3 py-1.5 text-center font-display text-base font-bold', s >= 5 ? 'border-uap-green bg-uap-green/15 text-uap-green' : s === 3 ? 'border-uap-red bg-uap-red/10' : 'border-uap-gold/60 bg-surface')}>
        {typed || ' '}
      </span>
      {s === 3 ? (
        <span className="rounded-lg bg-uap-gold/25 px-2 py-0.5 text-[11px] font-bold text-[#8a6416]">¡Casi! Revisa las tildes y la ñ</span>
      ) : (
        <span className={cn(chip, s >= 5 ? ok : 'border-uap-green/50 bg-surface-2')}>
          ✓ Comprobar <Tap on={s === 2 || s === 4} />
        </span>
      )}
    </div>
  )
}

function McDemoOpts({ s, opts, good, at }: { s: number; opts: string[]; good: number; at: number }) {
  return (
    <div className="grid w-full grid-cols-3 gap-1.5">
      {opts.map((o, i) => (
        <span key={o} className={cn(chip, 'text-center', i === good && s >= at + 1 ? ok : idle)}>
          {o}
          <Tap on={i === good && s === at} />
        </span>
      ))}
    </div>
  )
}

function FroggyDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-2">
      <Plus on={s >= 2} />
      <p className="text-center text-xs font-bold">¿Qué mide los clics ÷ impresiones?</p>
      <div className="w-full rounded-2xl bg-[#339af0] p-2">
        <McDemoOpts s={s} opts={['CPA', 'CTR', 'ROAS']} good={1} at={1} />
        <motion.p animate={{ y: s >= 2 ? -36 : 0, x: s >= 2 ? 0 : 0 }} className="mt-2 text-center text-2xl" aria-hidden>
          🐸
        </motion.p>
      </div>
    </div>
  )
}

function AsterDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-2 rounded-2xl bg-[#1c1f4a] p-2 text-white">
      <Plus on={s >= 2} />
      <p className="text-center text-xs font-bold">Personas distintas que vieron la publicación</p>
      <div className="flex gap-2">
        {['Alcance', 'Impresiones', 'Lead'].map((o, i) => (
          <span key={o} className={cn('relative rounded-[42%_58%_63%_37%/41%_44%_56%_59%] px-2 py-2 text-[11px] font-black', i === 0 && s >= 2 ? 'bg-uap-green' : 'bg-[#6b5a4a]')}>
            {i === 0 && s >= 2 ? '💥' : o}
            <Tap on={i === 0 && s === 1} />
          </span>
        ))}
      </div>
      <span className="-rotate-45 text-2xl" aria-hidden>
        🚀
      </span>
    </div>
  )
}

function PuzzleDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full items-center gap-3">
      <Plus on={s >= 2} />
      <div className="grid size-20 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-xl">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('grid place-items-center text-xs font-black text-white', i === 0 && s >= 2 ? 'bg-[linear-gradient(135deg,#1B7339,#C9A23A)]' : 'bg-[#ae3ec9]')}>
            {i === 0 && s >= 2 ? '🐆' : i + 1}
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1 text-[11px]">
        <b>Pieza 1: ¿Qué es un lead?</b>
        <span className={cn(chip, idle)}>Un anuncio</span>
        <span className={cn(chip, s >= 2 ? ok : idle)}>
          Persona que deja sus datos <Tap on={s === 1} />
        </span>
      </div>
    </div>
  )
}

function VideoDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col gap-2">
      <Plus on={s >= 3} />
      <div className="relative grid h-16 place-items-center rounded-xl bg-black text-white">
        <span className="text-2xl">{s === 0 ? '▶️' : s >= 3 ? '▶️' : '⏸'}</span>
        {s >= 1 && s < 3 && <span className="absolute bottom-1 rounded-full bg-uap-gold px-2 text-[10px] font-black text-ink">¡Pregunta!</span>}
        <Tap on={s === 0} />
      </div>
      <div className="h-1.5 rounded-full bg-ink/10">
        <motion.div className="h-full rounded-full bg-[#c92a2a]" animate={{ width: ['10%', '45%', '45%', '45%', '80%'][s] }} />
      </div>
      {s >= 1 && <McDemoOpts s={s} opts={['A', 'B', 'C']} good={2} at={2} />}
    </div>
  )
}

function DialogueDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col gap-1.5 text-[11px]">
      <Plus on={s >= 3} />
      <span className={cn('max-w-[80%] rounded-xl bg-surface px-2 py-1 shadow', s === 0 && 'ring-2 ring-uap-gold')}>
        <b className="text-[#1971c2]">Cliente:</b> ¿Hacen envíos a Porvenir?
      </span>
      <span className={cn('max-w-[80%] self-end rounded-xl bg-[#d3f9d8] px-2 py-1 shadow', s === 1 && 'ring-2 ring-uap-gold')}>
        <b className="text-[#c2255c]">Tienda:</b> Sí, los martes, gratis desde Bs 100.
      </span>
      {s >= 2 && (
        <div className="flex gap-1">
          <span className={cn(chip, idle)}>Lunes</span>
          <span className={cn(chip, s >= 3 ? ok : idle)}>
            Martes <Tap on={s === 2} />
          </span>
        </div>
      )}
    </div>
  )
}

function YesNoDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-2">
      <Plus on={s >= 3} />
      <span className="rounded-lg bg-[#e8590c] px-2 py-0.5 text-[11px] font-black text-white">¿Es un objetivo SMART?</span>
      <motion.span animate={{ x: s >= 2 ? 120 : 0, rotate: s >= 2 ? 15 : 0, opacity: s >= 2 ? 0 : 1 }} className="rounded-2xl bg-surface px-3 py-3 text-center text-xs font-black shadow-lg ring-1 ring-line">
        Lograr 200 seguidores nuevos en marzo
      </motion.span>
      <div className="flex gap-2">
        <span className="rounded-xl bg-uap-red px-3 py-1 text-xs font-black text-white">✗ No</span>
        <span className="relative rounded-xl bg-uap-green px-3 py-1 text-xs font-black text-white">
          ✓ Sí <Tap on={s === 1} />
        </span>
      </div>
    </div>
  )
}

function RowsDemo({ s }: { s: number }) {
  const order = s >= 2 ? ['Atención', 'Interés', 'Deseo', 'Acción'] : ['Interés', 'Atención', 'Deseo', 'Acción']
  return (
    <div className="relative flex w-full flex-col gap-1">
      <Plus on={s >= 3} />
      <b className="text-center text-[11px]">Método AIDA</b>
      {order.map((o, i) => (
        <motion.span layout key={o} className={cn('relative flex items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-[11px] font-bold', s >= 3 ? 'border-uap-green bg-uap-green/10' : 'border-[#5c7cfa]/40 bg-surface')}>
          ⠿ {i + 1}. {o}
          <Tap on={s === 1 && o === 'Atención'} />
        </motion.span>
      ))}
    </div>
  )
}

function RiddleDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col gap-1.5 text-[11px]">
      <Plus on={s >= 3} />
      <span className="rounded-lg bg-[#fff4e6] px-2 py-1 font-semibold text-ink">1. Tiene tres letras</span>
      {s >= 1 && <span className="rounded-lg bg-[#fff4e6] px-2 py-1 font-semibold text-ink">2. Aparecer en Google sin pagar</span>}
      <span className="relative self-center rounded-lg border-2 border-[#f08c00]/50 bg-surface px-2 py-1 text-[10px] font-bold">
        💡 Otra pista (−20 %) <Tap on={s === 0} />
      </span>
      <span className={cn('self-center rounded-lg border-2 px-3 py-1 font-display text-sm font-black', s >= 3 ? 'border-uap-green bg-uap-green/15 text-uap-green' : 'border-line')}>{s >= 2 ? 'SEO' : ' '}</span>
    </div>
  )
}

function MapDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col gap-1.5">
      <Plus on={s >= 2} />
      <span className="rounded-lg bg-[#0b7285] px-2 py-0.5 text-center text-[11px] font-black text-white">Toca: «Botón de compra»</span>
      <div className="relative h-20 rounded-xl bg-[linear-gradient(#f1f3f5,#dee2e6)] ring-1 ring-line">
        <span className="absolute left-[18%] top-[25%] grid size-6 place-items-center rounded-full border-2 border-white bg-[#0b7285] text-[10px] font-black text-white">?</span>
        <span className={cn('absolute left-[65%] top-[60%] grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-black text-white', s >= 2 ? 'bg-uap-green' : 'bg-[#0b7285]')}>
          {s >= 2 ? '✓' : '?'}
          <Tap on={s === 1} />
        </span>
      </div>
    </div>
  )
}

function SlidesDemo({ s }: { s: number }) {
  return (
    <div className="relative flex w-full flex-col gap-2">
      <motion.div key={s} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="rounded-xl bg-surface p-2 shadow ring-1 ring-line">
        <b className="text-xs text-uap-blue">{['¿Qué es el embudo?', 'Etapa 1: atraer', 'Etapa 2: convertir'][s % 3]}</b>
        <p className="text-[10px] text-ink-soft">• Lee con calma cada diapositiva…</p>
      </motion.div>
      <div className="flex items-center justify-between">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('h-1.5 rounded-full', i === s % 3 ? 'w-4 bg-uap-gold' : i < s % 3 ? 'w-1.5 bg-uap-green' : 'w-1.5 bg-ink/20')} />
          ))}
        </span>
        <span className="relative rounded-lg bg-uap-blue px-2 py-0.5 text-[10px] font-bold text-white">
          Siguiente ▸ <Tap on />
        </span>
      </div>
    </div>
  )
}

const tilesSentence = ({ s }: { s: number }) => <TilesDemo s={s} words={['La', 'estrategia', 'es el qué']} />
const tilesAnagram = ({ s }: { s: number }) => <TilesDemo s={s} words={['C', 'T', 'R']} />

const COMMON_TIPS = ['Si te equivocas, pierdes un intento y esa respuesta vale menos: piensa antes de tocar.']

export const GUIDES: Record<ActivityType, Guide> = {
  classify: {
    steps: ['Toca una tarjeta de la caja de arriba.', 'Se abre una ventana: toca el grupo al que pertenece.', 'Si acertaste, se queda en el grupo; si no, vuelve a la caja para que lo intentes otra vez.'],
    captions: ['Mira el elemento', '1. Tócalo', '2. Toca su grupo', '¡Correcto! Suma puntos'],
    Demo: ClassifyDemo,
  },
  matching: {
    steps: ['Toca un concepto de la columna izquierda.', 'Se abre una ventana: toca su definición.', 'Las parejas correctas se pintan del mismo color.'],
    captions: ['Dos columnas', '1. Toca el concepto', '2. Toca su definición', '¡Pareja correcta!'],
    Demo: MatchingDemo,
  },
  memory: {
    steps: ['Toca una carta para voltearla.', 'Toca otra: si el concepto y su ejemplo van juntos, quedan descubiertas.', 'Si no, se vuelven a tapar: recuerda dónde estaba cada una.'],
    captions: ['Cartas tapadas', '1. Voltea una carta', '2. Voltea su pareja', '¡Pareja! Se quedan abiertas'],
    Demo: MemoryDemo,
  },
  sentence: {
    steps: ['Lee la pista: dice qué idea debes formar.', 'Toca las palabras en el orden correcto (si te equivocas, toca «Borrar»).', 'Toca «Comprobar» y pasa a la siguiente frase con los números o «Siguiente».'],
    captions: ['Palabras desordenadas', '1. Toca la primera', '2. Toca la siguiente', '3. Completa y comprueba', '¡Frase correcta!'],
    Demo: tilesSentence,
  },
  anagram: {
    steps: ['Lee la pista.', 'Toca las letras en orden para formar la palabra.', 'Toca «Comprobar».'],
    captions: ['Letras desordenadas', '1. Toca la primera letra', '2. La siguiente', '3. Comprueba', '¡Palabra correcta!'],
    Demo: tilesAnagram,
  },
  hangman: {
    steps: ['Lee la pista y cuenta las letras (las rayitas).', 'Toca una letra del teclado: si está en la palabra, aparece.', 'Cada letra equivocada quita una huella 🐾; si se acaban, pierdes esa palabra.'],
    captions: ['Lee la pista', '1. Toca una letra', '¡Ojo! Esa no estaba', '2. Sigue probando', '¡Palabra completa!'],
    Demo: HangmanDemo,
  },
  fill_text: {
    steps: ['Lee el texto y haz el cálculo (puedes usar la calculadora).', 'Toca el espacio: escribe solo el número o la palabra (o elígela en la ventana, si hay banco de palabras).', 'Toca «Comprobar»: verde es correcto; rojo, vuelve a intentar.'],
    captions: ['Lee el problema', '1. Toca el espacio', '2. Escribe y comprueba', '¡Correcto!'],
    Demo: FillDemo,
  },
  crossword: {
    steps: ['Toca una pista (o una casilla) para elegir la palabra.', 'Escribe la palabra con el teclado de tu celular.', 'Toca «Comprobar». Las palabras que se cruzan comparten letras: ¡úsalas de ayuda!'],
    captions: ['Mira el crucigrama', '1. Toca la pista', '2. Escribe la palabra', '3. Comprueba', '¡Palabra correcta!'],
    Demo: CrosswordDemo,
  },
  wordsearch: {
    steps: ['Lee la definición y piensa qué palabra es.', 'Búscala en la sopa: arrastra el dedo de la primera a la última letra (o tócalas una tras otra).', 'Puede estar en horizontal, vertical, diagonal o al revés.'],
    captions: ['Lee la definición', '1. Toca la primera letra', '2. Arrastra hasta la última', '¡Encontrada!'],
    Demo: WordsearchDemo,
  },
  rosco: {
    steps: ['Lee la pista de la letra marcada («empieza por» o «contiene»).', 'Escribe la palabra y toca «Responder».', 'Si no sabes, toca «Pasapalabra»: vuelve al final de la vuelta.'],
    captions: ['Letra A', '1. Escribe la respuesta', '2. Toca Responder', '¡Correcta! Pasa a la B', 'Si no sabes: Pasapalabra'],
    Demo: RoscoDemo,
  },
  dictation: {
    steps: ['Toca 🔊 «Escuchar». Puedes repetir las veces que quieras o usar 🐢 «Lento».', 'Escribe lo que oyes (o el término de la definición que escuchas). Las tildes y la ñ cuentan.', 'Toca «Comprobar». Si dice «¡Casi!», las letras están bien pero falta una tilde.'],
    captions: ['1. Toca Escuchar', 'Escucha con atención', '2. Escribe y comprueba', '¡Casi! Falta la ñ', '3. Corrige y comprueba', '¡Correcto!'],
    Demo: DictationDemo,
  },
  froggy: {
    steps: ['Lee la pregunta de arriba.', 'Toca la respuesta correcta (A, B, C…): la rana salta a esa hoja.', 'Si aciertas, pasa a la siguiente pregunta; si fallas, cae al agua 💦.'],
    captions: ['Lee la pregunta', '1. Toca la hoja correcta', '¡Saltó y cruzó!'],
    Demo: FroggyDemo,
  },
  asterquiz: {
    steps: ['Lee la pregunta antes de que se acabe el tiempo.', 'Toca el asteroide con la respuesta correcta: tu nave le dispara.', 'Si se acaba el tiempo, esa pregunta cuenta como no respondida.'],
    captions: ['Lee la pregunta', '1. Toca el asteroide', '¡Destruido! +puntos'],
    Demo: AsterDemo,
  },
  puzzle: {
    steps: ['Cada pieza tapada esconde una pregunta: toca una pieza (o sigue en orden).', 'Elige la respuesta correcta.', 'Si aciertas, la pieza se descubre; al final verás la imagen completa.'],
    captions: ['Piezas tapadas', '1. Elige la respuesta', '¡Pieza descubierta!'],
    Demo: PuzzleDemo,
  },
  video: {
    steps: ['Dale play al video.', 'El video se detiene solo cuando llega una pregunta: respóndela abajo.', 'Toca «Seguir viendo» y espera la siguiente. Arriba ves dónde están las preguntas.'],
    captions: ['1. Dale play', 'Se detiene: ¡pregunta!', '2. Responde', '¡Correcto! Sigue el video'],
    Demo: VideoDemo,
  },
  dialogue: {
    steps: ['Toca «Escuchar»: los personajes hablan con voces distintas (puedes repetir cada línea con 🔊).', 'Lee o escucha con atención los datos (días, precios, nombres).', 'Responde las preguntas sobre lo que dijeron.'],
    captions: ['Escucha al cliente', 'Escucha a la tienda', '1. Responde', '¡Correcto!'],
    Demo: DialogueDemo,
  },
  yesno: {
    steps: ['Lee la pregunta naranja: vale para todas las tarjetas.', 'Decide si la tarjeta cumple: desliza a la derecha (Sí) o a la izquierda (No), o toca los botones.', 'Sigue con la próxima tarjeta: ¡rápido pero pensando!'],
    captions: ['Lee la tarjeta', '1. Toca Sí o No', 'Sale volando…', '¡Correcto!'],
    Demo: YesNoDemo,
  },
  rows: {
    steps: ['Lee el título de la fila.', 'Ordena los elementos: arrastra desde ⠿ o usa las flechas ▲▼. El 1 va primero.', 'Toca «Comprobar».'],
    captions: ['Están desordenados', '1. Mueve el que va primero', '2. Revisa el orden', '¡Orden correcto!'],
    Demo: RowsDemo,
  },
  riddle: {
    steps: ['Lee la primera pista y mira cuántas letras tiene la respuesta.', 'Si no sabes, pide otra pista: cada pista extra resta 20 %.', 'Escribe tu respuesta y toca «Comprobar».'],
    captions: ['Primera pista', '1. Pide otra pista', '2. Escribe la respuesta', '¡Adivinaste!'],
    Demo: RiddleDemo,
  },
  map: {
    steps: ['Arriba dice qué parte buscar y una pista (con «Buscar otro» puedes cambiarla).', 'Toca esa parte sobre la imagen.', 'Las partes acertadas quedan en verde con su nombre.'],
    captions: ['Lee qué buscar', '1. Toca el punto', '¡Correcto!'],
    Demo: MapDemo,
  },
  slides: {
    steps: ['Lee cada diapositiva con calma.', 'Pasa con «Siguiente», con las flechas o deslizando.', 'Cuando veas todas, toca «Terminé la presentación».'],
    tips: ['Tu nota es el porcentaje de diapositivas que viste.'],
    captions: ['Diapositiva 1', 'Diapositiva 2', 'Diapositiva 3'],
    Demo: SlidesDemo,
  },
  research: {
    steps: ['Lee tu caso: a cada compañero le tocó uno distinto.', 'Investiga un negocio real y responde cada pregunta con tus palabras (no se puede pegar texto).', 'Tus respuestas se guardan solas. Cuando termines, toca «Entregar mi investigación».'],
    tips: ['Tu docente te califica con los criterios que ves arriba de las preguntas: Cumple · A medias · No cumple.'],
    captions: ['Lee tu caso', '1. Escribe con tus palabras', '2. Se guarda solo', '3. Entrega'],
    Demo: ResearchDemo,
  },
}

/** Ejemplo animado con su leyenda. */
export function GuideDemo({ type }: { type: ActivityType }) {
  const g = GUIDES[type]
  const s = useLoop(g.captions.length)
  const Demo = g.Demo
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-dashed border-uap-gold/60 bg-surface-2 p-3">
      <p className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-[#8a6416] dark:text-uap-gold">
        <span>▶ Ejemplo</span>
        <span className="flex gap-1">
          {g.captions.map((_, i) => (
            <span key={i} className={cn('size-1.5 rounded-full', i === s ? 'bg-uap-gold' : 'bg-ink/15')} />
          ))}
        </span>
      </p>
      <div className="flex min-h-32 items-center justify-center px-1 pb-3 pt-1">
        <Demo s={s} />
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={s} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center font-display text-sm font-black">
          {g.captions[s]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

/** Guía completa: pasos numerados, ejemplo animado y cómo ganar puntos. */
export function HowToPlay({ type, compact }: { type: ActivityType; compact?: boolean }) {
  const g = GUIDES[type]
  const meta = ACTIVITY_META[type]
  const research = type === 'research' || type === 'slides'
  return (
    <div className="flex flex-col gap-3 text-left">
      {!compact && (
        <p className="flex items-center gap-2 font-display text-lg font-black">
          <span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: meta.color }}>
            <meta.icon className="size-5" />
          </span>
          ¿Cómo se juega {['froggy', 'asterquiz', 'video', 'puzzle', 'yesno'].includes(type) ? meta.label : meta.label.toLowerCase()}?
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-center">
        <ol className="flex flex-col gap-2">
          {g.steps.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-uap-blue font-display text-xs font-black text-white">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <GuideDemo type={type} />
      </div>
      <ul className="flex flex-col gap-1 rounded-2xl bg-uap-green/5 px-3 py-2 text-xs">
        {research ? (
          (g.tips ?? []).map((t) => (
            <li key={t} className="flex gap-1.5">
              <Check className="size-4 shrink-0 text-uap-green" /> <span>{t}</span>
            </li>
          ))
        ) : (
          <>
            <li className="flex gap-1.5">
              <Check className="size-4 shrink-0 text-uap-green" />
              <span>
                Cada acierto suma hasta <b>1000 puntos</b>.
              </span>
            </li>
            {[...COMMON_TIPS, ...(g.tips ?? [])].map((t) => (
              <li key={t} className="flex gap-1.5">
                <X className="size-4 shrink-0 text-uap-red" /> <span>{t}</span>
              </li>
            ))}
            <li className="flex gap-1.5">
              <Flame className="size-4 shrink-0 text-[#e8590c]" />
              <span>
                Acierta seguido para mantener tu <b>racha</b> 🔥.
              </span>
            </li>
            <li className="flex gap-1.5">
              <Star className="size-4 shrink-0 fill-uap-gold text-uap-gold" />
              <span>
                Junta <b>3 estrellas</b>: ★ al 50 %, ★★ al 75 % y ★★★ al 90 % de los puntos.
              </span>
            </li>
          </>
        )}
      </ul>
    </div>
  )
}

/** Guía corta para la pantalla de inicio: 3 pasos claros; el ejemplo y los puntos solo si los pide. */
export function QuickGuide({ type }: { type: ActivityType }) {
  const g = GUIDES[type]
  const meta = ACTIVITY_META[type]
  const [more, setMore] = useState<'demo' | 'points' | null>(null)
  const research = type === 'research' || type === 'slides'
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="flex items-center gap-2 font-display text-lg font-black">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: meta.color }}>
          <meta.icon className="size-5" />
        </span>
        Así se juega
      </p>
      <ol className="flex flex-col gap-2">
        {g.steps.map((t, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-uap-blue font-display text-sm font-black text-white">{i + 1}</span>
            <span className="pt-0.5 font-semibold">{t}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMore((m) => (m === 'demo' ? null : 'demo'))}
          aria-expanded={more === 'demo'}
          className="flex items-center gap-1.5 rounded-full bg-uap-blue/10 px-3 py-1.5 text-sm font-bold text-uap-blue hover:bg-uap-blue/20 dark:text-[#8db4ff]"
        >
          ▶ {more === 'demo' ? 'Ocultar ejemplo' : 'Ver un ejemplo animado'}
        </button>
        {!research && (
          <button
            type="button"
            onClick={() => setMore((m) => (m === 'points' ? null : 'points'))}
            aria-expanded={more === 'points'}
            className="flex items-center gap-1.5 rounded-full bg-uap-gold/15 px-3 py-1.5 text-sm font-bold text-[#8a6416] hover:bg-uap-gold/25 dark:text-uap-gold"
          >
            <Star className="size-4" /> {more === 'points' ? 'Ocultar' : 'Cómo se gana puntos'}
          </button>
        )}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {more === 'demo' && (
          <motion.div key="demo" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="mb-1 text-center text-xs font-bold text-ink-soft">Esto es solo un ejemplo: el juego empieza cuando toques el botón verde.</p>
            <GuideDemo type={type} />
          </motion.div>
        )}
        {more === 'points' && (
          <motion.ul key="points" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-col gap-1 overflow-hidden rounded-2xl bg-uap-green/5 px-3 py-2 text-sm">
            <li className="flex gap-1.5">
              <Check className="size-4 shrink-0 text-uap-green" /> <span>Cada acierto suma hasta <b>1000 puntos</b>.</span>
            </li>
            {[...COMMON_TIPS, ...(g.tips ?? [])].map((t) => (
              <li key={t} className="flex gap-1.5">
                <X className="size-4 shrink-0 text-uap-red" /> <span>{t}</span>
              </li>
            ))}
            <li className="flex gap-1.5">
              <Star className="size-4 shrink-0 fill-uap-gold text-uap-gold" /> <span>3 estrellas: ★ al 50 %, ★★ al 75 % y ★★★ al 90 % de los puntos.</span>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Botón «?» que abre la guía durante el juego. */
export function HowToPlayButton({ type, className }: { type: ActivityType; className?: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('flex items-center gap-1 rounded-xl bg-uap-blue/10 px-2.5 py-1.5 text-xs font-bold text-uap-blue hover:bg-uap-blue/20 dark:text-[#8db4ff]', className)}>
        <CircleHelp className="size-4" /> <span className="sm:hidden">Ayuda</span>
        <span className="hidden sm:inline">¿Cómo se juega?</span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Cómo se juega">
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl sm:rounded-3xl sm:p-6"
            >
              <HowToPlay type={type} />
              <button type="button" onClick={() => setOpen(false)} className="mt-4 w-full rounded-2xl bg-uap-green py-3 font-display text-lg font-black text-white">
                ¡Entendido, a jugar!
              </button>
            </motion.div>
          </div>,
          document.body,
        )}
    </>
  )
}
