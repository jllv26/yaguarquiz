/**
 * Conversor de notas (libreta): convierte las notas sobre 100 de cada actividad en el aporte de su categoría
 * del plan de calificación y suma la nota final.
 *   aporte = (promedio de las actividades de la categoría / 100) × peso de la categoría
 * Reglas:
 *   - Varias actividades en la misma categoría se promedian.
 *   - Si una actividad ya cerró y el estudiante no participó, cuenta 0 en ese promedio.
 *   - Las categorías manuales (asistencia, exposiciones, proyecto…) usan la nota que escribe el docente.
 *   - Una categoría sin actividades ni nota todavía queda "pendiente" (no suma).
 */
export interface GbItem {
  id: string
  term: number
  category: string
  weight: number
  source: 'yaguarquiz' | 'manual'
}
export interface GbData {
  subject: { id: string; code: string; parallel: string; name: string; career: string | null; period: string | null }
  plan: { id: string; pass_mark: number; max_score: number; items: GbItem[] } | null
  students: { id: string; code: string; name: string }[]
  sessions: { id: string; mode: string; title: string; date: string; grading_item_id: string | null; done: boolean }[]
  grades: { session_id: string; student_id: string; grade: number | null }[]
  manual: { item_id: string; student_id: string; score: number }[]
}
export interface GbCell {
  /** promedio sobre 100 (null = pendiente) */
  score: number | null
  /** aporte a la nota final (0..peso) */
  contribution: number | null
  /** nota de cada actividad (solo categorías de YaguarQuiz) */
  parts: { session_id: string; grade: number | null }[]
}
export interface GbRow {
  student: GbData['students'][number]
  cells: Record<string, GbCell>
  termTotals: Record<number, number>
  final: number
  /** nota final redondeada al entero (como en la libreta oficial) */
  finalRounded: number
  pending: number
  passed: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function computeGradebook(d: GbData): { rows: GbRow[]; items: GbItem[]; terms: number[]; maxByTerm: Record<number, number> } {
  const items = [...(d.plan?.items ?? [])].sort((a, b) => a.term - b.term)
  const terms = [...new Set(items.map((i) => i.term))].sort((a, b) => a - b)
  const maxByTerm: Record<number, number> = {}
  for (const i of items) maxByTerm[i.term] = r2((maxByTerm[i.term] ?? 0) + Number(i.weight))
  const pass = Number(d.plan?.pass_mark ?? 51)
  const gradeOf = new Map(d.grades.map((g) => [`${g.session_id}|${g.student_id}`, g.grade === null ? null : Number(g.grade)]))
  const manualOf = new Map(d.manual.map((m) => [`${m.item_id}|${m.student_id}`, Number(m.score)]))

  const rows = d.students.map((student) => {
    const cells: Record<string, GbCell> = {}
    const termTotals: Record<number, number> = {}
    let pending = 0
    for (const it of items) {
      let score: number | null = null
      let parts: GbCell['parts'] = []
      if (it.source === 'manual') {
        score = manualOf.get(`${it.id}|${student.id}`) ?? null
      } else {
        const linked = d.sessions.filter((s) => s.grading_item_id === it.id)
        parts = linked.map((s) => ({ session_id: s.id, grade: gradeOf.get(`${s.id}|${student.id}`) ?? null }))
        // cuentan las actividades cerradas (ausente = 0) y las abiertas donde ya tiene nota
        const counted = linked
          .map((s) => {
            const g = gradeOf.get(`${s.id}|${student.id}`)
            if (g !== undefined && g !== null) return g
            return s.done ? 0 : null
          })
          .filter((g): g is number => g !== null)
        if (counted.length) score = r2(counted.reduce((a, b) => a + b, 0) / counted.length)
      }
      const contribution = score === null ? null : r2((score / 100) * Number(it.weight))
      if (contribution === null) pending++
      termTotals[it.term] = r2((termTotals[it.term] ?? 0) + (contribution ?? 0))
      cells[it.id] = { score, contribution, parts }
    }
    const final = r2(Object.values(termTotals).reduce((a, b) => a + b, 0))
    const finalRounded = Math.round(final + 1e-9)
    return { student, cells, termTotals, final, finalRounded, pending, passed: finalRounded >= pass }
  })
  return { rows, items, terms, maxByTerm }
}
