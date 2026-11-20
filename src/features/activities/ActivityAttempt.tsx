import { CheckCircle2, Clock, Lock, Send, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import { activityPlay, activityState, type ActivityExamState, type ActivityReviewItem } from '../../lib/api/activities'
import { reportFocus, submitAttempt } from '../../lib/api/exam'
import type { PlayError } from '../../lib/api/live'
import { cn } from '../../lib/cn'
import { sfx } from '../../lib/sound'
import { celebrate, fmtLeft } from '../live/clock'
import { ActivityGame } from './ActivityGame'
import { ACTIVITY_META, type Engine } from './types'

/** Intento en curso de una actividad (tarea o examen). */
export function ActivityAttempt({
  st,
  token,
  now,
  onState,
}: {
  st: ActivityExamState
  token: string
  now: number
  onState: (s: ActivityExamState | PlayError, t0: number) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const cur = st.current!
  const board = cur.activity!
  const engine = useMemo<Engine>(() => ({ play: (a, d) => activityPlay(token, a, d) }), [token])
  const submitting = useRef(false)
  const [locked, setLocked] = useState(cur.locked)
  const deadline = cur.deadline ? new Date(cur.deadline).getTime() : null
  const left = deadline ? deadline - now : null

  const finish = useCallback(
    async (why: 'student' | 'auto' | 'done') => {
      if (submitting.current) return
      submitting.current = true
      const t0 = Date.now()
      try {
        await submitAttempt(token)
        if (why === 'auto') toast.info('Se acabó el tiempo', 'La actividad se entregó con lo que resolviste.')
        if (why === 'done') {
          sfx.fanfare()
          celebrate(true)
        }
        onState(await activityState(token), t0)
      } catch {
        submitting.current = false
        toast.error('Sin conexión', 'No se pudo entregar; se intentará de nuevo.')
      }
    },
    [token, toast, onState],
  )
  useEffect(() => {
    if (left !== null && left <= 0) void finish('auto')
  }, [left, finish])
  const lastTick = useRef(-1)
  useEffect(() => {
    if (left === null) return
    const sec = Math.ceil(left / 1000)
    if (sec !== lastTick.current && sec > 0 && sec <= 10) sfx.urgent()
    lastTick.current = sec
  }, [left])

  // anti-trampa: no se puede pegar texto en las respuestas (queda registrado para el docente)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return
      e.preventDefault()
      void reportFocus(token, 'paste')
      toast.error('No se puede pegar texto', 'Escribe tu respuesta con tus palabras.')
    }
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('text/plain')) e.preventDefault()
    }
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('drop', onDrop, true)
    return () => {
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('drop', onDrop, true)
    }
  }, [token, toast])

  // modo enfoque: salir de la pestaña queda registrado (igual que en el examen)
  useEffect(() => {
    if (!st.session.focus_mode) return
    let away = false
    const lose = () => {
      if (away) return
      away = true
      void reportFocus(token, 'tab').then((r) => r.locked && setLocked(true))
      toast.info('Saliste de la actividad', 'Quedó registrado y el docente lo ve en su monitor.')
    }
    const back = () => {
      if (document.visibilityState === 'visible') away = false
    }
    const onVis = () => (document.visibilityState === 'hidden' ? lose() : back())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', lose)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', lose)
      window.removeEventListener('focus', back)
    }
  }, [st.session.focus_mode, token, toast])

  async function askFinish() {
    const pending = board.total - Object.values(board.progress).filter((p) => p.done).length
    const research = board.type === 'research'
    const ok = await confirm({
      title: research ? '¿Entregar tu investigación?' : '¿Entregar la actividad?',
      message: research
        ? 'Revisa que respondiste todo con tus palabras. Después de entregar ya no podrás cambiarla; tu docente la calificará y te llegará la nota.'
        : 'Lo que no resolviste cuenta como 0. Después de entregar ya no podrás seguir jugando este intento.',
      confirmText: 'Entregar',
      danger: pending > 0,
    })
    if (ok) void finish('student')
  }

  if (locked)
    return (
      <SolidCard className="w-full p-8 text-center">
        <Lock className="mx-auto size-12 text-uap-red" />
        <p className="mt-3 font-display text-2xl font-black">Actividad bloqueada</p>
        <p className="text-ink-soft">Saliste de la pestaña demasiadas veces. Tu avance está guardado; pide al docente que te habilite.</p>
      </SolidCard>
    )

  return (
    <div className="flex w-[min(100vw-1.5rem,72rem)] flex-col gap-3 self-center">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {st.session.mode === 'exam' ? 'Examen' : 'Actividad'} · {st.session.subject}
          </p>
          <h1 className="truncate font-display text-2xl font-black">{st.session.quiz_title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {left !== null && (
            <span className={cn('flex items-center gap-1.5 rounded-2xl px-3 py-2 font-display text-lg font-black tabular-nums', left < 60000 ? 'bg-uap-red text-white' : 'bg-surface-2 ring-1 ring-line')} aria-live="off">
              <Clock className="size-5" /> {fmtLeft(Math.max(0, left))}
            </span>
          )}
          <Button variant="gold" onClick={() => void askFinish()}>
            <Send className="size-5" /> Entregar
          </Button>
        </div>
      </div>
      <ActivityGame board={board} engine={engine} onAllDone={() => void finish('done')} onFatal={(e) => (e === 'locked' ? setLocked(true) : void finish('auto'))} />
    </div>
  )
}

/** Revisión al terminar: cada palabra con la respuesta del estudiante y la correcta. */
export function ActivityReview({ items, type }: { items: ActivityReviewItem[]; type: keyof typeof ACTIVITY_META | null | undefined }) {
  const meta = type ? ACTIVITY_META[type] : null
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-black">Revisión de {meta ? meta.label.toLowerCase() : 'la actividad'}</h2>
      {items.some((it) => it.hidden) && (
        <p className="rounded-2xl bg-uap-gold/15 px-4 py-2 text-sm font-semibold">
          🔒 Las respuestas correctas de lo que fallaste se muestran cuando cierre la actividad (así nadie se las pasa a sus compañeros).
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <SolidCard key={i} className={cn('flex items-start gap-3 border-l-8 p-3', it.correct ? 'border-l-uap-green' : 'border-l-uap-red')}>
            {it.correct ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-uap-green" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-uap-red" />}
            {it.image_url && <img src={it.image_url} alt="" className="size-12 rounded-lg bg-white object-contain" />}
            <div className="min-w-0 flex-1 text-sm">
              {it.clue && <p className="text-ink-soft">{it.clue}</p>}
              {it.answer ? <p className="font-display font-black">{it.answer}</p> : <p className="font-semibold text-ink-soft">Respuesta correcta: al cerrar la actividad</p>}
              {!it.correct && <p className="text-uap-red">Tu respuesta: {it.response || 'sin resolver'}</p>}
              {it.correct && it.partial < 1 && <p className="text-[#9a6a00]">Con más de un intento ({Math.round(it.partial * 100)} %)</p>}
            </div>
          </SolidCard>
        ))}
      </div>
    </div>
  )
}
