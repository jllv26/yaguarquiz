import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowLeft,
  BookCheck,
  CheckCircle2,
  Copy,
  KeyRound,
  Download,
  Eye,
  Loader2,
  Lock,
  LockOpen,
  MessageSquareText,
  Mic,
  MonitorPlay,
  Pencil,
  RotateCcw,
  SkipForward,
  Square,
  Timer,
  Trash2,
  Undo2,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, Select } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { buildWorkbook, downloadBlob, headerCell } from '../../lib/excel'
import { playUrl } from '../../lib/api/live'
import {
  presentationControl,
  presentationHost,
  reviewsOf,
  teacherScore,
  toGradebook,
  type HostPresenter,
  type HostState,
} from '../../lib/api/presentations'
import { cn } from '../../lib/cn'
import { sfx } from '../../lib/sound'
import { useAuth } from '../auth/AuthProvider'
import { celebrate, useServerNow } from '../live/clock'
import { PRES_STATUS } from './PresentationsPage'
import { ANSWER_LEVELS, fmt, mmss, questionsScoreOf, scoreOf, teacherMode, teacherQ } from './rubric'

export function PresentationHostPage() {
  const { loading, session, teacher } = useAuth()
  if (loading) return <Loader2 className="m-auto mt-32 size-10 animate-spin text-uap-green" />
  if (!session) return <Navigate to="/admin/login" replace />
  if (!teacher?.approved) return <Navigate to="/admin" replace />
  return <Host />
}

const STATE_TAG: Record<HostPresenter['state'], [string, string]> = {
  pending: ['Pendiente', 'bg-ink/10 text-ink-soft'],
  live: ['En escena', 'bg-[#c81e3c] text-white'],
  done: ['Expuso', 'bg-uap-green/15 text-uap-green dark:text-game-selva'],
  absent: ['Ausente', 'bg-uap-red/10 text-uap-red dark:text-game-coral'],
}

