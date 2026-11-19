import type { PresentationSettings, Rubric } from '../../features/presentations/rubric'
import { friendlyError, supabase } from '../supabase'

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export type PresenterState = 'pending' | 'live' | 'done' | 'absent'

export interface PresentationListRow {
  id: string
  title: string
  status: 'draft' | 'open' | 'closed'
  pin: string
  created_at: string
  updated_at: string
  subject: { id: string; code: string; parallel: string; name: string; theme_color: string | null }
  presenters: number
  done: number
  reviews: number
}
export interface HostPresenter {
  id: string
  student_id: string
  code: string
  name: string
  group_no: number | null
  topic: string | null
  day: number
  sort_order: number
  state: PresenterState
  duration_sec: number | null
  started_at: string | null
  peer_n: number
  peer_avg: number | null
  teacher: number | null
  final: number | null
  criteria: number[] | null
  teacher_scores: number[] | null
  teacher_comment: string | null
  /** lo que el docente anotó que preguntó (una por pregunta) */
  teacher_notes?: string[] | null
}
export interface HostState {
  server_now: string
  presentation: {
    id: string
    title: string
    pin: string
    status: 'draft' | 'open' | 'closed'
    rubric: Rubric
    settings: Partial<PresentationSettings>
    current_presenter: string | null
    current_day: number
    grading_item_id: string | null
    subject: { id: string; code: string; parallel: string; name: string }
  }
  presenters: HostPresenter[]
  participants: { id: string; name: string; code: string; joined_at: string; online: boolean; reviews: number }[]
  enrolled: number
  items: { id: string; term: number; category: string; weight: number }[]
}

export const presentationList = () => rpc<PresentationListRow[]>('presentation_list')
export const presentationRoster = (subject: string) => rpc<{ id: string; code: string; name: string }[]>('presentation_roster', { p_subject: subject })
export const savePresentation = (p: Record<string, unknown>) => rpc<string>('save_presentation', { p })
export const deletePresentation = (id: string) => rpc<void>('delete_presentation', { p_id: id })
export const presentationHost = (id: string) => rpc<HostState>('presentation_host', { p_id: id })
export const presentationControl = (id: string, action: string, target: string | null = null, arg: number | null = null) =>
  rpc<{ ok: boolean; error?: string }>('presentation_control', { p_id: id, p_action: action, p_target: target, p_arg: arg })
export const teacherScore = (presenter: string, scores: number[] | null, comment: string | null, notes: string[] | null = null) =>
  rpc<{ ok: true; score: number | null }>('presentation_teacher_score', { p_presenter: presenter, p_scores: scores, p_comment: comment, p_notes: notes })
export const reviewsOf = (presenter: string) =>
  rpc<{ evaluator: string; code: string; scores: number[]; score: number; why: string; understood: string; at: string }[]>('presentation_reviews_of', { p_presenter: presenter })
export const toGradebook = (id: string, item: string) => rpc<number>('presentation_to_gradebook', { p_id: id, p_item: item })

// ---------------------------------------------------------------- estudiante
export type PresError = { ok: false; error: string }
export const presentationInfo = (pin: string) =>
  rpc<{ ok: true; kind: 'presentation'; title: string; status: string; require_ci: boolean; subject: string } | PresError>('presentation_info', { p_pin: pin })
export const presentationLookup = (pin: string, code: string) =>
  rpc<{ ok: true; name: string; require_ci: boolean } | PresError>('presentation_lookup', { p_pin: pin, p_code: code })
export const presentationJoin = (pin: string, code: string, ci: string | null, device: string) =>
  rpc<{ ok: true; token: string; rejoined: boolean } | PresError>('presentation_join', { p_pin: pin, p_code: code, p_ci: ci, p_device: device })

export interface AgendaItem {
  id: string
  name: string
  group_no: number | null
  topic: string | null
  day: number
  state: PresenterState
  mine: boolean
  own_group: boolean
  review: { scores: number[]; why: string; understood: string } | null
}
export interface StudentState {
  ok: true
  server_now: string
  presentation: { title: string; status: 'draft' | 'open' | 'closed'; rubric: Rubric; current_day: number; min_why: number; min_understood: number; subject: string }
  me: { name: string; full_name: string; presenter_id: string | null; group_no: number | null; topic: string | null }
  current: { id: string; name: string; group_no: number | null; topic: string | null; started_at: string } | null
  agenda: AgendaItem[]
}
export const presentationState = (token: string) => rpc<StudentState | PresError>('presentation_state', { p_token: token })
export const presentationReview = (token: string, presenter: string, scores: number[], why: string, understood: string) =>
  rpc<{ ok: true; score: number } | PresError>('presentation_review', { p_token: token, p_presenter: presenter, p_scores: scores, p_why: why, p_understood: understood })

export const PRES_ERRORS: Record<string, string> = {
  pin: 'No hay una exposición abierta con ese PIN.',
  not_enrolled: 'Ese RU no está en la lista de esta asignatura. Revísalo o consulta al docente.',
  bad_ci: 'Los últimos 3 dígitos del CI no coinciden.',
  other_device: 'Ese RU ya entró desde otro equipo. Pide al docente que lo libere.',
  token: 'Tu ingreso ya no es válido. Vuelve a entrar con el PIN.',
  closed: 'La evaluación de las exposiciones ya se cerró.',
  self: 'No puedes evaluarte a ti mismo.',
  own_group: 'No puedes evaluar a tu propio grupo.',
  absent: 'Este expositor está marcado como ausente.',
  not_open: 'Este compañero todavía no expuso.',
  scores: 'Califica todos los criterios.',
  why: 'Explica por qué le pones esta nota.',
  understood: 'Cuenta qué entendiste de su tema.',
  too_long: 'El texto es demasiado largo.',
}
