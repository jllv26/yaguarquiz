import type { GradingItem } from '../../types/db'

/** Plan de calificación del Ing. Jimmy Laruta: 30 + 30 + 40 = 100 */
const BASE: { category: string; weight: number; source: GradingItem['source'] }[] = [
  { category: 'Asistencia y compromiso', weight: 5, source: 'manual' },
  { category: 'Ejercicios en clase', weight: 3, source: 'yaguarquiz' },
  { category: 'Investigaciones para casa', weight: 5, source: 'yaguarquiz' },
  { category: 'Prácticas para casa', weight: 5, source: 'yaguarquiz' },
  { category: 'Exposiciones', weight: 5, source: 'manual' },
  { category: 'Examen y pruebas escritas', weight: 7, source: 'yaguarquiz' },
]

export const DEFAULT_GRADING_PLAN: GradingItem[] = [
  ...[1, 2, 3].flatMap((term) => BASE.map((b) => ({ term, ...b }))),
  { term: 3, category: 'Proyecto final', weight: 10, source: 'manual' as const },
]

export const TERM_LABEL = (t: number) => `${['', 'Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto'][t] ?? t + '°'} parcial`

/** Colores disponibles para cada asignatura. */
export const SUBJECT_COLORS = ['#1B7339', '#1F3864', '#8B1A1A', '#C9A23A', '#2D7DFF', '#7C3AED', '#14B8A6', '#FF3355', '#E07A1F', '#4D4D4D']
