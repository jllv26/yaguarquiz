import { motion } from 'framer-motion'
import { Eye, Pause, Play, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'
import { canSpeak, speak, stopSpeaking, useVoicesReady } from '../tts'
import { McQuestion } from './McPanel'

const COLORS = ['#1971c2', '#c2255c', '#2b8a3e', '#e8590c', '#7048e8']
const PITCH = [0.9, 1.25, 0.75, 1.1, 1.4]

export default function Dialogue() {
  const { board } = useGame<'dialogue'>()
  const lines = board.board.dialogue ?? []
  const hidden = board.board.dialogue_text === 'hide'
  useVoicesReady()
  const who = [...new Set(lines.map((l) => l.who.trim() || '—'))]
  const [line, setLine] = useState<number | null>(null)
  const [heard, setHeard] = useState(false)
  const [show, setShow] = useState(!hidden)
  const playing = useRef(false)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const sayLine = (i: number, chain: boolean) => {
    const l = lines[i]
    if (!l) {
      playing.current = false
      setLine(null)
      setHeard(true)
      return
    }
    setLine(i)
    refs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const w = who.indexOf(l.who.trim() || '—')
    const ok = speak(l.text, {
      pitch: PITCH[w % PITCH.length],
      voice: w,
      onEnd: () => {
        if (chain && playing.current) setTimeout(() => sayLine(i + 1, true), 350)
        else setLine(null)
      },
    })
    if (!ok) {
      playing.current = false
      setLine(null)
      setShow(true)
    }
  }
  const playAll = () => {
    playing.current = true
    sayLine(0, true)
  }
  const stop = () => {
    playing.current = false
    stopSpeaking()
    setLine(null)
  }
  useEffect(() => () => stopSpeaking(), [])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3 rounded-3xl bg-[#e7f5ff] p-3 shadow-sm ring-1 ring-line dark:bg-[#0c2340] sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto font-display font-black">💬 Escucha el diálogo</p>
          {canSpeak() &&
            (line !== null && playing.current ? (
              <Button size="sm" variant="secondary" onClick={stop}>
                <Pause className="size-4" /> Pausar
              </Button>
            ) : (
              <Button size="sm" onClick={playAll}>
                <Play className="size-4" /> {heard ? 'Escuchar otra vez' : 'Escuchar'}
              </Button>
            ))}
          {hidden && !show && (
            <Button size="sm" variant="ghost" onClick={() => setShow(true)} disabled={!heard && canSpeak()} title={heard ? '' : 'Primero escucha el diálogo completo'}>
              <Eye className="size-4" /> Ver texto
            </Button>
          )}
        </div>
        <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
          {lines.map((l, i) => {
            const w = who.indexOf(l.who.trim() || '—')
            const right = w === 1
            return (
              <motion.div
                key={i}
                ref={(el) => {
                  refs.current[i] = el
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, scale: line === i ? 1.02 : 1 }}
                transition={{ delay: Math.min(i * 0.04, 0.6) }}
                className={cn('flex items-end gap-2', right && 'flex-row-reverse')}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-black text-white" style={{ background: COLORS[w % COLORS.length] }} title={l.who}>
                  {(l.who.trim() || '?')[0].toUpperCase()}
                </span>
                <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm', right ? 'rounded-br-sm bg-[#d3f9d8] dark:bg-[#1e4620]' : 'rounded-bl-sm bg-surface', line === i && 'ring-2 ring-uap-gold')}>
                  <p className="text-[11px] font-black" style={{ color: COLORS[w % COLORS.length] }}>
                    {l.who}
                  </p>
                  <p className={cn(!show && 'select-none blur-sm')}>{show ? l.text : l.text.replace(/\S/g, '•')}</p>
                </div>
                {canSpeak() && (
                  <button onClick={() => sayLine(i, false)} className="mb-1 rounded-full p-1.5 text-ink-soft hover:bg-ink/10" aria-label={`Escuchar a ${l.who}`}>
                    <Volume2 className="size-4" />
                  </button>
                )}
              </motion.div>
            )
          })}
        </div>
        {!canSpeak() && <p className="text-xs text-ink-soft">Este navegador no lee en voz alta: lee el diálogo.</p>}
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-display font-black">❓ Responde sobre el diálogo</p>
        {board.board.items.map((it, i) => (
          <McQuestion key={it.key} it={it} n={i + 1} compact />
        ))}
      </div>
    </div>
  )
}
