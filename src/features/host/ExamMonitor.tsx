import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Lock,
  Minus,
  MonitorSmartphone,
  MoreVertical,
  Play,
  Plus,
  Repeat,
  Presentation,
  RotateCcw,
  Send,
  Share2,
  Square,
  Unlock,
  UserX,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { examControl, examMonitor, examParticipant, REASON_LABEL, SHOW_CORRECT_LABEL, type MonitorRow, type MonitorState } from '../../lib/api/exam'
import { hostParticipant, playUrl, serverOffset } from '../../lib/api/live'
import { BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'
import { buildWorkbook, downloadBlob, headerCell, titleCell } from '../../lib/excel'
import { AvatarBubble } from '../live/LiveBits'
import { fmtLeft, useServerNow } from '../live/clock'
import { useAutoSync } from '../reports/useAutoSync'
import { sfx } from '../../lib/sound'
import { supabase } from '../../lib/supabase'
import { ExamProjector } from './ExamProjector'

type Filter = 'all' | 'progress' | 'done' | 'absent' | 'alerts'

function rowStatus(r: MonitorRow): { key: 'absent' | 'kicked' | 'joined' | 'progress' | 'locked' | 'done'; label: string } {
  if (!r.participant_id) return { key: 'absent', label: 'No entró' }
  if (r.kicked) return { key: 'kicked', label: 'Retirado' }
  if (r.current?.locked) return { key: 'locked', label: 'Bloqueado' }
  if (r.current) return { key: 'progress', label: `Intento ${r.current.number} en curso` }
  if (r.attempts_used > 0) return { key: 'done', label: r.last_reason ? (REASON_LABEL[r.last_reason] ?? 'Entregó') : 'Entregó' }
  return { key: 'joined', label: 'Entró, sin empezar' }
}

export function ExamMonitor({ id }: { id: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [st, setSt] = useState<MonitorState | null>(null)
  const [offset, setOffset] = useState(0)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [projector, setProjector] = useState(false)

  const refresh = useCallback(async () => {
    const t0 = Date.now()
    try {
      const s = await examMonitor(id)
      setOffset(serverOffset(s.server_now, t0))
      setSt(s)
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])
  const now = useServerNow(offset, true, 1000)
  const closedNow = !!st && (st.session.status === 'finished' || (!!st.session.closes_at && new Date(st.session.closes_at).getTime() <= now))
  // aviso con sonido cuando alguien pide entrar desde otro equipo
  const pending = useMemo(() => (st?.rows ?? []).filter((r) => r.takeover_pending && !r.kicked), [st?.rows])
  const pendingCount = useRef(0)
  useEffect(() => {
    if (pending.length > pendingCount.current) sfx.notify()
    pendingCount.current = pending.length
  }, [pending.length])
  useAutoSync(id, closedNow && st?.session.identification === 'roster' && !st.rows.some((r) => r.current))

  // primero quienes entraron (los que están en curso arriba), al final los ausentes
  const rows = useMemo(() => {
    const rank = (r: MonitorRow) => (!r.participant_id ? 3 : r.kicked ? 2 : r.current ? 0 : 1)
    return [...(st?.rows ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'es'))
  }, [st?.rows])
  const stats = useMemo(() => {
    const present = rows.filter((r) => r.participant_id && !r.kicked)
    const graded = present.filter((r) => r.best_grade !== null).map((r) => Number(r.best_grade))
    const pass = st?.session.pass_mark ?? 51
    return {
      enrolled: rows.filter((r) => r.student_id || r.participant_id).length,
      present: present.length,
      progress: present.filter((r) => r.current).length,
      done: graded.length,
      avg: graded.length ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 10) / 10 : null,
      passed: graded.filter((g) => g >= pass).length,
      alerts: present.filter((r) => r.focus_total > 0 || r.paste_total > 0 || r.current?.locked).length,
    }
  }, [rows, st?.session.pass_mark])

  if (err && !st)
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <SolidCard className="max-w-md p-8 text-center">
          <p className="font-display text-xl font-bold">No pudimos abrir el monitor</p>
          <p className="mt-1 text-ink-soft">{err}</p>
          <Link to="/admin/sesiones" className="mt-4 inline-block">
            <Button variant="secondary">Volver a sesiones</Button>
          </Link>
        </SolidCard>
      </div>
    )
  if (!st) return null
  const s = st.session
  const url = playUrl(s.pin)
  const color = s.subject?.theme_color || '#1B7339'
  const opensMs = s.opens_at ? new Date(s.opens_at).getTime() : null
  const closesMs = s.closes_at ? new Date(s.closes_at).getTime() : null
  const win = s.status === 'finished' || (closesMs !== null && now >= closesMs) ? 'closed' : opensMs !== null && now < opensMs ? 'not_open' : 'open'

  async function control(action: 'open_now' | 'close_now' | 'extend' | 'reopen', minutes = 0) {
    if (action === 'close_now') {
      const ok = await confirm({
        title: '¿Cerrar la actividad ahora?',
        message: 'Los exámenes en curso se entregan con lo que tengan respondido. Nadie más podrá empezar.',
        confirmText: 'Cerrar ahora',
        danger: true,
      })
      if (!ok) return
    }
    try {
      setSt(await examControl(id, action, minutes))
      toast.success({ open_now: 'Actividad abierta', close_now: 'Actividad cerrada', extend: `+${minutes} min para todos`, reopen: `Reabierta por ${minutes} min` }[action])
    } catch (e) {
      toast.error('No se pudo completar', (e as Error).message)
    }
  }
  /** Cambia los intentos de TODOS (también de quienes aún no empezaron). Cuenta el mejor intento. */
  async function changeAttempts(delta: 1 | -1) {
    if (!st) return
    const next = st.session.max_attempts + delta
    if (next < 1 || next > 20) return
    const ok = await confirm({
      title: delta > 0 ? `¿Dar un intento más a todos? (${next} en total)` : `¿Quitar un intento a todos? (${next} en total)`,
      message:
        delta > 0
          ? 'Vale para todos los estudiantes, también para quienes aún no la empezaron. Cuenta el mejor intento, así que nadie baja su nota.'
          : 'Quien ya usó todos sus intentos no podrá volver a entrar. Los intentos ya hechos no se borran.',
      confirmText: delta > 0 ? 'Dar un intento más' : 'Quitar un intento',
      danger: delta < 0,
    })
    if (!ok) return
    const { error } = await supabase.from('sessions').update({ max_attempts: next }).eq('id', id)
    if (error) return toast.error('No se pudo cambiar', error.message)
    toast.success(delta > 0 ? `Ahora todos tienen ${next} intentos` : `Ahora todos tienen ${next} intento${next === 1 ? '' : 's'}`)
    void refresh()
  }
  async function act(r: MonitorRow, action: 'extra_time' | 'unlock' | 'grant_attempt' | 'force_submit' | 'kick' | 'device', minutes = 0) {
    if (!r.participant_id) return
    if (action === 'force_submit' || action === 'kick') {
      const ok = await confirm({
        title: action === 'kick' ? `¿Retirar a ${r.name}?` : `¿Entregar el examen de ${r.name}?`,
        message: action === 'kick' ? 'Ya no podrá seguir en esta actividad.' : 'Se califica con lo que tenga respondido.',
        confirmText: action === 'kick' ? 'Retirar' : 'Entregar',
        danger: true,
      })
      if (!ok) return
    }
    try {
      if (action === 'kick') {
        if (r.current) await examParticipant(r.participant_id, 'force_submit')
        await hostParticipant(r.participant_id, 'kick')
      } else if (action === 'device') await hostParticipant(r.participant_id, 'authorize_device')
      else await examParticipant(r.participant_id, action, minutes)
      toast.success(
        { extra_time: `+${minutes} min para ${r.name}`, unlock: `${r.name} fue desbloqueado`, grant_attempt: `${r.name} tiene un intento más`, force_submit: 'Examen entregado', kick: 'Participante retirado', device: `${r.name} ya puede entrar desde el otro equipo` }[action],
      )
      void refresh()
    } catch (e) {
      toast.error('No se pudo completar', (e as Error).message)
    }
  }

  async function exportExcel() {
    const roster = s.identification === 'roster'
    const head = [...(roster ? ['RU', 'Apellidos y nombres'] : ['Apodo']), 'Estado', 'Intentos', 'Nota (0-100)', 'Aciertos', 'Salidas de pestaña', 'Intentos de pegar', 'Última entrega', 'Cómo se entregó']
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const data = [
      [titleCell(`${s.quiz_title} — ${s.subject?.code} Paralelo ${s.subject?.parallel}`)],
      [`${s.mode === 'exam' ? 'Examen' : 'Tarea'} · ${s.opens_at ? fmtDateTime(s.opens_at) : ''} → ${s.closes_at ? fmtDateTime(s.closes_at) : 'sin cierre'} · ${s.question_count} preguntas por estudiante`],
      [],
      head.map(headerCell),
      ...sorted.map((r) => [
        ...(roster ? [r.code ?? '', r.name] : [r.name]),
        rowStatus(r).label,
        r.participant_id ? `${r.attempts_used}/${r.attempts_allowed}` : '',
        r.best_grade === null ? '' : Number(r.best_grade),
        r.best_correct === null ? '' : `${r.best_correct}/${s.question_count}`,
        r.focus_total,
        r.paste_total,
        r.last_submitted_at ? fmtDateTime(r.last_submitted_at) : '',
        r.last_reason ? (REASON_LABEL[r.last_reason] ?? r.last_reason) : '',
      ]),
    ]
    const blob = await buildWorkbook([
      { sheet: 'Resultados', data, columns: [{ width: 14 }, { width: 34 }, { width: 22 }, { width: 10 }, { width: 13 }, { width: 10 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 24 }], stickyRowsCount: 4 },
    ])
    downloadBlob(blob, `Resultados ${s.subject?.code ?? ''} ${s.quiz_title}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'))
  }

  const share = `Actividad "${s.quiz_title}" (${s.subject?.code}). Entra aquí con tu RU: ${url}  · PIN ${s.pin}${s.closes_at ? ` · Cierra: ${fmtDateTime(s.closes_at)}` : ''}`
  const filtered = rows.filter((r) => {
    const k = rowStatus(r).key
    if (filter === 'progress') return k === 'progress' || k === 'locked'
    if (filter === 'done') return k === 'done'
    if (filter === 'absent') return k === 'absent' || k === 'joined'
    if (filter === 'alerts') return r.focus_total > 0 || r.paste_total > 0 || k === 'locked'
    return true
  })

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      {projector && <ExamProjector st={st} now={now} pending={pending.length} onClose={() => setProjector(false)} />}
      <header className="glass relative z-10 mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-2.5">
        <Link to="/admin/sesiones" className="grid size-10 place-items-center rounded-xl hover:bg-ink/5" aria-label="Volver al panel">
          <ArrowLeft className="size-5" />
        </Link>
        <img src={BRAND.logoColor} alt="" className="size-10 rounded-xl bg-white object-contain p-0.5" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {s.mode === 'exam' ? 'Examen' : 'Tarea'} · {s.subject?.code} · Paralelo {s.subject?.parallel}
          </p>
          <p className="truncate font-display text-lg font-extrabold">{s.quiz_title}</p>
        </div>
        <Button size="sm" variant="gold" onClick={() => setProjector(true)} title="Reloj gigante con música de suspenso para el proyector">
          <Presentation className="size-4" /> Proyectar
        </Button>
        <Link to={`/admin/reportes/${id}`}>
          <Button size="sm" variant="secondary">
            Reporte
          </Button>
        </Link>
        <Button size="sm" variant="success" onClick={() => void exportExcel()}>
          <Download className="size-4" /> Excel
        </Button>
      </header>

      <main className="relative z-0 mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5">
        {pending.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-3xl bg-uap-gold/20 px-4 py-3 ring-2 ring-uap-gold">
            <MonitorSmartphone className="size-6 shrink-0 text-[#8a6416]" />
            <p className="min-w-0 flex-1 font-semibold">
              {pending.length === 1 ? 'Un estudiante quiere' : `${pending.length} estudiantes quieren`} entrar desde otro equipo (por ejemplo, se le colgó la PC). Si está bien, autorícelo: sigue donde se quedó.
            </p>
            {pending.map((r) => (
              <Button key={r.participant_id} size="sm" variant="gold" onClick={() => void act(r, 'device')}>
                Autorizar a {r.name.split(',')[1]?.trim().split(' ')[0] ?? r.name}
              </Button>
            ))}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* Acceso */}
          <SolidCard className="flex flex-col items-center gap-3 p-5 text-center">
            <div className="flex w-full items-center gap-4">
              <div className="rounded-2xl bg-white p-2 shadow-inner">
                <QRCodeSVG value={url} size={104} level="M" fgColor="#14213D" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">PIN</p>
                <p className="font-display text-4xl font-black tracking-[0.1em] text-uap-blue dark:text-white">{s.pin}</p>
                <p className="break-all text-xs text-ink-soft">{playUrl().replace(/^https?:\/\//, '')}</p>
              </div>
            </div>
            <div className="flex w-full gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(share)
                    .then(() => toast.success('Mensaje copiado', 'Pégalo en el grupo de la materia.'))
                    .catch(() => toast.error('No se pudo copiar'))
                }
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <a className="flex-1" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="success" className="w-full">
                  <Share2 className="size-4" /> WhatsApp
                </Button>
              </a>
            </div>
          </SolidCard>

          {/* Horario y control */}
          <SolidCard className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={win === 'open' ? 'green' : win === 'not_open' ? 'gold' : 'neutral'}>
                {win === 'open' ? '● Abierta' : win === 'not_open' ? 'Programada' : 'Cerrada'}
              </Badge>
              <p className="font-display text-2xl font-black tabular-nums">
                {win === 'not_open' && opensMs ? `Se abre en ${fmtLeft(opensMs - now)}` : win === 'open' ? (closesMs ? `Cierra en ${fmtLeft(closesMs - now)}` : 'Sin hora de cierre') : 'Ya no recibe respuestas'}
              </p>
            </div>
            <p className="text-sm text-ink-soft">
              {s.opens_at ? `Abre: ${fmtDateTime(s.opens_at)}` : 'Abierta desde su creación'} · {s.closes_at ? `Cierra: ${fmtDateTime(s.closes_at)}` : 'sin cierre automático'}
            </p>
            <div className="flex flex-wrap gap-2">
              {win === 'not_open' && (
                <Button size="sm" variant="success" onClick={() => void control('open_now')}>
                  <Play className="size-4" /> Abrir ahora
                </Button>
              )}
              {win === 'open' && closesMs && (
                <Button size="sm" variant="secondary" onClick={() => void control('extend', 10)}>
                  <Plus className="size-4" /> 10 min a todos
                </Button>
              )}
              {win !== 'closed' && (
                <Button size="sm" variant="danger" onClick={() => void control('close_now')}>
                  <Square className="size-4" /> Cerrar ahora
                </Button>
              )}
              {win === 'closed' && (
                <Button size="sm" variant="secondary" onClick={() => void control('reopen', 30)}>
                  <RotateCcw className="size-4" /> Reabrir 30 min
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void changeAttempts(1)} title="Da un intento más a todos los estudiantes">
                <Repeat className="size-4" /> +1 intento a todos
              </Button>
              {s.max_attempts > 1 && (
                <Button size="sm" variant="ghost" onClick={() => void changeAttempts(-1)} title="Quita un intento a todos" aria-label="Quitar un intento a todos">
                  <Minus className="size-4" /> 1 intento
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Chip>{s.time_limit_sec ? `⏱ ${Math.round(s.time_limit_sec / 60)} min por estudiante` : '⏱ sin límite de tiempo'}</Chip>
              <Chip>{s.pick_count ? `🎲 ${s.pick_count} al azar de ${s.total}` : `${s.total} preguntas`}</Chip>
              <Chip>{s.max_attempts === 1 ? '1 intento' : `${s.max_attempts} intentos (cuenta el mejor)`}</Chip>
              {(s.shuffle_questions || s.shuffle_options) && <Chip>🔀 orden mezclado</Chip>}
              {s.focus_mode && <Chip>🛡 modo enfoque{s.lock_after ? ` · bloquea a las ${s.lock_after} salidas` : ''}</Chip>}
              {s.require_ci && <Chip>🪪 CI</Chip>}
              <Chip>✔ correctas: {SHOW_CORRECT_LABEL[s.show_correct].replace(' (recomendado)', '').toLowerCase()}</Chip>
            </div>
          </SolidCard>
        </div>

        {/* Números */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={s.identification === 'roster' ? 'Entraron' : 'Participantes'} value={s.identification === 'roster' ? `${stats.present}/${stats.enrolled}` : String(stats.present)} />
          <Stat label="En curso" value={String(stats.progress)} tone="green" />
          <Stat label="Entregaron" value={String(stats.done)} />
          <Stat label="Promedio" value={stats.avg === null ? '—' : String(stats.avg)} />
          <Stat label={`Aprobados (≥${s.pass_mark})`} value={`${stats.passed}/${stats.done}`} />
          <Stat label="Con alertas" value={String(stats.alerts)} tone={stats.alerts ? 'red' : undefined} />
        </div>

        {/* Tabla */}
        <SolidCard className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-line p-2">
            {(
              [
                ['all', 'Todos'],
                ['progress', 'En curso'],
                ['done', 'Entregaron'],
                ['absent', 'Sin empezar'],
                ['alerts', 'Alertas'],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={cn('rounded-xl px-3 py-1.5 text-sm font-semibold', filter === k ? 'bg-uap-blue text-white' : 'text-ink-soft hover:bg-ink/5')}>
                {l}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-2">Estudiante</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Progreso</th>
                  <th className="px-4 py-2">Tiempo</th>
                  <th className="px-4 py-2">Alertas</th>
                  <th className="px-4 py-2 text-right">Nota</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <Row key={r.participant_id ?? r.student_id ?? r.name} r={r} now={now} questionCount={s.question_count} pass={s.pass_mark} onAct={act} />
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-ink-soft">
                      Nadie en esta lista.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SolidCard>
      </main>
    </div>
  )
}

function Row({
  r,
  now,
  questionCount,
  pass,
  onAct,
}: {
  r: MonitorRow
  now: number
  questionCount: number
  pass: number
  onAct: (r: MonitorRow, a: 'extra_time' | 'unlock' | 'grant_attempt' | 'force_submit' | 'kick' | 'device', m?: number) => void
}) {
  const [menu, setMenu] = useState(false)
  const st = rowStatus(r)
  const c = r.current
  const left = c?.deadline ? new Date(c.deadline).getTime() - now : null
  const cls = {
    absent: 'bg-ink/10 text-ink-soft',
    kicked: 'bg-ink/10 text-ink-soft line-through',
    joined: 'bg-uap-blue/10 text-uap-blue dark:text-game-electric',
    progress: 'bg-game-selva/15 text-uap-green dark:text-game-selva',
    locked: 'bg-uap-red text-white',
    done: 'bg-uap-blue text-white',
  }[st.key]
  return (
    <tr className={cn('border-t border-line', st.key === 'absent' && 'opacity-60')}>
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-2">
          {r.avatar ? <AvatarBubble avatar={r.avatar} size="sm" /> : <span className="size-9 shrink-0 rounded-full bg-ink/10" />}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{r.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
              {r.code && `RU ${r.code}`}
              {r.participant_id && <span className={cn('size-2 rounded-full', r.connected ? 'bg-game-selva' : 'bg-ink/25')} title={r.connected ? 'Conectado' : 'Desconectado'} />}
            </span>
          </span>
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', cls)}>
          {st.key === 'locked' && <Lock className="size-3" />}
          {st.key === 'done' && <CheckCircle2 className="size-3" />}
          {st.label}
        </span>
        {r.participant_id && r.attempts_allowed > 1 && <span className="ml-1 text-xs text-ink-soft">({r.attempts_used}/{r.attempts_allowed})</span>}
      </td>
      <td className="px-4 py-2.5">
        {c ? (
          <span className="flex items-center gap-2">
            <span className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
              <span className="block h-full rounded-full bg-game-selva" style={{ width: `${(c.answered / Math.max(1, c.total)) * 100}%` }} />
            </span>
            <span className="tabular-nums">
              {c.answered}/{c.total}
            </span>
          </span>
        ) : r.best_correct !== null ? (
          <span className="tabular-nums text-ink-soft">
            {r.best_correct}/{questionCount} correctas
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-2.5 tabular-nums">
        {left !== null ? (
          <span className={cn('flex items-center gap-1', left < 60000 && 'font-bold text-game-coral')}>
            <Clock className="size-3.5" /> {fmtLeft(left)}
          </span>
        ) : c ? (
          'sin límite'
        ) : r.last_submitted_at ? (
          <span className="text-xs text-ink-soft">{fmtDateTime(r.last_submitted_at)}</span>
        ) : (
          '—'
        )}
        {r.extra_time_sec > 0 && <span className="ml-1 text-xs font-semibold text-uap-gold">+{Math.round(r.extra_time_sec / 60)} min</span>}
      </td>
      <td className="px-4 py-2.5">
        {r.focus_total > 0 || r.paste_total > 0 ? (
          <span className="flex items-center gap-1 font-semibold text-game-coral" title="Salidas de la pestaña / intentos de pegar">
            <AlertTriangle className="size-4" /> {r.focus_total} salida{r.focus_total === 1 ? '' : 's'}
            {r.paste_total > 0 && ` · ${r.paste_total} pegar`}
          </span>
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </td>
      <td className={cn('px-4 py-2.5 text-right font-display text-lg font-black tabular-nums', r.best_grade !== null && (Number(r.best_grade) >= pass ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral'))}>
        {r.best_grade === null ? '—' : Math.round(Number(r.best_grade) * 10) / 10}
      </td>
      <td className="relative px-2 py-2.5">
        {r.participant_id && !r.kicked && (
          <>
            {r.takeover_pending ? (
              <button
                onClick={() => onAct(r, 'device')}
                className="flex animate-pulse items-center gap-1 whitespace-nowrap rounded-lg bg-uap-gold px-2 py-1.5 text-xs font-black text-uap-blue-900"
                aria-label={`Autorizar a ${r.name} a entrar desde otro equipo`}
                title="Quiere entrar desde otro equipo"
              >
                <MonitorSmartphone className="size-4" /> Cambiar de equipo
              </button>
            ) : c?.locked ? (
              <button onClick={() => onAct(r, 'unlock')} className="rounded-lg bg-uap-red p-1.5 text-white" aria-label={`Desbloquear a ${r.name}`} title="Desbloquear">
                <Unlock className="size-4" />
              </button>
            ) : (
              <button onClick={() => setMenu((m) => !m)} className="rounded-lg p-1.5 text-ink-soft hover:bg-ink/5" aria-label={`Acciones para ${r.name}`}>
                <MoreVertical className="size-4" />
              </button>
            )}
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-2 top-10 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-surface-2 py-1 shadow-xl">
                  <Item icon={<Plus className="size-4" />} onClick={() => (setMenu(false), onAct(r, 'extra_time', 5))}>
                    +5 min de tiempo extra
                  </Item>
                  <Item icon={<MonitorSmartphone className="size-4" />} onClick={() => (setMenu(false), onAct(r, 'device'))}>
                    Liberar su equipo (cambiar de PC)
                  </Item>
                  <Item icon={<RotateCcw className="size-4" />} onClick={() => (setMenu(false), onAct(r, 'grant_attempt'))}>
                    Permitir otro intento
                  </Item>
                  {c && (
                    <Item icon={<Send className="size-4" />} onClick={() => (setMenu(false), onAct(r, 'force_submit'))}>
                      Entregar ahora
                    </Item>
                  )}
                  <Item danger icon={<UserX className="size-4" />} onClick={() => (setMenu(false), onAct(r, 'kick'))}>
                    Retirar
                  </Item>
                </div>
              </>
            )}
          </>
        )}
      </td>
    </tr>
  )
}

const Item = ({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={cn('flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-ink/5', danger && 'text-uap-red dark:text-game-coral')}>
    {icon} {children}
  </button>
)
const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-full bg-ink/5 px-2.5 py-1 font-semibold">{children}</span>
const Stat = ({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) => (
  <SolidCard className="p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
    <p className={cn('font-display text-3xl font-black tabular-nums', tone === 'green' && 'text-uap-green dark:text-game-selva', tone === 'red' && 'text-game-coral')}>{value}</p>
  </SolidCard>
)
