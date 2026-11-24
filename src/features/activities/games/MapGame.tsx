import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'
import { ChoiceSheet } from './ChoiceSheet'
import { triesLeft } from './common'

export default function MapGame() {
  const { board, progress, play, busy } = useGame<'map'>()
  const { image_url, mode, points, names } = board.board
  const tap = mode === 'tap'
  // modo «tocar»: el estudiante elige un nombre y toca su punto · modo «escribir»: toca un punto y escribe su nombre
  const targets = tap ? (names ?? []) : points.map((pt, i) => ({ key: pt.key, text: `Punto ${i + 1}`, desc: null as string | null }))
  const firstOpen = targets.find((t) => !progress[t.key]?.done)?.key ?? null
  const [target, setTarget] = useState<string | null>(firstOpen)
  const [val, setVal] = useState('')
  const [flash, setFlash] = useState<{ key: string; ok: boolean } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  useEffect(() => {
    if (target && progress[target]?.done) setTarget(targets.find((t) => !progress[t.key]?.done)?.key ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress])
  useEffect(() => {
    setVal('')
    setMsg(null)
  }, [target])

  // qué punto quedó resuelto y con qué nombre
  const pinInfo = (pk: string): { label: string; ok: boolean } | null => {
    if (tap) {
      for (const nm of names ?? []) {
        const q = progress[nm.key]
        if (q?.done && (q.answer ?? (q.correct ? q.value : null)) === pk) return { label: nm.text, ok: !!q.correct }
      }
      return null
    }
    const q = progress[pk]
    return q?.done ? { label: String((q.correct ? q.value : q.answer) ?? '✗'), ok: !!q.correct } : null
  }

  async function tapPin(pk: string) {
    if (busy) return
    if (!tap) {
      if (!progress[pk]?.done) {
        setTarget(pk)
        setSheet(true)
      }
      return
    }
    if (!target || progress[target]?.done || pinInfo(pk)) return
    const r = await play('answer', { item: target, value: pk })
    if (!r?.ok) return
    setFlash({ key: pk, ok: !!r.correct })
    setTimeout(() => setFlash(null), 800)
    setMsg(r.correct ? null : r.done ? 'No era ese punto.' : `No es ese punto. ${triesLeft(board.tries, r.tries)}`)
  }
  async function write() {
    if (busy || !target || !val.trim()) return
    const r = await play('answer', { item: target, value: val.trim() })
    if (!r?.ok) return
    setFlash({ key: target, ok: !!r.correct })
    setTimeout(() => setFlash(null), 800)
    if (!r.correct) setMsg(r.done ? 'No era ese nombre.' : triesLeft(board.tries, r.tries))
    else setMsg(null)
    setVal('')
    if (r.done) setSheet(false)
  }
  const tgt = targets.find((t) => t.key === target)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      {tap ? (
        <ChoiceSheet
          open={sheet}
          title="¿Qué quieres buscar en la imagen?"
          hint="Elige qué parte buscar; después tócala sobre la imagen."
          choices={(names ?? []).filter((nm) => !progress[nm.key]?.done).map((nm) => ({ key: nm.key, label: nm.text }))}
          cols={2}
          onChoose={(k) => {
            setTarget(k)
            setSheet(false)
          }}
          onClose={() => setSheet(false)}
        />
      ) : (
        <ChoiceSheet open={sheet && !!tgt} title={`¿Qué es el ${tgt?.text.toLowerCase() ?? 'punto'}?`} hint="Escribe el nombre de esa parte de la imagen y comprueba." onClose={() => setSheet(false)}>
          <div className="flex gap-2 pb-2">
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void write()}
              placeholder="Escribe el nombre…"
              aria-label="Nombre del punto"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-[#0b7285]/40 bg-surface-2 px-4 font-bold outline-none focus:border-[#0b7285]"
            />
            <Button variant="success" className="h-12" onClick={() => void write()} disabled={busy || !val.trim()}>
              <CornerDownLeft className="size-4" /> Comprobar
            </Button>
          </div>
          {msg && <p className="pb-2 text-sm font-bold text-uap-red">{msg}</p>}
        </ChoiceSheet>
      )}
      <div className="flex flex-col gap-2">
        {tgt && (
          <p className="sticky top-16 z-20 rounded-2xl bg-[#0b7285] px-4 py-2 text-center font-display font-black text-white shadow sm:static">
            {tap ? (
              <>
                👆 Toca en la imagen: «{tgt.text}»{tgt.desc && <span className="block text-xs font-semibold opacity-90">{tgt.desc}</span>}
                <button type="button" onClick={() => setSheet(true)} className="mt-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold hover:bg-white/30">
                  Buscar otro ▾
                </button>
              </>
            ) : (
              <>✏️ Toca un punto de la imagen y escribe qué es</>
            )}
          </p>
        )}
        <div data-coach="" className="relative overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-line">
          {image_url ? <img src={image_url} alt="Imagen de la actividad" className="block w-full select-none" draggable={false} /> : <div className="aspect-video bg-ink/5" />}
          {points.map((pt, i) => {
            const info = pinInfo(pt.key)
            const sel = !tap && target === pt.key
            const fl = flash?.key === pt.key ? flash : null
            return (
              <div key={pt.key} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pt.x}%`, top: `${pt.y}%` }}>
                <motion.button
                  onClick={() => void tapPin(pt.key)}
                  animate={fl ? (fl.ok ? { scale: [1, 1.5, 1] } : { x: [0, -6, 6, -4, 4, 0] }) : sel ? { scale: [1, 1.15, 1] } : {}}
                  transition={sel ? { repeat: Infinity, duration: 1.2 } : { duration: 0.5 }}
                  className={cn(
                    'grid size-8 place-items-center rounded-full border-[3px] border-white font-display text-sm font-black text-white shadow-[0_2px_8px_rgba(0,0,0,.5)] sm:size-9',
                    info ? (info.ok ? 'bg-uap-green' : 'bg-uap-red') : fl && !fl.ok ? 'bg-uap-red' : sel ? 'bg-uap-gold text-ink' : 'bg-[#0b7285]',
                  )}
                  aria-label={info ? `${info.label}${info.ok ? ', correcto' : ''}` : tap ? `Punto ${i + 1}` : `Punto ${i + 1}, sin nombre`}
                >
                  {info ? (info.ok ? '✓' : '✗') : tap ? '?' : i + 1}
                </motion.button>
                <AnimatePresence>
                  {info && (
                    <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn('pointer-events-none absolute left-1/2 top-full mt-1 block max-w-32 -translate-x-1/2 truncate rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-white shadow sm:text-xs', info.ok ? 'bg-uap-green' : 'bg-uap-red')}>
                      {info.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
        {msg && <p className="text-center text-sm font-bold text-uap-red">{msg}</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line">
        {tap ? (
          <>
            <p className="font-display font-black">Elige qué buscar</p>
            <div className="flex flex-wrap gap-2">
              {(names ?? []).map((nm) => {
                const q = progress[nm.key]
                return (
                  <button
                    key={nm.key}
                    onClick={() => !q?.done && setTarget(nm.key)}
                    disabled={q?.done}
                    className={cn(
                      'rounded-2xl border-2 px-3 py-1.5 text-sm font-bold transition',
                      q?.done ? (q.correct ? 'border-uap-green bg-uap-green/15 text-uap-green' : 'border-uap-red/40 bg-uap-red/10 text-uap-red line-through') : target === nm.key ? 'border-[#0b7285] bg-[#0b7285] text-white' : 'border-line bg-surface hover:border-[#0b7285]',
                    )}
                  >
                    {q?.done ? (q.correct ? '✓ ' : '✗ ') : ''}
                    {nm.text}
                  </button>
                )
              })}
            </div>
          </>
        ) : tgt ? (
          <>
            <p className="font-display font-black">Escribe el nombre del {tgt.text.toLowerCase()}</p>
            <div className="flex gap-2">
              <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void write()}
                placeholder="Nombre…"
                aria-label="Nombre del punto"
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-[#0b7285]/40 bg-surface px-4 font-bold outline-none focus:border-[#0b7285]"
              />
              <Button variant="success" className="h-12" onClick={() => void write()} disabled={busy || !val.trim()}>
                <CornerDownLeft className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-ink-soft">Toca otro punto de la imagen para cambiar.</p>
          </>
        ) : (
          <p className="font-display font-black text-uap-green">¡Completaste el mapa! 🗺️</p>
        )}
      </div>
    </div>
  )
}
