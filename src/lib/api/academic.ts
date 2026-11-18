import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AcademicYear,
  EnrolledStudent,
  GradingItem,
  GradingPlan,
  ImportSummary,
  Period,
  Student,
  Subject,
  SubjectWithCounts,
  Topic,
} from '../../types/db'
import type { StudentData } from '../../features/students/studentImport'
import { friendlyError, supabase } from '../supabase'

/** Lanza un Error con mensaje en español si Supabase devolvió error. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const m = res.error.message
    if (res.error.code === '23505' || m.includes('duplicate key')) {
      if (m.includes('subjects_unique_parallel')) throw new Error('Ya existe esa sigla con ese paralelo en el periodo.')
      if (m.includes('periods_unique_name')) throw new Error('Ya existe un periodo con ese nombre en la gestión.')
      if (m.includes('academic_years')) throw new Error('Esa gestión ya existe.')
      if (m.includes('students')) throw new Error('Ya existe un estudiante con ese código universitario.')
      throw new Error('Ese registro ya existe.')
    }
    if (res.error.code === '23503') throw new Error('No se puede borrar porque tiene datos relacionados.')
    throw new Error(friendlyError(m))
  }
  return res.data
}

export const qk = {
  years: ['years'] as const,
  periods: (yearId?: string) => ['periods', yearId] as const,
  subjects: (yearId?: string) => ['subjects', yearId] as const,
  subject: (id: string) => ['subject', id] as const,
  enrolled: (subjectId: string) => ['enrolled', subjectId] as const,
  topics: (subjectId: string) => ['topics', subjectId] as const,
  plan: (subjectId: string) => ['plan', subjectId] as const,
  students: ['students'] as const,
  dashboard: ['dashboard'] as const,
}

// ---------------------------------------------------------------- Gestiones
export function useYears() {
  return useQuery({
    queryKey: qk.years,
    queryFn: async () => check(await supabase.from('academic_years').select('id, year').order('year', { ascending: false })) as AcademicYear[],
  })
}

export function useSaveYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id?: string; year: number; withPeriods?: boolean }) => {
      if (v.id) return check(await supabase.from('academic_years').update({ year: v.year }).eq('id', v.id).select().single()) as AcademicYear
      const y = check(await supabase.from('academic_years').insert({ year: v.year }).select().single()) as AcademicYear
      if (v.withPeriods) {
        check(
          await supabase.from('periods').insert([
            { academic_year_id: y.id, name: `I/${v.year}`, starts_on: `${v.year}-02-01`, ends_on: `${v.year}-06-30` },
            { academic_year_id: y.id, name: `II/${v.year}`, starts_on: `${v.year}-08-01`, ends_on: `${v.year}-12-15` },
          ]),
        )
      }
      return y
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('academic_years').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------------------------------------------------------- Periodos
export function usePeriods(yearId?: string) {
  return useQuery({
    queryKey: qk.periods(yearId),
    enabled: !!yearId,
    queryFn: async () =>
      check(
        await supabase
          .from('periods')
          .select('id, academic_year_id, name, starts_on, ends_on')
          .eq('academic_year_id', yearId!)
          .order('starts_on', { ascending: true, nullsFirst: false }),
      ) as Period[],
  })
}

export function useSavePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<Period> & { academic_year_id: string; name: string }) => {
      const row = { academic_year_id: v.academic_year_id, name: v.name.trim(), starts_on: v.starts_on || null, ends_on: v.ends_on || null }
      if (v.id) return check(await supabase.from('periods').update(row).eq('id', v.id))
      return check(await supabase.from('periods').insert(row))
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeletePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('periods').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------------------------------------------------------- Asignaturas
export function useSubjects(yearId?: string) {
  return useQuery({
    queryKey: qk.subjects(yearId),
    enabled: !!yearId,
    queryFn: async () =>
      check(
        await supabase
          .from('subjects')
          .select('*, enrollments(count), topics(count), periods!inner(academic_year_id)')
          .eq('periods.academic_year_id', yearId!)
          .order('code'),
      ) as SubjectWithCounts[],
  })
}

export function useSubject(id: string) {
  return useQuery({
    queryKey: qk.subject(id),
    queryFn: async () =>
      check(
        await supabase
          .from('subjects')
          .select('*, periods(id, name, academic_year_id, academic_years(year))')
          .eq('id', id)
          .maybeSingle(),
      ) as (Subject & { periods: { id: string; name: string; academic_year_id: string; academic_years: { year: number } } }) | null,
  })
}

export function useSaveSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<Subject> & { period_id: string; code: string; name: string; applyPlan?: GradingItem[] }) => {
      const row = {
        period_id: v.period_id,
        code: v.code.trim().toUpperCase(),
        name: v.name.trim(),
        career: v.career?.trim() || null,
        semester: v.semester?.trim() || null,
        parallel: (v.parallel || 'A').trim().toUpperCase(),
        theme_color: v.theme_color || '#1B7339',
      }
      const saved = v.id
        ? (check(await supabase.from('subjects').update(row).eq('id', v.id).select().single()) as Subject)
        : (check(await supabase.from('subjects').insert(row).select().single()) as Subject)
      if (!v.id && v.applyPlan?.length) {
        check(await supabase.rpc('save_grading_plan', { p_subject_id: saved.id, p_pass_mark: 51, p_items: v.applyPlan }))
      }
      return saved
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('subjects').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------------------------------------------------------- Estudiantes
export function useEnrolled(subjectId: string) {
  return useQuery({
    queryKey: qk.enrolled(subjectId),
    queryFn: async () => {
      const rows = check(
        await supabase
          .from('enrollments')
          .select('active, students(id, university_code, ci, last_names, first_names, email, career, active)')
          .eq('subject_id', subjectId),
      ) as unknown as { active: boolean; students: Student }[]
      return rows
        .map((r) => ({ ...r.students, enrollment_active: r.active }))
        .sort((a, b) => a.last_names.localeCompare(b.last_names, 'es') || a.first_names.localeCompare(b.first_names, 'es')) as EnrolledStudent[]
    },
  })
}

export function useAllStudents() {
  return useQuery({
    queryKey: qk.students,
    queryFn: async () => {
      const rows = check(
        await supabase
          .from('students')
          .select('id, university_code, ci, last_names, first_names, email, career, active, enrollments(subjects(code, parallel))')
          .order('last_names'),
      ) as unknown as (Student & { enrollments: { subjects: { code: string; parallel: string } | null }[] })[]
      return rows
    },
  })
}

/** RU ya registrados por el docente (para marcar "existente" en la vista previa). */
export async function fetchExistingCodes(): Promise<Set<string>> {
  const rows = check(await supabase.from('students').select('university_code')) as { university_code: string }[]
  return new Set(rows.map((r) => r.university_code))
}

