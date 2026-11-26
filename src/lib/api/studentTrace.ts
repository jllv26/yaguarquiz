import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/**
 * Seguimiento de UN estudiante en una asignatura: todas las sesiones (actividades, evaluaciones,
 * juegos en vivo) con lo que hizo en cada una — si entró, cada intento con su inicio, fin, cuántas
 * respuestas dio, cuántas bien, la nota y cómo se entregó. Sirve para responder reclamos con datos.
 * Todo se lee con las tablas del docente (RLS), sin funciones nuevas en la base de datos.
 */
export interface TraceAttempt {
  number: number
  started_at: string
  submitted_at: string | null
  submit_reason: 'student' | 'time' | 'closed' | 'teacher' | null
  grade: number | null
  answers: number
  correct: number
  focus_losses: number
  paste_count: number
}
export interface TraceRow {
  session_id: string
  title: string
  kind: 'clase' | 'casa' | 'inv' | 'actividad' | 'examen' | 'vivo' | 'tarea'
  mode: 'live' | 'exam' | 'homework'
  max_attempts: number
  closes: string | null
  entered: boolean
  last_seen: string | null
  attempts: TraceAttempt[]
  /** En vivo no hay intentos: respuestas que dio en la sesión. */
  live_answers: number
  live_correct: number
}
export interface StudentTrace {
  rows: TraceRow[]
  summary: { total: number; done: number; opened: number; never: number }
}

const kindOf = (title: string, mode: string, activity: unknown): TraceRow['kind'] => {
  if (mode === 'live') return 'vivo'
  if (/^\s*📝|clase/i.test(title) && activity) return 'clase'
  if (/^\s*🏠|casa/i.test(title) && activity) return 'casa'
  if (/^\s*🔎|investigaci/i.test(title) && activity) return 'inv'
  if (activity) return 'actividad'
  return mode === 'exam' ? 'examen' : 'tarea'
}

export async function fetchStudentTrace(subjectId: string, studentId: string): Promise<StudentTrace> {
  const sessions = check(
    await supabase
      .from('sessions')
      .select('id, mode, max_attempts, scheduled_end, created_at, quizzes(title, settings)')
      .eq('subject_id', subjectId)
      .order('created_at'),
  ) as unknown as { id: string; mode: TraceRow['mode']; max_attempts: number; scheduled_end: string | null; created_at: string; quizzes: { title: string; settings: { activity?: unknown } | null } | null }[]
  const ids = sessions.map((s) => s.id)
  if (!ids.length) return { rows: [], summary: { total: 0, done: 0, opened: 0, never: 0 } }

  const parts = check(
    await supabase.from('participants').select('id, session_id, last_ping').eq('student_id', studentId).in('session_id', ids),
  ) as unknown as { id: string; session_id: string; last_ping: string | null }[]
  const pids = parts.map((p) => p.id)
  const attempts = pids.length
    ? (check(
        await supabase
          .from('attempts')
          .select('id, participant_id, session_id, number, started_at, submitted_at, submit_reason, grade, focus_losses, paste_count')
          .in('participant_id', pids),
      ) as unknown as (Omit<TraceAttempt, 'answers' | 'correct'> & { id: string; participant_id: string; session_id: string })[])
    : []
  const answers = pids.length
    ? (check(await supabase.from('answers').select('participant_id, attempt_id, is_correct').in('participant_id', pids)) as unknown as {
        participant_id: string
        attempt_id: string | null
        is_correct: boolean | null
      }[])
    : []

  const byAttempt = new Map<string, { n: number; ok: number }>()
  const byParticipant = new Map<string, { n: number; ok: number }>()
  for (const a of answers) {
    const k = a.attempt_id ? byAttempt : byParticipant
    const key = a.attempt_id ?? a.participant_id
    const v = k.get(key) ?? { n: 0, ok: 0 }
    v.n++
    if (a.is_correct) v.ok++
    k.set(key, v)
  }

  const rows: TraceRow[] = sessions.map((s) => {
    const p = parts.find((x) => x.session_id === s.id)
    const at = attempts
      .filter((a) => a.session_id === s.id)
      .sort((a, b) => a.number - b.number)
      .map((a) => ({
        number: a.number,
        started_at: a.started_at,
        submitted_at: a.submitted_at,
        submit_reason: a.submit_reason,
        grade: a.grade === null ? null : Number(a.grade),
        answers: byAttempt.get(a.id)?.n ?? 0,
        correct: byAttempt.get(a.id)?.ok ?? 0,
        focus_losses: a.focus_losses,
        paste_count: a.paste_count,
      }))
    const live = p ? byParticipant.get(p.id) : undefined
    const title = s.quizzes?.title ?? 'Sesión'
    return {
      session_id: s.id,
      title,
      kind: kindOf(title, s.mode, s.quizzes?.settings?.activity),
      mode: s.mode,
      max_attempts: s.max_attempts,
      closes: s.scheduled_end,
      entered: !!p,
      last_seen: p?.last_ping ?? null,
      attempts: at,
      live_answers: live?.n ?? 0,
      live_correct: live?.ok ?? 0,
    }
  })
  const done = rows.filter((r) => r.attempts.some((a) => a.submitted_at) || (r.mode === 'live' && r.live_answers > 0)).length
  const opened = rows.filter((r) => r.entered).length - done
  return { rows, summary: { total: rows.length, done, opened: Math.max(0, opened), never: rows.filter((r) => !r.entered).length } }
}

export const useStudentTrace = (subjectId: string, studentId: string) =>
  useQuery({
    queryKey: ['student-trace', subjectId, studentId],
    queryFn: () => fetchStudentTrace(subjectId, studentId),
    enabled: !!subjectId && !!studentId,
  })
