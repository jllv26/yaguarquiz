import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CloudOff,
  CloudUpload,
  Download,
  FileText,
  Flame,
  ListChecks,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Sheet,
  UserX,
  Users,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Badge, Select, Skeleton, Textarea } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { useGradingPlan } from '../../lib/api/academic'
import {
  adjustGrade,
  DIFFICULT_PCT,
  fetchAnswers,
  fmtSecs,
  MODE_LABEL,
  questionPct,
  setSessionItem,
  stats,
  topDistractor,
  TYPE_LABEL,
  useAnswers,
  useSessionReport,
  type ReportStudent,
  type SessionReport,
} from '../../lib/api/reports'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/dates'
import { buildWorkbook, downloadBlob, headerCell, titleCell } from '../../lib/excel'
import { syncSession, useSheetsSettings } from '../../lib/sheets'
import { TERM_LABEL } from '../academic/gradingDefaults'
import { AvatarBubble } from '../live/LiveBits'
import { useAutoSync } from './useAutoSync'

type Tab = 'students' | 'questions' | 'absent'
const roster0 = (s: SessionReport['session']) => s.identification === 'roster'

export function SessionReportPage() {
  const { id = '' } = useParams()
  const rep = useSessionReport(id)
  const [tab, setTab] = useState<Tab>('students')
  if (rep.isLoading) return <Skeleton className="h-96" />
  if (rep.error || !rep.data)
    return (
      <SolidCard className="p-8 text-center">
        <p className="font-display text-xl font-bold">No se pudo cargar el reporte</p>
        <p className="text-ink-soft">{(rep.error as Error | null)?.message}</p>
      </SolidCard>
    )
  return <Report rep={rep.data} tab={tab} setTab={setTab} refresh={() => void rep.refetch()} />
}

