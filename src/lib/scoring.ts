import { matchesShortAnswer, type EditorQuestion } from '../features/quizzes/questionModel'

/** Respuesta del estudiante, según el tipo de pregunta (claves de opción). */
export type StudentResponse =
  | { kind: 'choice'; key: string }
  | { kind: 'choices'; keys: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'order'; keys: string[] }

export interface GradeResult {
  correct: boolean
  /** 0 a 1 (puntaje parcial para "varias correctas" y "ordenar") */
  partial: number
}

/**
 * Corrige una respuesta. (En las partidas reales esto lo hace el servidor;
 * aquí se usa para la vista previa del docente y para las pruebas.)
 */
export function grade(q: EditorQuestion, r: StudentResponse | null): GradeResult {
  if (!r) return { correct: false, partial: 0 }
  switch (q.type) {
    case 'single':
    case 'true_false':
    case 'image_choice': {
      const ok = r.kind === 'choice' && q.options.find((o) => o.key === r.key)?.is_correct === true
      return { correct: ok, partial: ok ? 1 : 0 }
    }
    case 'multiple': {
      if (r.kind !== 'choices') return { correct: false, partial: 0 }
      const correct = q.options.filter((o) => o.is_correct).map((o) => o.key)
      const hits = r.keys.filter((k) => correct.includes(k)).length
      const wrong = r.keys.length - hits
      const partial = correct.length ? Math.max(0, (hits - wrong) / correct.length) : 0
      return { correct: partial === 1, partial }
    }
    case 'short_text': {
      const ok = r.kind === 'text' && matchesShortAnswer(r.text, q.accepted_answers)
      return { correct: ok, partial: ok ? 1 : 0 }
    }
    case 'ordering': {
      if (r.kind !== 'order') return { correct: false, partial: 0 }
      const right = q.options.map((o) => o.key) // el editor guarda las opciones en el orden correcto
      const inPlace = r.keys.filter((k, i) => right[i] === k).length
      const partial = right.length ? inPlace / right.length : 0
      return { correct: partial === 1, partial }
    }
  }
}

/**
 * Puntos de juego estilo Kahoot:
 * puntos = round(base × (1 − (tiempo / límite) / 2)) × parcial
 */
export function gamePoints(basePoints: number, timeMs: number, limitSec: number, partial: number) {
  if (partial <= 0 || basePoints <= 0) return 0
  const ratio = Math.min(1, Math.max(0, timeMs / (limitSec * 1000)))
  return Math.round(basePoints * (1 - ratio / 2) * partial)
}

/** Bonus por racha: +100 por cada acierto consecutivo desde el 2º (máx. +500). */
export function streakBonus(streak: number) {
  return Math.min(500, Math.max(0, (streak - 1) * 100))
}
