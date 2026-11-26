import type { StudentResponse } from '../scoring'
import { friendlyError, supabase } from '../supabase'
import type { Avatar, PlayError, QType } from './live'

export type ShowCorrect = 'each' | 'end' | 'after_close' | 'never'
export type ExamWindow = 'not_open' | 'open' | 'closed'

export interface ExamQuestion {
  id: string
  type: QType
  prompt: string
  image_url: string | null
  time_limit_sec: number
  base_points: number
  options: { key: string; text: string; image_url: string | null }[]
  topic?: string | null
  scene?: import('../../components/SceneCard').Scene | null
}
export interface RevealData {
  correct_keys: string[]
  correct_order: string[] | null
  accepted_answers: string[] | null
  explanation: string | null
}
export interface ExamAnswer {
  response: StudentResponse
  correct?: boolean
  partial?: number
  points?: number
  reveal?: RevealData
}
export interface ExamState {
  ok: true
  server_now: string
  session: {
    id: string
    mode: 'exam' | 'homework'
    quiz_title: string
    subject: string
    window: ExamWindow
    opens_at: string | null
    closes_at: string | null
    time_limit_sec: number | null
    question_count: number
    max_attempts: number
    show_correct: ShowCorrect
    show_grade: boolean
    focus_mode: boolean
    lock_after: number
    pass_mark: number
  }
  me: { id: string; nickname: string; avatar: Avatar; extra_time_sec: number }
  attempts: { number: number; started_at: string; submitted_at: string; reason: string; grade: number | null; correct: number | null; questions: number }[]
  best_grade: number | null
  can_start: boolean
  attempts_left: number
  current: {
    id: string
    number: number
    started_at: string
    deadline: string | null
    locked: boolean
    focus_losses: number
    questions: ExamQuestion[]
    answers: Record<string, ExamAnswer>
  } | null
  review: { question: ExamQuestion; response: StudentResponse | null; correct: boolean; partial: number; reveal: RevealData }[] | null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export const EXAM_ERRORS: Record<string, string> = {
  not_open: 'La actividad todavía no está abierta.',
  finished: 'La actividad ya se cerró.',
  no_attempts: 'Ya usaste todos tus intentos.',
  no_attempt: 'No tienes un intento en curso.',
  locked: 'Tu examen está bloqueado. Pide al docente que lo habilite.',
  time: 'Se acabó el tiempo; tu examen se entregó con lo que respondiste.',
  not_in_attempt: 'Esa pregunta no es de tu examen.',
  already: 'Ya respondiste esta pregunta.',
  kicked: 'El docente te retiró de esta actividad.',
  token: 'Tu sesión ya no es válida. Vuelve a entrar con el PIN.',
}

export const examState = (token: string) => rpc<ExamState | PlayError>('exam_state', { p_token: token })
export const startAttempt = (token: string) => rpc<ExamState | PlayError>('start_attempt', { p_token: token })
export const submitAttempt = (token: string) => rpc<ExamState | PlayError>('submit_attempt', { p_token: token })
export const saveAnswer = (token: string, questionId: string, response: StudentResponse) =>
  rpc<({ ok: true; correct?: boolean; partial?: number; points?: number; reveal?: RevealData }) | PlayError>('save_answer', {
    p_token: token,
    p_question: questionId,
    p_response: response,
  })
type FocusResult = { ok: boolean; locked?: boolean; focus_losses?: number }
export const reportFocus = (token: string, kind: 'tab' | 'paste') =>
  rpc<FocusResult>('report_event', { p_token: token, p_kind: kind }).catch((): FocusResult => ({ ok: false }))

// ---------------------------------------------------------------- docente
export interface MonitorRow {
  participant_id: string | null
  student_id: string | null
  nickname: string | null
  avatar: Avatar | null
  kicked: boolean
  extra_time_sec: number
  extra_attempts: number
  code: string | null
  name: string
  connected: boolean
  attempts_used: number
  attempts_allowed: number
  best_grade: number | null
  best_correct: number | null
  last_submitted_at: string | null
  last_reason: string | null
  focus_total: number
  /** intentó entrar desde otro equipo y espera que el docente lo autorice */
  takeover_pending?: boolean
  paste_total: number
  current: { number: number; started_at: string; deadline: string | null; answered: number; total: number; locked: boolean; focus_losses: number } | null
}
export interface MonitorState {
  server_now: string
  session: {
    id: string
    pin: string
    mode: 'exam' | 'homework'
    status: string
    window: ExamWindow
    opens_at: string | null
    closes_at: string | null
    time_limit_sec: number | null
    max_attempts: number
    pick_count: number | null
    total: number
    question_count: number
    shuffle_questions: boolean
    shuffle_options: boolean
    show_correct: ShowCorrect
    show_grade: boolean
    focus_mode: boolean
    lock_after: number
    identification: 'roster' | 'nickname'
    require_ci: boolean
    quiz_title: string
    subject: { id: string; code: string; parallel: string; name: string; theme_color: string | null }
    created_at: string
    pass_mark: number
  }
  rows: MonitorRow[]
}
export const examMonitor = (id: string) => rpc<MonitorState>('exam_monitor', { p_session: id })
export const examControl = (id: string, action: 'open_now' | 'close_now' | 'extend' | 'reopen', minutes = 0) =>
  rpc<MonitorState>('exam_control', { p_session: id, p_action: action, p_minutes: minutes })
export const examParticipant = (participantId: string, action: 'extra_time' | 'unlock' | 'grant_attempt' | 'force_submit', minutes = 0) =>
  rpc<null>('exam_participant', { p_participant: participantId, p_action: action, p_minutes: minutes })

export const SHOW_CORRECT_LABEL: Record<ShowCorrect, string> = {
  after_close: 'Al cerrar la actividad (recomendado)',
  end: 'Apenas entrega',
  each: 'Después de cada pregunta (práctica)',
  never: 'Nunca',
}
export const REASON_LABEL: Record<string, string> = {
  student: 'Entregó',
  time: 'Se acabó su tiempo',
  closed: 'Cierre de la actividad',
  teacher: 'Entregado por el docente',
}

/** Puntos del parcial que vale el examen (p. ej. 7). Si la función aún no existe en la base, devuelve null. */
export const examPoints = async (token: string): Promise<{ weight: number; category: string; term: number } | null> => {
  try {
    const { data, error } = await supabase.rpc('exam_points', { p_token: token })
    if (error || !data || !(data as { ok?: boolean }).ok) return null
    const d = data as { weight: number | string; category: string; term: number }
    const w = Number(d.weight)
    return w > 0 ? { weight: w, category: d.category, term: d.term } : null
  } catch {
    return null
  }
}
