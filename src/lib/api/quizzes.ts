import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fromDb, toDb, type EditorQuestion } from '../../features/quizzes/questionModel'
import { friendlyError, supabase } from '../supabase'

export type QuizStatus = 'draft' | 'published' | 'archived'

export interface QuizRow {
  id: string
  subject_id: string
  topic_id: string | null
  title: string
  description: string | null
  cover_url: string | null
  visual_theme: string
  settings: Record<string, unknown>
  status: QuizStatus
  updated_at: string
}

export interface QuizListRow extends QuizRow {
  questions: { count: number }[]
  subjects: { code: string; parallel: string; name: string; theme_color: string | null } | null
  topics: { name: string; unit: string | null } | null
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendlyError(res.error.message))
  return res.data
}

const QUESTION_SELECT =
  'id, quiz_id, sort_order, type, prompt, image_url, time_limit_sec, base_points, difficulty, explanation, tags, accepted_answers, question_options(id, text, image_url, is_correct, sort_order, correct_position)'

export const qkq = {
  quizzes: ['quizzes'] as const,
  quiz: (id: string) => ['quiz', id] as const,
  questions: (quizId: string) => ['questions', quizId] as const,
  bank: (subjectId: string) => ['bank', subjectId] as const,
  subjectsLite: ['subjects-lite'] as const,
}

/** Asignaturas (todas las gestiones) para los selectores. */
export function useSubjectsLite() {
  return useQuery({
    queryKey: qkq.subjectsLite,
    queryFn: async () =>
      check(
        await supabase
          .from('subjects')
          .select('id, code, name, parallel, theme_color, periods(name, academic_years(year)), topics(id, name, unit, sort_order)')
          .order('code'),
      ) as unknown as {
        id: string
        code: string
        name: string
        parallel: string
        theme_color: string | null
        periods: { name: string; academic_years: { year: number } } | null
        topics: { id: string; name: string; unit: string | null; sort_order: number }[]
      }[],
  })
}

export function useQuizzes() {
  return useQuery({
    queryKey: qkq.quizzes,
    queryFn: async () =>
      check(
        await supabase
          .from('quizzes')
          .select('*, questions(count), subjects(code, parallel, name, theme_color), topics(name, unit)')
          .order('updated_at', { ascending: false }),
      ) as QuizListRow[],
  })
}

export function useQuiz(id: string) {
  return useQuery({
    queryKey: qkq.quiz(id),
    queryFn: async () =>
      check(
        await supabase
          .from('quizzes')
          .select('*, subjects(id, code, parallel, name, theme_color, topics(id, name, unit, sort_order))')
          .eq('id', id)
          .maybeSingle(),
      ) as
        | (QuizRow & {
            subjects: { id: string; code: string; parallel: string; name: string; theme_color: string | null; topics: { id: string; name: string; unit: string | null; sort_order: number }[] }
          })
        | null,
  })
}

export async function fetchQuestions(quizId: string): Promise<EditorQuestion[]> {
  const rows = check(await supabase.from('questions').select(QUESTION_SELECT).eq('quiz_id', quizId).order('sort_order')) as unknown[]
  return rows.map(fromDb)
}

export function useQuestions(quizId: string) {
  return useQuery({ queryKey: qkq.questions(quizId), queryFn: () => fetchQuestions(quizId), staleTime: Infinity })
}

export function useSaveQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<QuizRow> & { subject_id: string; title: string }) => {
      const row = {
        subject_id: v.subject_id,
        topic_id: v.topic_id || null,
        title: v.title.trim(),
        description: v.description?.trim() || null,
        status: v.status ?? 'draft',
        visual_theme: v.visual_theme ?? 'amazonia',
      }
      if (v.id) return check(await supabase.from('quizzes').update(row).eq('id', v.id).select().single()) as QuizRow
      return check(await supabase.from('quizzes').insert(row).select().single()) as QuizRow
    },
    onSuccess: (q) => {
      void qc.invalidateQueries({ queryKey: qkq.quizzes })
      void qc.invalidateQueries({ queryKey: qkq.quiz(q.id) })
    },
  })
}

export function useSetQuizStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: QuizStatus }) => check(await supabase.from('quizzes').update({ status: v.status }).eq('id', v.id)),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: qkq.quizzes })
      void qc.invalidateQueries({ queryKey: qkq.quiz(v.id) })
    },
  })
}

export function useDeleteQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('quizzes').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkq.quizzes }),
  })
}

export function useDuplicateQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.rpc('duplicate_quiz', { p_quiz_id: id })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: qkq.quizzes }),
  })
}

/** Guarda una pregunta y devuelve los ids asignados (pregunta y opciones). */
export async function saveQuestion(q: EditorQuestion, quizId: string) {
  return check(await supabase.rpc('save_question', { p_question: toDb(q, quizId) })) as {
    id: string
    options: { id: string; sort_order: number }[]
  }
}

export async function deleteQuestion(id: string) {
  check(await supabase.from('questions').delete().eq('id', id))
}

export async function reorderQuestions(quizId: string, ids: string[]) {
  check(await supabase.rpc('reorder_questions', { p_quiz_id: quizId, p_ids: ids }))
}

export async function importQuestions(quizId: string, qs: EditorQuestion[]) {
  return check(await supabase.rpc('import_questions', { p_quiz_id: quizId, p_items: qs.map((q) => toDb(q, quizId)) })) as number
}

export async function copyQuestions(ids: string[], targetQuizId: string) {
  return check(await supabase.rpc('copy_questions', { p_ids: ids, p_target_quiz: targetQuizId })) as number
}

export async function moveQuestions(ids: string[], targetQuizId: string) {
  return check(await supabase.rpc('move_questions', { p_ids: ids, p_target_quiz: targetQuizId })) as number
}

/** Banco de preguntas: todas las preguntas de una asignatura (de todas sus evaluaciones). */
export function useBank(subjectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qkq.bank(subjectId ?? ''),
    enabled: !!subjectId && enabled,
    queryFn: async () => {
      const rows = check(
        await supabase
          .from('questions')
          .select(`${QUESTION_SELECT}, quizzes!inner(id, title, subject_id)`)
          .eq('quizzes.subject_id', subjectId!)
          .order('created_at', { ascending: false }),
      ) as unknown as ({ quizzes: { id: string; title: string } } & Record<string, unknown>)[]
      return rows.map((r) => ({ question: fromDb(r), quizId: r.quizzes.id, quizTitle: r.quizzes.title }))
    },
  })
}
