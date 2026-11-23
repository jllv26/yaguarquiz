import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'

/** Texto con párrafos y viñetas («- » o «• » al inicio de la línea). */
function Rich({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l) {
      blocks.push({ list: false, lines: [] })
      continue
    }
    const li = /^[-•*]\s+/.test(l)
    const last = blocks[blocks.length - 1]
    if (last && last.list === li && last.lines.length) last.lines.push(l.replace(/^[-•*]\s+/, ''))
    else blocks.push({ list: li, lines: [l.replace(/^[-•*]\s+/, '')] })
  }
  return (
    <div className="flex flex-col gap-3 text-base leading-relaxed sm:text-lg">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i} className="flex flex-col gap-1.5">
              {b.lines.map((l, k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-uap-gold" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>{b.lines.join(' ')}</p>
          ),
        )}
    </div>
  )
}

export default function Slides() {
  const { board, progress, play } = useGame<'slides'>()
  const items = board.board.items
  const [cur, setCur] = useState(() => Math.max(0, items.findIndex((x) => !progress[x.key]?.done)))
  const [dir, setDir] = useState(1)
  const sent = useRef(new Set<string>())
  const it = items[cur]
  // cada diapositiva cuenta como vista al mostrarse
  useEffect(() => {
    if (!it || progress[it.key]?.done || sent.current.has(it.key)) return
    sent.current.add(it.key)
    const t = setTimeout(() => void play('seen', { item: it.key }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it?.key])
  const go = (d: number) => {
    const n = cur + d
    if (n < 0 || n >= items.length) return
    setDir(d)
    setCur(n)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  if (!it) return null
  const seen = items.filter((x) => progress[x.key]?.done).length
  const last = cur === items.length - 1

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.article
            key={it.key}
            custom={dir}
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -dir * 60, opacity: 0 }}
            transition={{ duration: 0.25 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info: PanInfo) => (info.offset.x < -80 ? go(1) : info.offset.x > 80 ? go(-1) : undefined)}
            className="flex min-h-[22rem] touch-pan-y flex-col gap-4 rounded-3xl bg-surface p-5 shadow-lg ring-1 ring-line sm:p-8"
          >
            <p className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Diapositiva {cur + 1} de {items.length}
            </p>
            <h2 className="font-display text-2xl font-black leading-tight text-uap-blue sm:text-3xl dark:text-white">{it.title}</h2>
            <div className={cn('grid gap-4', it.image_url && 'md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start')}>
              <Rich text={it.text} />
              {it.image_url && <img src={it.image_url} alt="" className="w-full rounded-2xl bg-white object-contain" />}
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => go(-1)} disabled={cur === 0}>
          <ChevronLeft className="size-4" /> Anterior
        </Button>
        <div className="flex flex-wrap justify-center gap-1.5" aria-label="Diapositivas">
          {items.map((x, i) => (
            <button
              key={x.key}
              onClick={() => (setDir(i > cur ? 1 : -1), setCur(i))}
              aria-label={`Diapositiva ${i + 1}${progress[x.key]?.done ? ', vista' : ''}`}
              className={cn('h-2.5 rounded-full transition-all', i === cur ? 'w-7 bg-uap-gold' : progress[x.key]?.done ? 'w-2.5 bg-uap-green' : 'w-2.5 bg-ink/20')}
            />
          ))}
        </div>
        <Button size="sm" variant={last ? 'ghost' : 'primary'} onClick={() => go(1)} disabled={last}>
          Siguiente <ChevronRight className="size-4" />
        </Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-ink-soft">
        {seen >= items.length ? (
          <>
            <CheckCircle2 className="size-4 text-uap-green" /> Viste todas las diapositivas. Toca «Terminé la presentación» para entregarla.
          </>
        ) : (
          `Vistas: ${seen} de ${items.length} · desliza o usa las flechas`
        )}
      </p>
    </div>
  )
}
