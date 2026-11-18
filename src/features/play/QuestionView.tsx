import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { ArrowDown, ArrowUp, Check, CheckCircle2, GripVertical, Send, Trophy, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AnswerButton } from '../../components/AnswerButton'
import { Shape } from '../../components/Shape'
import { Button } from '../../components/ui/Button'
import { ANSWER_STYLES } from '../../lib/brand'
import { cn } from '../../lib/cn'
import type { StudentResponse } from '../../lib/scoring'

/** Lo que ve el estudiante: nunca incluye cuál es la respuesta correcta. */
export interface StudentQuestion {
  type: 'single' | 'multiple' | 'true_false' | 'short_text' | 'ordering' | 'image_choice'
  prompt: string
  image_url: string | null
  time_limit_sec: number
  base_points: number
  options: { key: string; text: string; image_url: string | null }[]
}

export interface RevealInfo {
  correct: boolean
  partial: number
  points?: number
  /** claves de opciones correctas (para colorear) */
  correctKeys: string[]
  /** orden correcto (para "ordenar") */
  correctOrder?: string[]
  acceptedAnswers?: string[]
  explanation?: string | null
}

interface Props {
  q: StudentQuestion
  index: number
  total: number
  secondsLeft?: number
  onSubmit: (r: StudentResponse) => void
  submitted: boolean
  reveal?: RevealInfo | null
  /** respuesta enviada (para resaltar lo elegido al revelar) */
  response?: StudentResponse | null
}

