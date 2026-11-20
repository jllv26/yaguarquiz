export interface AcademicYear {
  id: string
  year: number
}

export interface Period {
  id: string
  academic_year_id: string
  name: string
  starts_on: string | null
  ends_on: string | null
}

export interface Subject {
  id: string
  period_id: string
  code: string
  name: string
  career: string | null
  semester: string | null
  parallel: string
  theme_color: string | null
  cover_url: string | null
  /** código fijo del aula del estudiante (ej. ICOM261) */
  portal_code?: string | null
}

export interface SubjectWithCounts extends Subject {
  enrollments: { count: number }[]
  topics: { count: number }[]
}

export interface Student {
  id: string
  university_code: string
  ci: string | null
  last_names: string
  first_names: string
  email: string | null
  career: string | null
  active: boolean
  paternal_last_name?: string | null
  maternal_last_name?: string | null
  phone?: string | null
  extra_emails?: string | null
  address?: string | null
  degree?: string | null
  status_label?: string | null
}

export interface EnrolledStudent extends Student {
  enrollment_active: boolean
}

export interface Topic {
  id: string
  subject_id: string
  name: string
  unit: string | null
  description: string | null
  sort_order: number
}

export type GradingSource = 'yaguarquiz' | 'manual'

export interface GradingItem {
  id?: string
  term: number
  category: string
  weight: number
  source: GradingSource
  sort_order?: number
}

export interface GradingPlan {
  id: string
  subject_id: string
  pass_mark: number
  max_score: number
  grading_items: GradingItem[]
}

export interface ImportSummary {
  created: number
  existing: number
  updated: number
  enrolled: number
  already_enrolled: number
  skipped: number
}
