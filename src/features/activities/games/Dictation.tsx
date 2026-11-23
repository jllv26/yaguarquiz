import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CornerDownLeft, Eye, Snail, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { ClueImage, useGame } from '../ActivityGame'
import { canSpeak, speak, useVoicesReady } from '../tts'
import { dictDecode } from '../types'

/* ───────────── Juego ───────────── */

export function Dictation() {
  const { board, progress, play, busy } = useGame<'dictation'>()
  const { items, listen, accents } = board.board
  useVoicesReady()
  const [cur, setCurRaw] = useState(() => Math.max(0, items.findIndex((x) => !progress[x.key]?.done)))
  const [val, setVal] = useState('')
  const [note, setNote] = useState<{ kind: 'near' | 'wrong'; text: string } | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [plays, setPlays] = useState<Record<string, number>>({})
  const [showText, setShowText] = useState(false)
  const [shake, setShake] = useState(0)
  const unlocked = useRef(false) // el navegador deja hablar solo después de un toque
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const curRef = useRef(cur)
  curRef.current = cur
  const it = items[cur]
  const p = it ? progress[it.key] : undefined
  const text = it ? dictDecode(it.say, listen) : ''
  const noVoice = !canSpeak()

  const setCur = (v: number | ((c: number) => number)) => {
    setCurRaw(v)
    setVal('')
    setNote(null)
    setShowText(false)
  }
  const say = (slow = false) => {
    if (!it) return
    const ok = speak(text, { slow, onEnd: () => setSpeaking(false) })
    if (ok) {
      unlocked.current = true
      setSpeaking(true)
      setPlays((x) => ({ ...x, [it.key]: (x[it.key] ?? 0) + 1 }))
    }
  }
  // al pasar a otra palabra, se dicta sola (si el estudiante ya tocó «Escuchar» una vez)
  useEffect(() => {
    if (unlocked.current && it && !progress[it.key]?.done) {
      const t = setTimeout(() => say(), 350)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])

  const goNext = () => {
    for (let s = 1; s <= items.length; s++) {
      const j = (cur + s) % items.length
      if (!progress[items[j].key]?.done) return setCur(j)
    }
  }
  async function check() {
    if (!it || busy || !val.trim() || p?.done) return
    const r = await play('answer', { item: it.key, value: val.trim() })
    if (!r?.ok) return
    const at = cur
    const advance = () => curRef.current === at && goNext()
    if (r.correct) {
      setNote(null)
      setTimeout(advance, 900)
    } else {
      setShake((s) => s + 1)
      if (r.done) {
        setNote({ kind: 'wrong', text: r.near ? 'Casi: era un problema de tildes.' : 'No era así.' })
        setTimeout(advance, 1800)
      } else {
        setNote(
          r.near
            ? { kind: 'near', text: `¡Casi! Las letras están bien: revisa las tildes. Te queda${r.tries_left === 1 ? '' : 'n'} ${r.tries_left} intento${r.tries_left === 1 ? '' : 's'}.` }
            : { kind: 'wrong', text: `Revisa lo que escribiste y vuelve a escuchar. Te queda${r.tries_left === 1 ? '' : 'n'} ${r.tries_left} intento${r.tries_left === 1 ? '' : 's'}.` },
        )
        inputRef.current?.focus()
      }
    }
  }
  if (!it) return null
  const shownAnswer = p?.done ? (p.correct ? p.value : p.answer) : null
  const n = plays[it.key] ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-1.5" aria-label="Dictados">
        {items.map((x, i) => {
          const pr = progress[x.key]
          return (
            <button
              key={x.key}
              onClick={() => setCur(i)}
              aria-label={`Dictado ${i + 1}${pr?.done ? (pr.correct ? ', resuelto' : ', fallado') : ''}`}
              className={cn('size-8 rounded-full font-display text-sm font-black', pr?.done ? (pr.correct ? 'bg-uap-green text-white' : 'bg-uap-red text-white') : 'bg-ink/10', i === cur && 'ring-4 ring-uap-gold')}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      <motion.div key={`${it.key}-${shake}`} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { opacity: [0, 1] }} className="flex flex-col items-center gap-4 rounded-3xl bg-surface-2 p-4 shadow-sm ring-1 ring-line sm:p-6">
        <p className="text-center text-sm font-semibold text-ink-soft">
          {listen === 'prompt' ? 'Escucha la definición y escribe el término' : 'Escucha y escribe exactamente lo que oyes'}
          {' · '}
          {it.words === 1 ? '1 palabra' : `${it.words} palabras`}
          {accents && listen !== 'prompt' ? ' · las tildes cuentan' : ''}
        </p>
        <ClueImage src={it.image_url} className="h-24 w-32 bg-white" />
        {it.hint && <p className="max-w-xl text-center font-display text-base font-bold">Pista: {it.hint}</p>}

        {noVoice ? (
          <p className="rounded-2xl bg-uap-red/10 px-4 py-3 text-center text-sm font-semibold text-uap-red">
            Este navegador no puede leer en voz alta. Abre la actividad en Google Chrome o Safari.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              animate={speaking ? { scale: [1, 1.08, 1] } : !n && !p?.done ? { boxShadow: ['0 0 0 0 rgba(14,116,144,.5)', '0 0 0 18px rgba(14,116,144,0)'] } : {}}
              transition={{ repeat: speaking || !n ? Infinity : 0, duration: speaking ? 0.6 : 1.4 }}
              onClick={() => say()}
              className="flex size-24 flex-col items-center justify-center gap-0.5 rounded-full bg-[#0e7490] font-display text-sm font-black text-white shadow-lg sm:size-28"
              aria-label="Escuchar"
            >
              <Volume2 className="size-9" />
              {n ? 'Otra vez' : 'Escuchar'}
            </motion.button>
            <button
              type="button"
              onClick={() => say(true)}
              className="flex size-16 flex-col items-center justify-center rounded-full bg-[#0e7490]/15 text-[11px] font-bold text-[#0e7490] dark:text-[#67e8f9]"
              aria-label="Escuchar más lento"
            >
              <Snail className="size-6" />
              Lento
            </button>
          </div>
        )}
        {n > 0 && <p className="text-xs text-ink-soft">Escuchado {n} {n === 1 ? 'vez' : 'veces'}</p>}
        {listen === 'prompt' && (noVoice || n > 0) && !p?.done && (
          <button type="button" onClick={() => setShowText((x) => !x)} className="flex items-center gap-1 text-xs font-bold text-uap-blue hover:underline">
            <Eye className="size-3.5" /> {showText ? 'Ocultar el texto' : 'Leer la definición'}
          </button>
        )}
        {listen === 'prompt' && (showText || noVoice) && !p?.done && <p className="max-w-xl rounded-2xl bg-ink/5 px-4 py-2 text-center text-sm">{text}</p>}

        {shownAnswer ? (
          <p className={cn('rounded-2xl px-5 py-3 text-center font-display text-xl font-black sm:text-2xl', p?.correct ? 'bg-uap-green/15 text-uap-green dark:text-game-selva' : 'bg-uap-red/10 text-uap-red dark:text-game-coral')}>
            {p?.correct ? '✓ ' : 'Era: '}
            {shownAnswer}
          </p>
        ) : p?.done ? (
          <p className="font-display text-xl font-black text-uap-red">Sin intentos · la respuesta se ve al cerrar la actividad</p>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={val}
              onChange={(e) => setVal(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void check()
                }
              }}
              rows={it.words > 4 ? 3 : 1}
              placeholder="Escribe aquí…"
              aria-label="Lo que escuchaste"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full max-w-xl resize-none rounded-2xl border-2 border-uap-gold/60 bg-surface px-4 py-3 text-center font-display text-xl font-bold outline-none focus:border-uap-gold"
            />
            <Button variant="success" onClick={() => void check()} disabled={busy || !val.trim()}>
              <CornerDownLeft className="size-4" /> Comprobar
            </Button>
          </>
        )}
        {note && (
          <p className={cn('max-w-xl rounded-2xl px-4 py-2 text-center text-sm font-bold', note.kind === 'near' ? 'bg-uap-gold/20 text-[#8a6416] dark:text-uap-gold' : 'bg-uap-red/10 text-uap-red')} role="status">
            {note.text}
          </p>
        )}
      </motion.div>

      <div className="flex justify-between">
        <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c - 1 + items.length) % items.length)}>
          <ChevronLeft className="size-4" /> Anterior
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCur((c) => (c + 1) % items.length)}>
          Siguiente <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