function Host() {
  const { id = '' } = useParams()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['presentation-host', id], queryFn: () => presentationHost(id), refetchInterval: 2000 })
  const [tab, setTab] = useState<'control' | 'results'>('control')
  const [projector, setProjector] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [scoring, setScoring] = useState<HostPresenter | null>(null)
  const [busy, setBusy] = useState(false)
  const st = q.data
  const offset = useMemo(() => (st ? new Date(st.server_now).getTime() - Date.now() : 0), [st])
  const now = useServerNow(offset, true, 500)

  async function act(action: string, target: string | null = null, arg: number | null = null): Promise<boolean> {
    setBusy(true)
    try {
      const r = await presentationControl(id, action, target, arg)
      if (!r.ok && r.error === 'no_pending') toast.info('No quedan expositores pendientes en este día', 'Cambie de día o cierre las evaluaciones.')
      if (action === 'next' && r.ok) sfx.go()
      await qc.invalidateQueries({ queryKey: ['presentation-host', id] })
      return true
    } catch (e) {
      toast.error('No se pudo completar', (e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (q.isLoading) return <Loader2 className="m-auto mt-32 size-10 animate-spin text-uap-green" />
  if (!st) return <p className="mt-32 text-center text-ink-soft">La exposición no existe o no es suya.</p>

  const p = st.presentation
  const cur = st.presenters.find((x) => x.id === p.current_presenter) ?? null
  const days = [...new Set(st.presenters.map((x) => x.day))].sort((a, b) => a - b)
  const today = st.presenters.filter((x) => x.day === p.current_day)
  const nextUp = today.find((x) => x.state === 'pending')

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground />
      <TopBar
        crowded
        right={
          <div className="flex items-center gap-2">
            <Badge tone={PRES_STATUS[p.status].tone}>{PRES_STATUS[p.status].label}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setProjector(true)}>
              <MonitorPlay className="size-4" /> Proyector
            </Button>
          </div>
        }
      />
      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Cambiar el PIN de la sala"
        subtitle={`PIN actual: ${p.pin}. Los que ya entraron siguen dentro; solo los que lleguen necesitan el nuevo. Al cambiar de día, el PIN se cambia solo.`}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act('new_pin').then((ok) => {
                  if (!ok) return
                  setPinOpen(false)
                  toast.success('PIN nuevo', 'Ya aparece en el proyector.')
                })
              }
            >
              Generar uno al azar
            </Button>
            <Button
              variant="success"
              disabled={busy || !/^[1-9]\d{5}$/.test(pinDraft)}
              onClick={() =>
                void act('set_pin', null, Number(pinDraft)).then((ok) => {
                  if (!ok) return
                  setPinOpen(false)
                  toast.success(`PIN ${pinDraft}`, 'Ya aparece en el proyector.')
                })
              }
            >
              Usar este PIN
            </Button>
          </>
        }
      >
        <Input
          label="PIN que usted elige (6 dígitos, no puede empezar con 0)"
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="Ej.: 261926"
          className="text-center font-display text-2xl tracking-[0.4em]"
        />
      </Modal>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pb-8">
        <header className="flex flex-wrap items-center gap-3">
          <Link to="/admin/exposiciones" className="rounded-xl p-2 hover:bg-ink/5" aria-label="Volver a exposiciones">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-[12rem] flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Exposiciones · {p.subject.code} ({p.subject.parallel})
            </p>
            <h1 className="truncate font-display text-2xl font-black sm:text-3xl">{p.title}</h1>
          </div>
          <div className="flex rounded-2xl bg-ink/5 p-1" role="tablist" aria-label="Vista">
            {(
              [
                ['control', 'Control en vivo'],
                ['results', 'Resultados'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-xl px-4 py-2 text-sm font-bold', tab === k ? 'bg-surface-2 shadow-sm' : 'text-ink-soft')}>
                {label}
              </button>
            ))}
          </div>
          <Link to={`/admin/exposiciones/${id}`}>
            <Button size="sm" variant="ghost">
              <Pencil className="size-4" /> Grupos y rúbrica
            </Button>
          </Link>
        </header>

        {tab === 'control' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              {/* sala */}
              <SolidCard className="flex flex-wrap items-center gap-4 p-4">
                <div className="rounded-2xl bg-white p-2 shadow-sm">
                  <QRCodeSVG value={playUrl(p.pin)} size={88} level="M" fgColor="#14213D" title="Código QR para entrar a la exposición" role="img" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">PIN de la sala</p>
                  <p className="font-display text-4xl font-black tracking-widest tabular-nums">{p.pin}</p>
                  <p className="text-sm text-ink-soft">
                    <Users className="mr-1 inline size-4" />
                    {st.participants.length} de {st.enrolled} estudiantes entraron
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {p.status === 'open' ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (await confirm({ title: '¿Cerrar las evaluaciones?', message: 'Los estudiantes ya no podrán calificar. Puede reabrirlas después.', confirmText: 'Cerrar' })) await act('close')
                        })()
                      }
                    >
                      <Lock className="size-4" /> Cerrar evaluaciones
                    </Button>
                  ) : (
                    <Button variant="success" disabled={busy} onClick={() => void act(p.status === 'closed' ? 'reopen' : 'open')}>
                      <LockOpen className="size-4" /> {p.status === 'closed' ? 'Reabrir' : 'Abrir la sala'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(playUrl(p.pin))
                      toast.success('Enlace copiado')
                    }}
                  >
                    <Copy className="size-4" /> Copiar enlace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPinDraft('')
                      setPinOpen(true)
                    }}
                  >
                    <KeyRound className="size-4" /> Cambiar PIN
                  </Button>
                </div>
              </SolidCard>

              {/* en escena */}
              <SolidCard className="relative overflow-hidden p-5">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-uap-gold via-game-coral to-uap-gold" />
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-uap-red dark:text-game-coral">
                  <Mic className="size-4" /> En escena
                </p>
                {cur ? (
                  <>
                    <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-3xl font-black leading-tight">{cur.name}</p>
                        <p className="text-ink-soft">
                          {cur.group_no ? `Grupo ${cur.group_no}` : ''}
                          {cur.topic ? ` · ${cur.topic}` : ''}
                        </p>
                      </div>
                      <p className="flex items-center gap-2 rounded-2xl bg-ink/5 px-4 py-2 font-display text-4xl font-black tabular-nums" aria-label="Tiempo de exposición">
                        <Timer className="size-7" /> {mmss(Math.max(0, (now - new Date(cur.started_at ?? now).getTime()) / 1000))}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">
                      <b className="text-ink">{cur.peer_n}</b> calificaciones de compañeros
                      {cur.peer_avg != null && (
                        <>
                          {' '}
                          · promedio <b className="text-ink">{fmt(cur.peer_avg)}</b>
                        </>
                      )}
                      {cur.teacher != null && (
                        <>
                          {' '}
                          · su nota <b className="text-ink">{fmt(cur.teacher)}</b>
                        </>
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" disabled={busy} onClick={() => void act('end')}>
                        <Square className="size-4" /> Terminar exposición
                      </Button>
                      <Button variant="gold" disabled={busy || !nextUp} onClick={() => void act('next')}>
                        <SkipForward className="size-4" /> Siguiente expositor
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => void act('reset_timer')}>
                        <RotateCcw className="size-4" /> Cronómetro a 0:00
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => setScoring(cur)}>
                        <BookCheck className="size-4" /> Calificar
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 flex flex-col items-start gap-3">
                    <p className="text-ink-soft">{nextUp ? `Sigue: ${nextUp.name}${nextUp.group_no ? ` (Grupo ${nextUp.group_no})` : ''}` : 'No quedan expositores pendientes en este día.'}</p>
                    <Button size="lg" variant="gold" disabled={busy || !nextUp} onClick={() => void act('next')}>
                      <SkipForward className="size-5" /> {st.presenters.some((x) => x.state !== 'pending') ? 'Siguiente expositor' : 'Primer expositor'}
                    </Button>
                  </div>
                )}
                <p className="mt-3 text-xs text-ink-soft">El cronómetro corre sin límite. Al terminar o pasar al siguiente se guarda cuánto expuso; el curso puede seguir calificándolo hasta que cierre.</p>
              </SolidCard>

              {/* presentes */}
              <Presentes st={st} onRelease={(pid) => void act('release', pid)} onClear={() => void act('clear_tests')} />
            </div>

            {/* agenda */}
            <SolidCard className="flex flex-col p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-display text-lg font-black">Orden de exposición</h2>
                {days.length > 1 && (
                  <div className="flex rounded-2xl bg-ink/5 p-1" role="tablist" aria-label="Día">
                    {days.map((d) => (
                      <button key={d} role="tab" aria-selected={p.current_day === d} onClick={() => void act('day', null, d)} className={cn('rounded-xl px-3 py-1.5 text-sm font-bold', p.current_day === d ? 'bg-surface-2 shadow-sm' : 'text-ink-soft')}>
                        Día {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mb-2 text-sm text-ink-soft">
                {today.filter((x) => x.state === 'done' || x.state === 'absent').length} de {today.length} pasaron
              </p>
              <ol className="flex flex-col gap-1.5">
                {today.map((x) => (
                  <li key={x.id} className={cn('flex items-center gap-2 rounded-2xl border p-2', x.state === 'live' ? 'border-[#c81e3c] bg-[#c81e3c]/5' : 'border-line')}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-uap-blue/10 font-display text-sm font-black text-uap-blue dark:text-white">{x.group_no ? `G${x.group_no}` : x.sort_order}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.name}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {x.topic ?? ''}
                        {x.duration_sec != null && ` · ⏱ ${mmss(x.duration_sec)}`}
                        {x.peer_n > 0 && ` · ${x.peer_n} calif.`}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold', STATE_TAG[x.state][1])}>{STATE_TAG[x.state][0]}</span>
                    <span className="w-12 shrink-0 text-right font-display font-black tabular-nums">{fmt(x.final)}</span>
                    <RowActions x={x} busy={busy} onAct={act} onScore={() => setScoring(x)} confirm={confirm} />
                  </li>
                ))}
              </ol>
            </SolidCard>
          </div>
        ) : (
          <Results st={st} onOpen={setScoring} />
        )}
      </main>

      <AnimatePresence>{projector && <Projector st={st} now={now} onClose={() => setProjector(false)} />}</AnimatePresence>
      {scoring && <ScoreModal key={scoring.id} st={st} presenter={st.presenters.find((x) => x.id === scoring.id) ?? scoring} onClose={() => setScoring(null)} />}
    </div>
  )
}

function RowActions({
  x,
  busy,
  onAct,
  onScore,
  confirm,
}: {
  x: HostPresenter
  busy: boolean
  onAct: (a: string, t?: string | null) => Promise<unknown>
  onScore: () => void
  confirm: ReturnType<typeof useConfirm>
}) {
  return (
    <span className="flex shrink-0 gap-0.5">
      {x.state !== 'live' && x.state !== 'absent' && (
        <IconBtn label={`Poner en escena a ${x.name}`} disabled={busy} onClick={() => void onAct('start', x.id)}>
          <Mic className="size-4" />
        </IconBtn>
      )}
      <IconBtn label={`Calificar a ${x.name}`} onClick={onScore}>
        <BookCheck className="size-4" />
      </IconBtn>
      {x.state !== 'absent' && (
        <IconBtn label={`Marcar ausente a ${x.name}`} disabled={busy} onClick={() => void onAct('absent', x.id)}>
          <UserX className="size-4" />
        </IconBtn>
      )}
      {x.state !== 'pending' && (
        <IconBtn
          label={`Deshacer: ${x.name} vuelve a pendiente`}
          disabled={busy}
          onClick={() =>
            void (async () => {
              if (await confirm({ title: `¿Volver a pendiente a ${x.name}?`, message: x.peer_n ? `Se borran las ${x.peer_n} calificaciones que recibió.` : 'Podrá ponerlo en escena de nuevo.', confirmText: 'Deshacer', danger: x.peer_n > 0 }))
                await onAct('undo', x.id)
            })()
          }
        >
          <Undo2 className="size-4" />
        </IconBtn>
      )}
    </span>
  )
}
const IconBtn = ({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-lg p-1.5 text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-40">
    {children}
  </button>
)

function Presentes({ st, onRelease, onClear }: { st: HostState; onRelease: (id: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  return (
    <SolidCard className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-black">
          Presentes: {st.participants.length} <span className="text-sm font-semibold text-ink-soft">de {st.enrolled}</span>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Eye className="size-4" /> {open ? 'Ocultar' : 'Ver quiénes entraron'}
        </Button>
      </div>
      {open && (
        <ul className="mt-2 grid max-h-64 gap-1 overflow-auto text-sm sm:grid-cols-2">
          {st.participants.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-xl bg-ink/[0.03] px-2 py-1.5">
              <span className={cn('size-2 shrink-0 rounded-full', x.online ? 'bg-uap-green' : 'bg-ink/20')} aria-label={x.online ? 'conectado' : 'desconectado'} />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="text-xs text-ink-soft">{x.reviews} calif.</span>
              <button className="text-xs font-semibold text-uap-blue underline dark:text-white" onClick={() => onRelease(x.id)} title="Permite que entre desde otro equipo">
                Liberar
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 rounded-2xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Antes de la sesión real: borrar pruebas</summary>
        <p className="mt-2 text-ink-soft">Borra todas las calificaciones, sus notas y la lista de presentes, y deja a todos en «Pendiente». La rúbrica y los grupos se mantienen.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Escriba BORRAR" aria-label="Escriba BORRAR para confirmar" className="h-10 w-40 rounded-xl border-2 border-line bg-surface-2 px-3" />
          <Button
            size="sm"
            variant="secondary"
            disabled={word.trim().toUpperCase() !== 'BORRAR'}
            onClick={() => {
              onClear()
              setWord('')
            }}
          >
            <Trash2 className="size-4" /> Borrar todo
          </Button>
        </div>
      </details>
    </SolidCard>
  )
}

// ================================================================ calificación del docente + comentarios
function ScoreModal({ st, presenter, onClose }: { st: HostState; presenter: HostPresenter; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const rubric = st.presentation.rubric
  const byQuestions = teacherMode(st.presentation.settings) === 'questions'
  const nQ = byQuestions ? teacherQ(st.presentation.settings) : rubric.criteria.length
  const prev = presenter.teacher_scores && presenter.teacher_scores.length === nQ ? presenter.teacher_scores : null
  const [scores, setScores] = useState<(number | null)[]>(prev ?? Array(nQ).fill(null))
  const [notes, setNotes] = useState<string[]>(() => Array.from({ length: nQ }, (_, i) => presenter.teacher_notes?.[i] ?? ''))
  const [comment, setComment] = useState(presenter.teacher_comment ?? '')
  const [busy, setBusy] = useState(false)
  const reviews = useQuery({ queryKey: ['pres-reviews', presenter.id, presenter.peer_n], queryFn: () => reviewsOf(presenter.id) })
  const score = byQuestions ? questionsScoreOf(scores) : scoreOf(scores, rubric)
  const tw = st.presentation.settings.teacher_weight ?? 50
  const levels = [...rubric.levels].sort((a, b) => a.v - b.v)

  async function save(clear = false) {
    setBusy(true)
    try {
      await teacherScore(presenter.id, clear ? null : (scores as number[]), clear ? null : comment, clear || !byQuestions ? null : notes.map((n) => n.trim()))
      await qc.invalidateQueries({ queryKey: ['presentation-host', st.presentation.id] })
      toast.success(clear ? 'Su nota se quitó' : 'Su nota quedó guardada')
      onClose()
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={presenter.name}
      subtitle={`${presenter.group_no ? `Grupo ${presenter.group_no} · ` : ''}${presenter.topic ?? ''}`}
      footer={
        <>
          {presenter.teacher_scores && (
            <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
              Quitar mi nota
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="success" onClick={() => void save()} disabled={busy || scores.some((x) => x == null)}>
            <CheckCircle2 className="size-5" /> Guardar mi nota {score != null && `· ${fmt(score)}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="font-display font-black">{byQuestions ? `Sus ${nQ} preguntas · valen el ${tw} % de la nota` : 'Su calificación'}</h3>
          {byQuestions && (
            <p className="-mt-1 text-xs text-ink-soft">
              Respondió = 2 · A medias = 1 · No respondió = 0. Su nota = puntos ÷ {nQ * 2} × 100.
            </p>
          )}
          {byQuestions &&
            scores.map((v, i) => (
              <div key={i} className="rounded-2xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-black">Pregunta {i + 1}</span>
                  <input
                    value={notes[i] ?? ''}
                    onChange={(e) => setNotes((n) => n.map((x, k) => (k === i ? e.target.value : x)))}
                    placeholder="¿Qué le preguntó? (opcional)"
                    aria-label={`Qué preguntó en la pregunta ${i + 1}`}
                    className="h-9 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface-2 px-2 text-sm"
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Pregunta ${i + 1}`}>
                  {ANSWER_LEVELS.map((l) => (
                    <button
                      key={l.v}
                      role="radio"
                      aria-checked={v === l.v}
                      onClick={() => setScores((s) => s.map((x, k) => (k === i ? l.v : x)))}
                      className={cn(
                        'rounded-xl border-2 px-2 py-2 text-sm font-bold leading-tight',
                        v === l.v ? (l.v === 2 ? 'border-uap-green bg-uap-green/15' : l.v === 1 ? 'border-uap-gold bg-uap-gold/20' : 'border-uap-red bg-uap-red/10') : 'border-line hover:border-uap-gold',
                      )}
                    >
                      {l.emoji} {l.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {!byQuestions && rubric.criteria.map((c, i) => (
            <div key={i} className="rounded-2xl border border-line p-3">
              <p className="font-semibold">
                {c.icon} {c.title}
                {presenter.criteria?.[i] != null && <span className="ml-2 text-xs font-normal text-ink-soft">compañeros: {fmt(presenter.criteria[i], 2)}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={c.title}>
                {levels.map((l) => (
                  <button
                    key={l.v}
                    role="radio"
                    aria-checked={scores[i] === l.v}
                    title={c.levels?.[String(l.v)] || l.hint}
                    onClick={() => setScores((s) => s.map((x, k) => (k === i ? l.v : x)))}
                    className={cn('rounded-xl border-2 px-3 py-1.5 text-sm font-bold', scores[i] === l.v ? 'border-uap-green bg-uap-green/15' : 'border-line hover:border-uap-gold')}
                  >
                    {l.emoji} {l.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comentario para usted (opcional)" aria-label="Comentario del docente" className="w-full rounded-2xl border-2 border-line bg-surface-2 p-3" />
          <p className="rounded-2xl bg-ink/5 p-3 text-sm">
            Compañeros: <b>{fmt(presenter.peer_avg)}</b> ({presenter.peer_n}) · Usted: <b>{fmt(score ?? presenter.teacher)}</b> · Final: <b>{fmt(presenter.final)}</b>
          </p>
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-display font-black">
            <MessageSquareText className="size-5" /> Lo que escribieron sus compañeros
          </h3>
          {reviews.isLoading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : !reviews.data?.length ? (
            <p className="text-sm text-ink-soft">Todavía nadie lo calificó.</p>
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
              {reviews.data.map((r, i) => (
                <li key={i} className="rounded-2xl bg-ink/[0.04] p-3 text-sm">
                  <p className="flex justify-between gap-2 font-semibold">
                    <span className="truncate">{r.evaluator}</span>
                    <span className="font-display font-black">{fmt(r.score)}</span>
                  </p>
                  <p className="mt-1">
                    <span className="text-ink-soft">Por qué: </span>
                    {r.why}
                  </p>
                  <p>
                    <span className="text-ink-soft">Entendió: </span>
                    {r.understood}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ================================================================ resultados
function Results({ st, onOpen }: { st: HostState; onOpen: (p: HostPresenter) => void }) {
  const toast = useToast()
  const [item, setItem] = useState(st.presentation.grading_item_id ?? st.items.find((i) => /expos/i.test(i.category))?.id ?? '')
  const [busy, setBusy] = useState(false)
  const rubric = st.presentation.rubric
  const tw = st.presentation.settings.teacher_weight ?? 50
  const top = st.presenters.filter((x) => x.final != null && x.state !== 'absent').sort((a, b) => (b.final ?? 0) - (a.final ?? 0)).slice(0, 3)
  useEffect(() => {
    if (top.length >= 3) celebrate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function excel() {
    setBusy(true)
    try {
      const detail = await Promise.all(st.presenters.map(async (x) => ({ x, r: x.peer_n ? await reviewsOf(x.id) : [] })))
      const head = ['N°', 'RU', 'Estudiante', 'Grupo', 'Tema', 'Día', 'Estado', 'Tiempo', 'Calificaciones', 'Compañeros /100', 'Docente /100', 'Nota final /100', 'Sobre 5', ...rubric.criteria.map((c) => c.title)]
      const notas = [
        head.map(headerCell),
        ...st.presenters.map((x, i) => [
          i + 1,
          x.code,
          x.name,
          x.group_no ?? '',
          x.topic ?? '',
          x.day,
          { pending: 'Pendiente', live: 'En escena', done: 'Expuso', absent: 'Ausente' }[x.state],
          x.duration_sec != null ? mmss(x.duration_sec) : '',
          x.peer_n,
          x.peer_avg ?? '',
          x.teacher ?? '',
          x.final ?? '',
          x.final != null ? Math.round(Number(x.final) * 5) / 100 : '',
          ...rubric.criteria.map((_, k) => x.criteria?.[k] ?? ''),
        ]),
      ]
      const coms = [
        ['Expositor', 'RU expositor', 'Evaluador', 'RU evaluador', 'Nota /100', ...rubric.criteria.map((c) => c.title), '¿Por qué?', '¿Qué entendió?'].map(headerCell),
        ...detail.flatMap(({ x, r }) => r.map((v) => [x.name, x.code, v.evaluator, v.code, v.score, ...v.scores, v.why, v.understood])),
      ]
      const blob = await buildWorkbook([
        { sheet: 'Notas', data: notas, columns: [{ width: 5 }, { width: 13 }, { width: 32 }, { width: 7 }, { width: 34 }, { width: 6 }, { width: 11 }, { width: 8 }, { width: 13 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 9 }], stickyRowsCount: 1 },
        { sheet: 'Comentarios', data: coms, columns: [{ width: 28 }, { width: 13 }, { width: 28 }, { width: 13 }, { width: 10 }], stickyRowsCount: 1 },
      ])
      downloadBlob(blob, `${st.presentation.title.replace(/[\\/:*?"<>|]+/g, ' ')} - notas.xlsx`)
    } catch (e) {
      toast.error('No se pudo crear el Excel', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {top.length > 0 && (
        <SolidCard className="p-5">
          <h2 className="mb-4 text-center font-display text-xl font-black">Podio de la exposición</h2>
          <div className="mx-auto grid max-w-xl grid-cols-3 items-end gap-3">
            {[top[1], top[0], top[2]].map((x, k) =>
              x ? (
                <motion.div key={x.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: [0.3, 0.6, 0][k] }} className="flex flex-col items-center gap-1 text-center">
                  {k === 1 && <JaguarFace mood="happy" className="w-16" />}
                  <p className="text-2xl">{['🥈', '🥇', '🥉'][k]}</p>
                  <p className="line-clamp-2 text-sm font-bold">{x.name}</p>
                  <div className={cn('grid w-full place-items-center rounded-t-2xl font-display text-2xl font-black text-white', ['h-20 bg-[#8a94a6]', 'h-28 bg-uap-gold', 'h-14 bg-[#b0703a]'][k])}>{fmt(x.final)}</div>
                </motion.div>
              ) : (
                <span key={k} />
              ),
            )}
          </div>
        </SolidCard>
      )}
      <SolidCard className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-auto font-display text-lg font-black">Notas de la exposición</h2>
          <Button size="sm" variant="secondary" onClick={() => void excel()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Descargar Excel
          </Button>
          {st.items.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={item} onChange={(e) => setItem(e.target.value)} aria-label="Categoría de la libreta">
                <option value="">— Categoría de la libreta —</option>
                {st.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    Parcial {i.term} · {i.category} ({i.weight} pts)
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="success"
                disabled={!item || busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true)
                    try {
                      const n = await toGradebook(st.presentation.id, item)
                      toast.success(`${n} notas pasaron a la libreta`, 'Las ve en Asignaturas → Libreta de notas.')
                    } catch (e) {
                      toast.error('No se pudo pasar a la libreta', (e as Error).message)
                    } finally {
                      setBusy(false)
                    }
                  })()
                }
              >
                <BookCheck className="size-4" /> Enviar a la libreta
              </Button>
            </div>
          )}
        </div>
        <p className="px-4 pt-3 text-sm text-ink-soft">
          Nota final = {tw} % su nota + {100 - tw} % promedio de los compañeros (si falta una, cuenta la otra). Ausente: 0. Toque un nombre para ver los comentarios.
        </p>
        <div className="overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                <th className="px-2 py-2">Estudiante</th>
                <th className="px-2 py-2">Grupo</th>
                <th className="px-2 py-2">Tiempo</th>
                <th className="px-2 py-2 text-right">Calif.</th>
                <th className="px-2 py-2 text-right">Compañeros</th>
                <th className="px-2 py-2 text-right">Usted</th>
                <th className="px-2 py-2 text-right">Final /100</th>
              </tr>
            </thead>
            <tbody>
              {st.presenters.map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="px-2 py-2">
                    <button onClick={() => onOpen(x)} className="text-left font-semibold hover:underline">
                      {x.name}
                    </button>
                    <span className="block text-xs text-ink-soft">
                      {x.code}
                      {x.state === 'absent' ? ' · Ausente' : x.state === 'pending' ? ' · Pendiente' : x.state === 'live' ? ' · En escena' : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2">{x.group_no ?? '—'}</td>
                  <td className="px-2 py-2 tabular-nums">{x.duration_sec != null ? mmss(x.duration_sec) : '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{x.peer_n}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(x.peer_avg)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(x.teacher)}</td>
                  <td className="px-2 py-2 text-right font-display text-lg font-black tabular-nums">{fmt(x.final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SolidCard>
    </div>
  )
}

// ================================================================ proyector
function Projector({ st, now, onClose }: { st: HostState; now: number; onClose: () => void }) {
  const p = st.presentation
  const cur = st.presenters.find((x) => x.id === p.current_presenter) ?? null
  const today = st.presenters.filter((x) => x.day === p.current_day)
  const next = today.filter((x) => x.state === 'pending').slice(0, 3)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.documentElement.requestFullscreen?.().catch(() => null)
    return () => {
      window.removeEventListener('keydown', k)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => null)
    }
  }, [onClose])
  const short = playUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 overflow-auto bg-[#0b1220] text-white" role="dialog" aria-modal="true" aria-label="Proyector de la exposición">
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 20% 20%, #1B7339 0, transparent 45%), radial-gradient(circle at 80% 80%, #C9A23A 0, transparent 40%)' }} />
      <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Cerrar proyector">
        <X className="size-6" />
      </button>
      <div className="relative mx-auto grid min-h-full max-w-7xl items-center gap-8 p-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/5 p-6 text-center ring-1 ring-white/10">
          <p className="text-sm font-bold uppercase tracking-widest text-white/70">Entra desde tu celular o la PC</p>
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG value={playUrl(p.pin)} size={210} level="M" fgColor="#14213D" title="Código QR para entrar" role="img" />
          </div>
          <p className="font-semibold text-white/80">{short}</p>
          <p className="text-sm font-bold uppercase tracking-widest text-white/70">PIN</p>
          <p className="font-display text-6xl font-black tracking-widest tabular-nums text-uap-gold">{p.pin}</p>
          <p className="text-white/70">
            {st.participants.length} de {st.enrolled} conectados
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-white/60">{p.title}</p>
            <p className="flex items-center gap-2 text-lg font-black uppercase tracking-widest text-game-coral">
              <Mic className="size-6" /> En el escenario
            </p>
          </div>
          {cur ? (
            <motion.div key={cur.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}>
              <p className="font-display text-6xl font-black leading-tight lg:text-7xl">{cur.name.split(', ').reverse().join(' ')}</p>
              <p className="mt-2 text-2xl text-white/80">
                {cur.group_no ? `Grupo ${cur.group_no}` : ''}
                {cur.topic ? ` · ${cur.topic}` : ''}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-6">
                <p className="flex items-center gap-3 rounded-3xl bg-white/10 px-6 py-3 font-display text-7xl font-black tabular-nums">
                  <Timer className="size-12" /> {mmss(Math.max(0, (now - new Date(cur.started_at ?? now).getTime()) / 1000))}
                </p>
                <p className="text-2xl">
                  <b className="font-display text-5xl font-black text-uap-gold">{cur.peer_n}</b> calificaciones
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center gap-6">
              <JaguarFace mood="neutral" className="w-32" />
              <p className="font-display text-4xl font-black text-white/80">Esperando al {st.presenters.some((x) => x.state !== 'pending') ? 'siguiente' : 'primer'} expositor</p>
            </div>
          )}
          {next.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-widest text-white/60">Siguen</p>
              <div className="flex flex-wrap gap-2">
                {next.map((x) => (
                  <span key={x.id} className="rounded-2xl bg-white/10 px-4 py-2 text-lg font-semibold">
                    {x.group_no ? `G${x.group_no} · ` : ''}
                    {x.name.split(', ').reverse().join(' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

