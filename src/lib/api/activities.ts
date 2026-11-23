import type { ActivityBoard, ActivityItem, ActivitySettings, PlayAction, PlayResult } from '../../features/activities/types'
import type { ExamState } from './exam'
import { examState } from './exam'
import type { PlayError } from './live'
import { friendlyError, supabase } from '../supabase'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export interface ActivityReviewItem {
  clue: string | null
  image_url: string | null
  /** null mientras la actividad sigue abierta (anti-trampa): la correcta se muestra al cerrar */
  answer: string | null
  hidden?: boolean
  response: string
  correct: boolean
  partial: number
}

/** Estado del examen/tarea + tablero de la actividad (si la evaluación es una actividad). */
export type ActivityExamState = Omit<ExamState, 'current' | 'review'> & {
  activity_type?: ActivityBoard['type'] | null
  current: (Omit<NonNullable<ExamState['current']>, 'questions'> & { questions?: NonNullable<ExamState['current']>['questions']; activity?: ActivityBoard }) | null
  review: ExamState['review'] | ActivityReviewItem[] | null
}

/** Usa activity_state (Fase 9); si el servidor aún no la tiene, cae a exam_state. */
export async function activityState(token: string): Promise<ActivityExamState | PlayError> {
  try {
    return await rpc<ActivityExamState | PlayError>('activity_state', { p_token: token })
  } catch (e) {
    if (/activity_state|function|schema cache/i.test((e as Error).message)) return (await examState(token)) as ActivityExamState | PlayError
    throw e
  }
}

export const activityPlay = (token: string, action: PlayAction, data: Record<string, unknown>) =>
  rpc<PlayResult>('activity_play', { p_token: token, p_action: action, p_data: data })

/** Docente: guarda la actividad completa (tipo/opciones + palabras). */
export const saveActivity = (quizId: string, settings: ActivitySettings, items: ActivityItem[]) =>
  rpc<number>('save_activity', {
    p_quiz: quizId,
    p_activity: settings,
    p_items: items.map((it) => ({ id: it.id ?? null, term: it.term, prompt: it.prompt, image_url: it.image_url ?? null, group: it.group ?? null, contains: !!it.contains, extra: it.extra ?? {} })),
  })

export async function fetchActivityItems(quizId: string): Promise<ActivityItem[]> {
  const { data, error } = await supabase.from('questions').select('id, term, prompt, image_url, tags, extra').eq('quiz_id', quizId).eq('type', 'game_item').order('sort_order')
  if (error) throw new Error(friendlyError(error.message))
  return (data ?? []).map((r) => ({
    id: r.id as string,
    term: (r.term as string) ?? '',
    prompt: (r.prompt as string) ?? '',
    image_url: (r.image_url as string | null) ?? null,
    group: ((r.tags as string[]) ?? []).find((t) => t !== 'contiene') ?? '',
    contains: ((r.tags as string[]) ?? []).includes('contiene'),
    extra: (r.extra as ActivityItem['extra']) ?? {},
  }))
}

// ------------------------------------------------------------------ investigaciones (las califica el docente)
export interface ResearchSubmission {
  attempt: string
  number: number
  submitted_at: string
  grade: number | null
  name: string
  ru: string | null
  case: { title: string; context?: string } | null
  focus_losses: number
  paste: number
  scores: number[] | null
  comment: string | null
  answers: { question: string; text: string }[]
}
export interface ResearchList {
  criteria: { title: string; desc?: string }[]
  min_words: number
  items: ResearchSubmission[]
}
export const researchList = (session: string) => rpc<ResearchList>('research_list', { p_session: session })
export const researchGrade = (attempt: string, scores: number[] | null, comment: string | null) =>
  rpc<{ ok: true; grade: number | null }>('research_grade', { p_attempt: attempt, p_scores: scores, p_comment: comment })