function Report({ rep, tab, setTab, refresh }: { rep: SessionReport; tab: Tab; setTab: (t: Tab) => void; refresh: () => void }) {
  const s = rep.session
  const st = useMemo(() => stats(rep), [rep])
  const difficult = rep.questions.filter((q) => {
    const p = questionPct(q)
    return p !== null && p < DIFFICULT_PCT
  })
  useAutoSync(s.id, s.done && roster0(s), !!s.last_sync, refresh)
  const [detail, setDetail] = useState<ReportStudent | null>(null)
  const [adjust, setAdjust] = useState<ReportStudent | null>(null)
  const roster = s.identification === 'roster'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/admin/reportes" className="mt-1 grid size-10 place-items-center rounded-xl hover:bg-ink/5" aria-label="Volver a reportes">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: s.subject.theme_color ?? '#1B7339' }}>
            {s.subject.code} · Paralelo {s.subject.parallel} · {s.period}
          </p>
          <h1 className="font-display text-3xl font-black leading-tight">{s.quiz_title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <Badge tone="neutral">{MODE_LABEL[s.mode]}</Badge>
            {!s.done && <Badge tone="gold">Todavía abierta: los números pueden cambiar</Badge>}
            <span>{fmtDateTime(s.opens_at ?? s.created_at)}</span>
            {s.topic && <span>· Tema: {s.topic}</span>}
          </p>
        </div>
        <Exports rep={rep} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={<Users className="size-4" />} label="Participación" value={st.enrolled !== null ? `${st.participants}/${st.enrolled}` : String(st.participants)} />
          <Kpi label="Promedio" value={st.avg ?? '—'} tone={st.avg !== null && st.avg < s.pass_mark ? 'bad' : 'good'} />
          <Kpi label="Mediana" value={st.median ?? '—'} />
          <Kpi label="Máxima / mínima" value={st.max === null ? '—' : `${Math.round(st.max)} / ${Math.round(st.min ?? 0)}`} />
          <Kpi label={`Aprobados (≥${s.pass_mark})`} value={st.passPct === null ? '—' : `${st.pass} · ${st.passPct} %`} />
          <Kpi icon={<Clock className="size-4" />} label="Tiempo promedio" value={fmtSecs(st.avgTimeMs)} />
        </div>
        <SolidCard className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Distribución de notas</p>
          <Histogram buckets={st.buckets} pass={s.pass_mark} />
        </SolidCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ItemLink rep={rep} onChange={refresh} />
        <SyncCard rep={rep} onDone={refresh} />
      </div>

      {difficult.length > 0 && (
        <SolidCard className="flex items-start gap-3 border-l-8 border-l-game-coral p-4">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-game-coral" />
          <div>
            <p className="font-display font-bold">
              {difficult.length === 1 ? '1 pregunta difícil' : `${difficult.length} preguntas difíciles`} (menos del {DIFFICULT_PCT} % de acierto): conviene repasarlas en clase
            </p>
            <ul className="mt-1 text-sm text-ink-soft">
              {difficult.map((q) => (
                <li key={q.id}>
                  <strong>
                    {q.index}. {q.prompt}
                  </strong>{' '}
                  — {questionPct(q)} % de acierto
                  {topDistractor(q) ? `; muchos respondieron “${topDistractor(q)}”` : ''}
                </li>
              ))}
            </ul>
          </div>
        </SolidCard>
      )}

      <nav className="flex gap-2" role="tablist">
        {(
          [
            ['students', `Estudiantes (${rep.students.length})`, <Users key="u" className="size-4" />],
            ['questions', `Preguntas (${rep.questions.length})`, <ListChecks key="q" className="size-4" />],
            ...(roster ? [['absent', `Ausentes (${rep.absent.length})`, <UserX key="a" className="size-4" />]] : []),
          ] as [Tab, string, ReactNode][]
        ).map(([k, l, icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('flex items-center gap-2 rounded-2xl px-4 py-2 font-semibold transition', tab === k ? 'bg-uap-blue text-white shadow-md dark:bg-game-electric' : 'glass text-ink-soft hover:text-ink')}
          >
            {icon} {l}
          </button>
        ))}
      </nav>

      {tab === 'students' && <StudentsTable rep={rep} onDetail={setDetail} onAdjust={setAdjust} />}
      {tab === 'questions' && <QuestionsList rep={rep} />}
      {tab === 'absent' && (
        <SolidCard className="p-5">
          {rep.absent.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">
              {rep.absent.map((a) => (
                <li key={a.student_id} className="flex justify-between rounded-xl bg-ink/[0.03] px-3 py-2 text-sm">
                  <span>{a.name}</span>
                  <span className="text-ink-soft">RU {a.code}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-ink-soft">Participaron todos los inscritos. 🎉</p>
          )}
        </SolidCard>
      )}

      <StudentAnswersModal rep={rep} student={detail} onClose={() => setDetail(null)} />
      <AdjustModal student={adjust} onClose={() => setAdjust(null)} onDone={refresh} />
    </div>
  )
}

function Kpi({ label, value, icon, tone }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <SolidCard className="p-4">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
        {icon} {label}
      </p>
      <p className={cn('font-display text-2xl font-black tabular-nums', tone === 'bad' && 'text-uap-red dark:text-game-coral', tone === 'good' && 'text-uap-green dark:text-game-selva')}>{value}</p>
    </SolidCard>
  )
}

function Histogram({ buckets, pass }: { buckets: { from: number; to: number; count: number }[]; pass: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="flex h-32 items-end gap-1" role="img" aria-label="Cantidad de estudiantes por tramo de nota">
      {buckets.map((b) => (
        <div key={b.from} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-bold tabular-nums">{b.count || ''}</span>
          <motion.div
            initial={{ height: 2 }}
            animate={{ height: 2 + (b.count / max) * 80 }}
            className={cn('w-full rounded-t-md', b.to < pass ? 'bg-uap-red/80' : 'bg-uap-green')}
            title={`${b.from}–${b.to}: ${b.count}`}
          />
          <span className="text-[10px] text-ink-soft">{b.from}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- vincular con el plan
function ItemLink({ rep, onChange }: { rep: SessionReport; onChange: () => void }) {
  const s = rep.session
  const toast = useToast()
  const qc = useQueryClient()
  const plan = useGradingPlan(s.subject.id)
  const items = (plan.data?.grading_items ?? []).filter((i) => i.source === 'yaguarquiz').sort((a, b) => a.term - b.term || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (s.identification !== 'roster') {
    return (
      <SolidCard className="p-4 text-sm text-ink-soft">
        Esta sesión fue con apodos: no cuenta para la libreta de notas.
      </SolidCard>
    )
  }
  return (
    <SolidCard className="flex flex-col gap-2 p-4">
      <Select
        label="¿A qué nota de la libreta corresponde?"
        value={s.grading_item?.id ?? ''}
        onChange={async (e) => {
          try {
            await setSessionItem(s.id, e.target.value || null)
            toast.success(e.target.value ? 'Vinculada a la libreta' : 'Ya no cuenta para la libreta')
            void qc.invalidateQueries({ queryKey: ['gradebook', s.subject.id] })
            onChange()
          } catch (err) {
            toast.error('No se pudo cambiar', (err as Error).message)
          }
        }}
      >
        <option value="">— Solo práctica, no cuenta para la nota —</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {TERM_LABEL(i.term)} · {i.category} ({i.weight} pts)
          </option>
        ))}
      </Select>
      <Link to={`/admin/asignaturas/${s.subject.id}?tab=libreta`} className="text-sm font-semibold text-uap-blue underline dark:text-game-electric">
        Ver la libreta de notas de {s.subject.code}
      </Link>
    </SolidCard>
  )
}

// ---------------------------------------------------------------- Google Sheets
function SyncCard({ rep, onDone }: { rep: SessionReport; onDone: () => void }) {
  const toast = useToast()
  const settings = useSheetsSettings()
  const [busy, setBusy] = useState(false)
  const last = rep.session.last_sync
  const configured = !!settings.data?.sheets_webapp_url && !!settings.data?.sheets_token
  async function sync() {
    if (!settings.data) return
    setBusy(true)
    try {
      const r = await syncSession(rep.session.id, settings.data)
      if (r.ok) toast.success('Enviado a Google Sheets', 'Se actualizaron las 4 hojas sin duplicar filas.')
      else toast.error('No se pudo enviar', r.message)
      onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <SolidCard className="flex flex-wrap items-center gap-3 p-4">
      <Sheet className="size-8 text-uap-green" />
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold">Google Sheets</p>
        <p className="text-sm text-ink-soft">
          {!configured ? (
            <>
              Aún no está conectado.{' '}
              <Link to="/admin/configuracion" className="font-semibold text-uap-blue underline dark:text-game-electric">
                Configurar
              </Link>
            </>
          ) : last ? (
            <span className={cn('inline-flex items-center gap-1', last.status === 'error' && 'text-game-coral')}>
              {last.status === 'ok' ? <CheckCircle2 className="size-4 text-uap-green" /> : <CloudOff className="size-4" />}
              {last.status === 'ok' ? `Enviado el ${fmtDateTime(last.at)}` : `Falló el ${fmtDateTime(last.at)}: ${last.error ?? ''}`}
            </span>
          ) : (
            'Todavía no se envió.'
          )}
        </p>
      </div>
      {configured && (
        <Button size="sm" variant={last?.status === 'ok' ? 'secondary' : 'success'} onClick={() => void sync()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : last ? <RefreshCw className="size-4" /> : <CloudUpload className="size-4" />}
          {last ? 'Re-sincronizar' : 'Enviar ahora'}
        </Button>
      )}
    </SolidCard>
  )
}

// ---------------------------------------------------------------- estudiantes
function StudentsTable({ rep, onDetail, onAdjust }: { rep: SessionReport; onDetail: (s: ReportStudent) => void; onAdjust: (s: ReportStudent) => void }) {
  const s = rep.session
  const [sort, setSort] = useState<'name' | 'grade'>('grade')
  const rows = [...rep.students].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'es') : Number(b.grade ?? -1) - Number(a.grade ?? -1)))
  return (
    <SolidCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-ink-soft">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">
                <button onClick={() => setSort('name')} className={cn(sort === 'name' && 'text-ink')}>
                  Estudiante
                </button>
              </th>
              <th className="px-4 py-2 text-right">
                <button onClick={() => setSort('grade')} className={cn(sort === 'grade' && 'text-ink')}>
                  Nota
                </button>
              </th>
              <th className="px-4 py-2 text-right">Aciertos</th>
              <th className="px-4 py-2 text-right">Puntos</th>
              <th className="px-4 py-2 text-right">Tiempo</th>
              <th className="px-4 py-2">Alertas</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const g = r.grade === null ? null : Number(r.grade)
              return (
                <tr key={r.participant_id} className={cn('border-t border-line', r.kicked && 'opacity-50')}>
                  <td className="px-4 py-2 text-ink-soft">{i + 1}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <AvatarBubble avatar={r.avatar} size="sm" />
                      <span>
                        <span className="block font-semibold">{r.name}</span>
                        <span className="text-xs text-ink-soft">
                          {r.code ? `RU ${r.code}` : 'apodo'}
                          {r.attempts > 1 && ` · ${r.attempts} intentos`}
                          {r.kicked && ' · retirado'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={cn('px-4 py-2 text-right font-display text-lg font-black tabular-nums', g !== null && (g >= s.pass_mark ? 'text-uap-green dark:text-game-selva' : 'text-uap-red dark:text-game-coral'))}>
                    {g === null ? '—' : Math.round(g * 10) / 10}
                    {r.adjusted !== null && (
                      <span className="ml-1 align-super text-[10px] font-bold text-uap-gold" title={`Ajustada (antes ${r.computed ?? '—'}): ${r.adjust_reason}`}>
                        AJ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.correct ?? '—'}/{s.question_count}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.points?.toLocaleString('es-BO') ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtSecs(r.time_ms)}</td>
                  <td className="px-4 py-2">
                    {r.tab_switches || r.pastes ? (
                      <span className="flex items-center gap-1 font-semibold text-game-coral">
                        <Flame className="size-4" /> {r.tab_switches} salida{r.tab_switches === 1 ? '' : 's'}
                        {r.pastes ? ` · ${r.pastes} pegar` : ''}
                      </span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => onDetail(r)}>
                        Respuestas
                      </Button>
                      {s.identification === 'roster' && (
                        <button onClick={() => onAdjust(r)} className="rounded-lg p-2 text-ink-soft hover:bg-ink/5" aria-label={`Ajustar la nota de ${r.name}`} title="Ajustar nota">
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SolidCard>
  )
}

function StudentAnswersModal({ rep, student, onClose }: { rep: SessionReport; student: ReportStudent | null; onClose: () => void }) {
  const answers = useAnswers(rep.session.id, !!student)
  const mine = (answers.data ?? []).filter((a) => a.participant_id === student?.participant_id)
  return (
    <Modal open={!!student} onClose={onClose} title={student?.name ?? ''} subtitle={student ? `Nota ${student.grade ?? '—'} · ${student.correct ?? 0}/${rep.session.question_count} correctas` : ''} size="lg">
      {answers.isLoading ? (
        <Loader2 className="mx-auto size-8 animate-spin text-uap-green" />
      ) : (
        <ol className="flex flex-col gap-2">
          {rep.questions
            .filter((q) => rep.session.mode === 'live' || mine.some((a) => a.question_id === q.id))
            .map((q) => {
              const a = mine.find((x) => x.question_id === q.id)
              return (
                <li key={q.id} className={cn('rounded-2xl border-l-4 bg-ink/[0.03] p-3', !a ? 'border-l-ink/30' : a.correct ? 'border-l-uap-green' : a.partial > 0 ? 'border-l-[#c98a00]' : 'border-l-uap-red')}>
                  <p className="font-semibold">
                    {q.index}. {q.prompt}
                  </p>
                  <p className="text-sm">
                    {a ? (
                      <>
                        <span className="text-ink-soft">Respondió: </span>
                        <span className="font-semibold">{a.answer}</span>
                        <span className="ml-2 text-ink-soft">
                          {a.correct ? '✔ correcta' : a.partial > 0 ? `◐ ${Math.round(a.partial * 100)} %` : '✘ incorrecta'}
                          {rep.session.mode === 'live' && a.time_ms ? ` · ${fmtSecs(a.time_ms)}` : ''} · {a.points} pts
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-soft">Sin responder</span>
                    )}
                  </p>
                </li>
              )
            })}
          {rep.session.mode !== 'live' && !mine.length && <p className="text-center text-ink-soft">No respondió ninguna pregunta.</p>}
        </ol>
      )}
    </Modal>
  )
}

function AdjustModal({ student, onClose, onDone }: { student: ReportStudent | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [score, setScore] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const key = student?.participant_id
  const [lastKey, setLastKey] = useState<string | undefined>(undefined)
  if (key !== lastKey) {
    setLastKey(key)
    setScore(student?.grade !== null && student?.grade !== undefined ? String(Math.round(Number(student.grade) * 10) / 10) : '')
    setReason('')
  }
  async function save() {
    if (!student) return
    const n = Number(score.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error('La nota debe estar entre 0 y 100')
    if (reason.trim().length < 3) return toast.error('Escriba el motivo del ajuste')
    setBusy(true)
    try {
      await adjustGrade(student.participant_id, n, reason)
      toast.success('Nota ajustada', 'El cambio queda registrado con su motivo.')
      onDone()
      onClose()
    } catch (e) {
      toast.error('No se pudo ajustar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={!!student}
      onClose={onClose}
      title="Ajustar nota"
      subtitle={student?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            Guardar ajuste
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          Nota calculada por el sistema: <strong>{student?.computed ?? '—'}</strong>
          {student?.adjusted !== null && student?.adjusted !== undefined && (
            <>
              {' '}
              · ajuste actual: <strong>{student.adjusted}</strong> ({student.adjust_reason})
            </>
          )}
        </p>
        <Input label="Nueva nota (0 a 100)" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
        <Textarea label="Motivo (queda registrado)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: se le cortó la luz en la pregunta 5; se revisó su respuesta escrita" rows={3} />
        <p className="text-xs text-ink-soft">Para volver a la nota calculada, escriba {student?.computed ?? 'la nota calculada'} con el motivo “Restaurar nota calculada”.</p>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- preguntas
function QuestionsList({ rep }: { rep: SessionReport }) {
  return (
    <div className="flex flex-col gap-3">
      {rep.questions.map((q) => {
        const pct = questionPct(q)
        const hard = pct !== null && pct < DIFFICULT_PCT
        const total = Math.max(1, q.options.reduce((n, o) => n + o.count, 0))
        return (
          <SolidCard key={q.id} className={cn('p-4', hard && 'ring-2 ring-game-coral/60')}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-uap-blue font-display font-bold text-white">{q.index}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">{q.prompt}</p>
                <p className="text-xs text-ink-soft">
                  {TYPE_LABEL[q.type]} · respondieron {q.answered}
                  {q.avg_time_ms ? ` · tiempo promedio ${fmtSecs(Number(q.avg_time_ms))}` : ''}
                </p>
              </div>
              <div className="w-40 text-right">
                <p className={cn('font-display text-2xl font-black tabular-nums', hard ? 'text-game-coral' : 'text-uap-green dark:text-game-selva')}>{pct === null ? '—' : `${pct} %`}</p>
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className={cn('h-full rounded-full', hard ? 'bg-game-coral' : 'bg-uap-green')} style={{ width: `${pct ?? 0}%` }} />
                </div>
                {hard && <p className="mt-1 text-xs font-bold text-game-coral">Difícil: repasar</p>}
              </div>
            </div>
            {q.options.length > 0 && q.type !== 'ordering' && (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o) => (
                  <li key={o.key} className="flex items-center gap-2 text-sm">
                    <span className={cn('w-5 text-center', o.is_correct ? 'text-uap-green' : 'text-ink-soft')}>{o.is_correct ? '✔' : '·'}</span>
                    <span className={cn('min-w-0 flex-1 truncate', o.is_correct && 'font-semibold')}>{o.text || 'Imagen'}</span>
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                      <span className={cn('block h-full', o.is_correct ? 'bg-uap-green' : 'bg-uap-red/70')} style={{ width: `${(o.count / total) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{o.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {topDistractor(q) && !q.options.length && (
              <p className="mt-2 text-sm text-ink-soft">
                Respuesta incorrecta más frecuente: <strong>{topDistractor(q)}</strong> · aceptadas: {(q.accepted_answers ?? []).join(', ')}
              </p>
            )}
          </SolidCard>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- exportar
function Exports({ rep }: { rep: SessionReport }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const s = rep.session
  const base = `Reporte ${s.subject.code} ${s.subject.parallel} ${s.quiz_title}`.replace(/[\\/:*?"<>|]/g, '-')
  const roster = s.identification === 'roster'

  async function excel() {
    setBusy(true)
    try {
      const st = stats(rep)
      const answers = await fetchAnswers(s.id)
      const students = [...rep.students].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      const sheets = [
        {
          sheet: 'Resumen',
          data: [
            [titleCell(`${s.quiz_title} — ${s.subject.code} Paralelo ${s.subject.parallel}`)],
            [`${s.subject.name} · ${s.period} · ${MODE_LABEL[s.mode]} · ${fmtDateTime(s.opens_at ?? s.created_at)}`],
            [],
            [headerCell('Indicador'), headerCell('Valor')],
            ['Participantes', st.participants],
            ...(st.enrolled !== null ? [['Inscritos', st.enrolled]] : []),
            ['Promedio', st.avg ?? ''],
            ['Mediana', st.median ?? ''],
            ['Nota máxima', st.max ?? ''],
            ['Nota mínima', st.min ?? ''],
            [`Aprobados (≥${s.pass_mark})`, st.pass],
            ['% de aprobación', st.passPct ?? ''],
            ['Tiempo promedio', fmtSecs(st.avgTimeMs)],
            ['Categoría del plan', s.grading_item ? `${TERM_LABEL(s.grading_item.term)} · ${s.grading_item.category}` : 'Sin nota'],
          ],
          columns: [{ width: 28 }, { width: 40 }],
        },
        {
          sheet: 'Estudiantes',
          data: [
            [...(roster ? ['RU', 'Apellidos y nombres'] : ['Apodo']), 'Nota (0-100)', 'Nota calculada', 'Motivo del ajuste', 'Aciertos', 'Puntos', 'Tiempo (s)', 'Salidas de pestaña', 'Pegar', 'Intentos'].map(headerCell),
            ...students.map((r) => [
              ...(roster ? [r.code ?? '', r.name] : [r.name]),
              r.grade === null ? '' : Number(r.grade),
              r.computed === null ? '' : Number(r.computed),
              r.adjust_reason ?? '',
              r.correct ?? '',
              r.points ?? '',
              r.time_ms ? Math.round(r.time_ms / 1000) : '',
              r.tab_switches,
              r.pastes,
              r.attempts || '',
            ]),
            ...(roster ? rep.absent.map((a) => [a.code, a.name, 'Ausente']) : []),
          ],
          columns: [{ width: 14 }, { width: 34 }, { width: 12 }, { width: 14 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 8 }, { width: 9 }],
          stickyRowsCount: 1,
        },
        {
          sheet: 'Preguntas',
          data: [
            ['N°', 'Pregunta', 'Tipo', 'Respondieron', 'Aciertos', '% Acierto', 'Respuesta incorrecta más elegida', '¿Difícil?'].map(headerCell),
            ...rep.questions.map((q) => {
              const p = questionPct(q)
              return [q.index, q.prompt, TYPE_LABEL[q.type], q.answered, q.correct, p ?? '', topDistractor(q) ?? '', p !== null && p < DIFFICULT_PCT ? 'Sí' : 'No']
            }),
          ],
          columns: [{ width: 5 }, { width: 50 }, { width: 16 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 30 }, { width: 9 }],
          stickyRowsCount: 1,
        },
        {
          sheet: 'Respuestas',
          data: [
            ['RU', 'Estudiante', 'N°', 'Pregunta', 'Respuesta', '¿Correcta?', 'Crédito (%)', 'Tiempo (s)', 'Puntos'].map(headerCell),
            ...answers.map((a) => [a.code ?? '', a.name, a.question_index, a.prompt, a.answer ?? '', a.correct ? 'Sí' : 'No', Math.round(a.partial * 100), s.mode === 'live' && a.time_ms ? Math.round(a.time_ms / 100) / 10 : '', a.points]),
          ],
          columns: [{ width: 12 }, { width: 30 }, { width: 5 }, { width: 40 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 8 }],
          stickyRowsCount: 1,
        },
      ]
      downloadBlob(await buildWorkbook(sheets), `${base}.xlsx`)
    } catch (e) {
      toast.error('No se pudo generar el Excel', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function csv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      [...(roster ? ['RU', 'Apellidos y nombres'] : ['Apodo']), 'Nota', 'Aciertos', 'Puntos', 'Tiempo (s)', 'Salidas de pestaña'],
      ...rep.students.map((r) => [...(roster ? [r.code, r.name] : [r.name]), r.grade ?? '', r.correct ?? '', r.points ?? '', r.time_ms ? Math.round(r.time_ms / 1000) : '', r.tab_switches]),
    ]
    // ; como separador y BOM para que Excel en español lo abra bien
    const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `${base}.csv`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="success" onClick={() => void excel()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Excel
      </Button>
      <Button size="sm" variant="secondary" onClick={csv}>
        <FileText className="size-4" /> CSV
      </Button>
      <a href={`#/reporte/${s.id}/imprimir`} target="_blank" rel="noreferrer">
        <Button size="sm" variant="secondary">
          <Printer className="size-4" /> PDF
        </Button>
      </a>
    </div>
  )
}
