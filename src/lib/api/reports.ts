import { useQuery } from '@tanstack/react-query'
import type { GbData } from '../gradebook'
import { friendlyError, supabase } from '../supabase'
import type { Avatar, QType } from './live'

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export interface ReportListRow {
  id: string
  mode: 'live' | 'exam' | 'homework'
  pin: string
  date: string
  identification: 'roster' | 'nickname'
  done: boolean
  quiz_title: string
  subject_id: string
  code: string
  parallel: string
  subject_name: string
  theme_color: string | null
  participants: number
  average: number | null
  sync_status: 'ok' | 'error' | null
  grading_item_id: string | null
}

export interface ReportStudent {
  participant_id: string
  student_id: string | null
  code: string | null
  name: string
  nickname: string
  avatar: Avatar
  kicked: boolean
  computed: number | null
  adjusted: number | null
  adjust_reason: string | null
  grade: number | null
  correct: number | null
  points: number | null
  time_ms: number | null
  tab_switches: number
  pastes: number
  attempts: number
  submit_reason: string | null
  submitted_at: string | null
}
export interface ReportQuestion {
  id: string
  index: number
  type: QType
  prompt: string
  base_points: number
  answered: number
  correct: number
  avg_partial: number | null
  avg_time_ms: number | null
  accepted_answers: string[] | null
  options: { key: string; text: string; image_url: string | null; is_correct: boolean; count: number }[]
  top_wrong_text: string | null
}
export interface SessionReport {
  session: {
    id: string
    pin: string
    mode: 'live' | 'exam' | 'homework'
    status: string
    done: boolean
    created_at: string
    finished_at: string | null
    opens_at: string | null
    closes_at: string | null
    identification: 'roster' | 'nickname'
    question_count: number
    quiz_id: string
    quiz_title: string
    topic: string | null
    subject: { id: string; code: string; parallel: string; name: string; career: string | null; theme_color: string | null }
    period: string
    year: number
    pass_mark: number
    grading_item: { id: string; term: number; category: string; weight: number } | null
    enrolled: number | null
    last_sync: { status: 'ok' | 'error'; error: string | null; at: string } | null
  }
  students: ReportStudent[]
  absent: { student_id: string; code: string; name: string }[]
  questions: ReportQuestion[]
}
export interface AnswerRow {
  participant_id: string
  code: string | null
  name: string
  question_id: string
  question_index: number
  prompt: string
  answer: string | null
  correct: boolean
  partial: number
  time_ms: number | null
  points: number
  answered_at: string
}

export const useReportList = () => useQuery({ queryKey: ['reports'], queryFn: () => rpc<ReportListRow[]>('report_list') })
export const useSessionReport = (id: string) => useQuery({ queryKey: ['report', id], queryFn: () => rpc<SessionReport>('session_report', { p_session: id }), enabled: !!id })
export const fetchAnswers = (id: string) => rpc<AnswerRow[]>('session_answers', { p_session: id })
export const useAnswers = (id: string, enabled = true) => useQuery({ queryKey: ['answers', id], queryFn: () => fetchAnswers(id), enabled: !!id && enabled })
export const fetchReport = (id: string) => rpc<SessionReport>('session_report', { p_session: id })
export const adjustGrade = (participantId: string, score: number, reason: string) =>
  rpc<null>('adjust_grade', { p_participant: participantId, p_score: score, p_reason: reason })
export const gradeHistory = (sessionId: string) =>
  rpc<{ participant_id: string; old: number | null; new: number; reason: string; at: string }[]>('grade_history', { p_session: sessionId })
export const setSessionItem = (sessionId: string, itemId: string | null) => rpc<null>('set_session_item', { p_session: sessionId, p_item: itemId })
export const useGradebook = (subjectId: string) => useQuery({ queryKey: ['gradebook', subjectId], queryFn: () => rpc<GbData>('gradebook', { p_subject: subjectId }), enabled: !!subjectId })
export const saveManualScore = (itemId: string, studentId: string, score: number | null) =>
  rpc<null>('save_manual_score', { p_item: itemId, p_student: studentId, p_score: score })
export const logSheetSync = (sessionId: string, ok: boolean, error?: string) => rpc<null>('log_sheet_sync', { p_session: sessionId, p_ok: ok, p_error: error ?? null })

// ---------------------------------------------------------------- estadísticas
export function stats(rep: SessionReport) {
  const present = rep.students.filter((s) => !s.kicked)
  const grades = present.map((s) => (s.grade === null ? null : Number(s.grade))).filter((g): g is number => g !== null).sort((a, b) => a - b)
  const n = grades.length
  const avg = n ? grades.reduce((a, b) => a + b, 0) / n : null
  const median = n ? (n % 2 ? grades[(n - 1) / 2] : (grades[n / 2 - 1] + grades[n / 2]) / 2) : null
  const pass = grades.filter((g) => g >= rep.session.pass_mark).length
  const times = present.map((s) => s.time_ms).filter((t): t is number => !!t)
  // distribución en tramos de 10
  const buckets = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }))
  for (const g of grades) buckets[Math.min(9, Math.floor(g / 10))].count++
  return {
    participants: present.length,
    enrolled: rep.session.enrolled,
    avg: avg === null ? null : Math.round(avg * 10) / 10,
    median: median === null ? null : Math.round(median * 10) / 10,
    max: n ? grades[n - 1] : null,
    min: n ? grades[0] : null,
    pass,
    passPct: n ? Math.round((pass / n) * 1000) / 10 : null,
    avgTimeMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    buckets,
  }
}

/** % de acierto de una pregunta (con crédito parcial) */
export const questionPct = (q: ReportQuestion) => (q.answered ? Math.round(Number(q.avg_partial ?? 0) * 1000) / 10 : null)
/** respuesta incorrecta más elegida */
export function topDistractor(q: ReportQuestion) {
  if (q.type === 'short_text') return q.top_wrong_text
  const wrong = q.options.filter((o) => !o.is_correct && o.count > 0).sort((a, b) => b.count - a.count)[0]
  return wrong ? wrong.text || 'Imagen' : null
}
export const DIFFICULT_PCT = 35

export const MODE_LABEL = { live: 'En vivo', exam: 'Examen', homework: 'Tarea' } as const
export const TYPE_LABEL: Record<QType, string> = {
  single: 'Opción única',
  multiple: 'Varias correctas',
  true_false: 'Verdadero/Falso',
  short_text: 'Respuesta corta',
  ordering: 'Ordenar',
  image_choice: 'Elegir imagen',
}
export const fmtSecs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return '<1 s'
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`
}