export function useImportStudents(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { rows: StudentData[]; updateExisting: boolean }) =>
      check(
        await supabase.rpc('import_students', {
          p_subject_id: subjectId,
          p_rows: v.rows,
          p_update_existing: v.updateExisting,
        }),
      ) as ImportSummary,
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSaveStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<Student> & { university_code: string; last_names: string; first_names: string; enrollIn?: string }) => {
      const row = {
        university_code: v.university_code.replace(/\s+/g, '').toUpperCase(),
        ci: v.ci?.trim() || null,
        last_names: v.last_names.trim(),
        first_names: v.first_names.trim(),
        email: v.email?.trim().toLowerCase() || null,
        career: v.career?.trim() || null,
        active: v.active ?? true,
      }
      if (v.id) return check(await supabase.from('students').update(row).eq('id', v.id))
      if (v.enrollIn) {
        // import_students reutiliza al estudiante si el RU ya existe
        return check(await supabase.rpc('import_students', { p_subject_id: v.enrollIn, p_rows: [row], p_update_existing: false }))
      }
      return check(await supabase.from('students').insert(row))
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSetStudentActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; active: boolean }) =>
      check(await supabase.from('students').update({ active: v.active }).eq('id', v.id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeleteStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('students').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useUnenroll(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (studentId: string) =>
      check(await supabase.from('enrollments').delete().eq('subject_id', subjectId).eq('student_id', studentId)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------------------------------------------------------- Temas
export function useTopics(subjectId: string) {
  return useQuery({
    queryKey: qk.topics(subjectId),
    queryFn: async () =>
      check(
        await supabase
          .from('topics')
          .select('id, subject_id, name, unit, description, sort_order')
          .eq('subject_id', subjectId)
          .order('sort_order')
          .order('name'),
      ) as Topic[],
  })
}

export function useSaveTopic(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<Topic> & { name: string }) => {
      const row = {
        subject_id: subjectId,
        name: v.name.trim(),
        unit: v.unit?.trim() || null,
        description: v.description?.trim() || null,
        sort_order: v.sort_order ?? 0,
      }
      if (v.id) return check(await supabase.from('topics').update(row).eq('id', v.id))
      return check(await supabase.from('topics').insert(row))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.topics(subjectId) }),
  })
}

export function useReorderTopics(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: Topic[]) => {
      await Promise.all(ordered.map((t, i) => supabase.from('topics').update({ sort_order: i + 1 }).eq('id', t.id)))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.topics(subjectId) }),
  })
}

export function useDeleteTopic(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('topics').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.topics(subjectId) }),
  })
}

// ---------------------------------------------------------------- Plan de calificación
export function useGradingPlan(subjectId: string) {
  return useQuery({
    queryKey: qk.plan(subjectId),
    queryFn: async () =>
      check(
        await supabase
          .from('grading_plans')
          .select('id, subject_id, pass_mark, max_score, grading_items(id, term, category, weight, source, sort_order)')
          .eq('subject_id', subjectId)
          .maybeSingle(),
      ) as GradingPlan | null,
  })
}

export function useSaveGradingPlan(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { passMark: number; items: GradingItem[] }) =>
      check(
        await supabase.rpc('save_grading_plan', {
          p_subject_id: subjectId,
          p_pass_mark: v.passMark,
          p_items: v.items.map(({ term, category, weight, source }) => ({ term, category, weight, source })),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(subjectId) }),
  })
}