export function QuestionView({ q, index, total, secondsLeft, onSubmit, submitted, reveal, response }: Props) {
  const [multi, setMulti] = useState<string[]>([])
  const [text, setText] = useState('')
  const [order, setOrder] = useState<string[]>(() => q.options.map((o) => o.key))
  const locked = submitted || !!reveal

  // Teclas 1–6 para responder (o marcar en "varias correctas"); Enter para enviar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = Number(e.key)
      if (n >= 1 && n <= q.options.length) {
        const key = q.options[n - 1].key
        if (q.type === 'multiple') setMulti((m) => (m.includes(key) ? m.filter((x) => x !== key) : [...m, key]))
        else if (q.type !== 'ordering' && q.type !== 'short_text') onSubmit({ kind: 'choice', key })
      }
      if (e.key === 'Enter' && q.type === 'multiple' && multi.length) onSubmit({ kind: 'choices', keys: multi })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, locked, multi, onSubmit])

  const chosen = useMemo(() => {
    if (!response) return [] as string[]
    if (response.kind === 'choice') return [response.key]
    if (response.kind === 'choices') return response.keys
    return []
  }, [response])

  const urgent = secondsLeft !== undefined && secondsLeft <= 5

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-uap-blue px-4 py-1.5 font-display text-sm font-bold text-white dark:bg-game-electric">
          Pregunta {index + 1} de {total}
        </span>
        <div className="flex items-center gap-2">
          {q.base_points > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-uap-gold/20 px-3 py-1.5 text-sm font-bold text-[#7a5e12] dark:text-uap-gold-300">
              <Trophy className="size-4" /> {q.base_points === 2000 ? 'Doble puntaje' : `${q.base_points} pts`}
            </span>
          )}
          {secondsLeft !== undefined && (
            <span
              className={cn(
                'grid size-14 place-items-center rounded-full border-4 font-display text-xl font-black tabular-nums',
                urgent ? 'animate-pulse border-game-coral text-game-coral' : 'border-uap-green text-uap-green dark:border-game-selva dark:text-game-selva',
              )}
              aria-label={`Quedan ${secondsLeft} segundos`}
            >
              {secondsLeft}
            </span>
          )}
        </div>
      </div>

      <h2 className="text-balance text-center font-display text-2xl font-extrabold leading-tight sm:text-3xl">{q.prompt}</h2>
      {q.image_url && (
        <img src={q.image_url} alt="" className="mx-auto max-h-[38vh] w-auto max-w-full rounded-3xl object-contain shadow-lg" />
      )}

      {/* Opciones */}
      {(q.type === 'single' || q.type === 'true_false') && (
        <div className="grid gap-4 sm:grid-cols-2">
          {q.options.map((o, i) => (
            <RevealWrap key={o.key} reveal={reveal} isCorrect={reveal?.correctKeys.includes(o.key)} chosen={chosen.includes(o.key)}>
              <AnswerButton
                index={q.type === 'true_false' ? (i === 0 ? 1 : 0) : i}
                text={o.text}
                selected={chosen.includes(o.key)}
                dimmed={locked && !chosen.includes(o.key) && !reveal}
                disabled={locked}
                onClick={() => onSubmit({ kind: 'choice', key: o.key })}
              />
            </RevealWrap>
          ))}
        </div>
      )}

      {q.type === 'multiple' && (
        <>
          <p className="text-center text-sm font-semibold text-ink-soft">Marca todas las correctas y presiona “Enviar”</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const on = locked ? chosen.includes(o.key) : multi.includes(o.key)
              return (
                <RevealWrap key={o.key} reveal={reveal} isCorrect={reveal?.correctKeys.includes(o.key)} chosen={chosen.includes(o.key)}>
                  <div className="relative">
                    <AnswerButton
                      index={i}
                      text={o.text}
                      selected={on}
                      disabled={locked}
                      onClick={() => setMulti((m) => (m.includes(o.key) ? m.filter((x) => x !== o.key) : [...m, o.key]))}
                    />
                    <span
                      className={cn(
                        'pointer-events-none absolute right-4 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg border-2 border-white/80 sm:right-14',
                        on ? 'bg-white text-ink' : 'bg-black/10',
                      )}
                    >
                      {on && <Check className="size-5" />}
                    </span>
                  </div>
                </RevealWrap>
              )
            })}
          </div>
          {!locked && (
            <Button size="lg" variant="primary" className="mx-auto" disabled={!multi.length} onClick={() => onSubmit({ kind: 'choices', keys: multi })}>
              <Send className="size-5" /> Enviar
            </Button>
          )}
        </>
      )}

      {q.type === 'image_choice' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {q.options.map((o, i) => {
            const s = ANSWER_STYLES[i % 4]
            return (
              <RevealWrap key={o.key} reveal={reveal} isCorrect={reveal?.correctKeys.includes(o.key)} chosen={chosen.includes(o.key)}>
                <button
                  disabled={locked}
                  onClick={() => onSubmit({ kind: 'choice', key: o.key })}
                  className={cn(
                    'btn-3d group relative w-full overflow-hidden rounded-3xl p-2',
                    s.bg,
                    chosen.includes(o.key) && 'ring-4 ring-white',
                  )}
                  style={{ '--btn-edge': s.edge } as CSSProperties}
                  aria-label={`Opción ${i + 1}`}
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-white">
                    {o.image_url ? <img src={o.image_url} alt={`Opción ${i + 1}`} className="size-full object-contain" /> : null}
                  </div>
                  <span className={cn('absolute left-4 top-4 grid size-10 place-items-center rounded-xl shadow', s.bg, s.text)}>
                    <Shape shape={s.shape} className="size-6" />
                  </span>
                </button>
              </RevealWrap>
            )
          })}
        </div>
      )}

      {q.type === 'short_text' && (
        <form
          className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) onSubmit({ kind: 'text', text })
          }}
        >
          <input
            value={locked && response?.kind === 'text' ? response.text : text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            placeholder="Escribe tu respuesta"
            className="h-16 flex-1 rounded-3xl border-4 border-uap-blue/30 bg-surface-2 px-6 text-center font-display text-2xl font-bold outline-none focus:border-uap-blue"
            autoComplete="off"
            autoFocus
          />
          {!locked && (
            <Button type="submit" size="xl" disabled={!text.trim()}>
              <Send className="size-5" /> Enviar
            </Button>
          )}
        </form>
      )}

      {q.type === 'ordering' && (
        <OrderingList
          options={q.options}
          order={locked && response?.kind === 'order' ? response.keys : order}
          setOrder={setOrder}
          locked={locked}
          correctOrder={reveal?.correctOrder}
          onSubmit={() => onSubmit({ kind: 'order', keys: order })}
        />
      )}

      {/* Estado */}
      <AnimatePresence mode="wait">
        {reveal ? (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              'mx-auto w-full max-w-xl rounded-3xl p-5 text-center text-white shadow-xl',
              reveal.correct ? 'bg-uap-green' : reveal.partial > 0 ? 'bg-[#c98a00]' : 'bg-uap-red',
            )}
          >
            <p className="flex items-center justify-center gap-2 font-display text-2xl font-black">
              {reveal.correct ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
              {reveal.correct ? '¡Correcto!' : reveal.partial > 0 ? `¡Casi! ${Math.round(reveal.partial * 100)}% correcto` : '¡Casi!'}
              {reveal.points !== undefined && reveal.points > 0 && <span className="ml-2">+{reveal.points}</span>}
            </p>
            {q.type === 'short_text' && !reveal.correct && reveal.acceptedAnswers?.length ? (
              <p className="mt-1">La respuesta era: <strong>{reveal.acceptedAnswers[0]}</strong></p>
            ) : null}
            {reveal.explanation && <p className="mt-2 text-white/90">{reveal.explanation}</p>}
          </motion.div>
        ) : submitted ? (
          <motion.p key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center font-display text-xl font-bold text-ink-soft">
            ¡Respuesta enviada! ⏳
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function RevealWrap({
  reveal,
  isCorrect,
  chosen,
  children,
}: {
  reveal?: RevealInfo | null
  isCorrect?: boolean
  chosen: boolean
  children: ReactNode
}) {
  if (!reveal) return <>{children}</>
  return (
    <div className={cn('relative transition-opacity', !isCorrect && 'opacity-40', isCorrect && 'scale-[1.02]')}>
      {children}
      {isCorrect && (
        <span className="absolute -right-2 -top-2 grid size-9 place-items-center rounded-full bg-white text-uap-green shadow-lg">
          <CheckCircle2 className="size-7" />
        </span>
      )}
      {!isCorrect && chosen && (
        <span className="absolute -right-2 -top-2 grid size-9 place-items-center rounded-full bg-white text-uap-red shadow-lg">
          <XCircle className="size-7" />
        </span>
      )}
    </div>
  )
}

function OrderingList({
  options,
  order,
  setOrder,
  locked,
  correctOrder,
  onSubmit,
}: {
  options: StudentQuestion['options']
  order: string[]
  setOrder: (o: string[]) => void
  locked: boolean
  correctOrder?: string[]
  onSubmit: () => void
}) {
  const byKey = new Map(options.map((o) => [o.key, o]))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <p className="text-center text-sm font-semibold text-ink-soft">Arrastra (o usa las flechas) para ordenar de arriba hacia abajo</p>
      <Reorder.Group axis="y" values={order} onReorder={locked ? () => {} : setOrder} className="flex flex-col gap-3">
        {order.map((k, i) => {
          const s = ANSWER_STYLES[i % 4]
          const ok = correctOrder ? correctOrder[i] === k : undefined
          return (
            <Reorder.Item
              key={k}
              value={k}
              dragListener={!locked}
              className={cn(
                'flex cursor-grab items-center gap-3 rounded-3xl p-3 font-display text-lg font-bold shadow-md active:cursor-grabbing',
                s.bg,
                s.text,
                ok === false && 'opacity-60 ring-4 ring-uap-red',
                ok === true && 'ring-4 ring-white',
              )}
              style={{ '--btn-edge': s.edge, boxShadow: `0 5px 0 0 ${s.edge}` } as CSSProperties}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/15">{i + 1}</span>
              <span className="flex-1">{byKey.get(k)?.text}</span>
              {!locked && (
                <span className="flex items-center gap-1">
                  <button onClick={() => move(i, -1)} className="rounded-lg bg-black/10 p-1.5" aria-label="Subir">
                    <ArrowUp className="size-4" />
                  </button>
                  <button onClick={() => move(i, 1)} className="rounded-lg bg-black/10 p-1.5" aria-label="Bajar">
                    <ArrowDown className="size-4" />
                  </button>
                  <GripVertical className="size-6 opacity-70" />
                </span>
              )}
              {ok === true && <CheckCircle2 className="size-6" />}
              {ok === false && <XCircle className="size-6" />}
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      {!locked && (
        <Button size="lg" className="mx-auto" onClick={onSubmit}>
          <Send className="size-5" /> Enviar orden
        </Button>
      )}
    </div>
  )
}
