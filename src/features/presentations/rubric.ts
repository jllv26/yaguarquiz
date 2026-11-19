export interface RubricLevel {
  v: number
  emoji: string
  label: string
  hint: string
}
export interface RubricCriterion {
  title: string
  question: string
  icon: string
  /** descripción de cada nivel: { "1": "…", "2": "…" } */
  levels: Record<string, string>
}
export interface Rubric {
  levels: RubricLevel[]
  criteria: RubricCriterion[]
}
export interface PresentationSettings {
  teacher_weight: number
  require_ci: boolean
  block_own_group: boolean
  min_why: number
  min_understood: number
}
export const DEFAULT_SETTINGS: PresentationSettings = { teacher_weight: 50, require_ci: true, block_own_group: true, min_why: 15, min_understood: 25 }

/** Rúbrica de la "Copa Salvando el Semestre" (Marketing Digital ICOM261), tal como la usaba el docente. */
export const COPA_RUBRIC: Rubric = {
  levels: [
    { v: 1, emoji: '🆘', label: 'Pide rescate', hint: 'No suficiente' },
    { v: 2, emoji: '🛟', label: 'Se salva', hint: 'Suficiente' },
    { v: 3, emoji: '🏆', label: '¡Salvó el semestre!', hint: 'Excelente' },
  ],
  criteria: [
    { icon: '🧠', title: 'Dominio del tema', question: '¿Se notó que entendía su tema y lo explicó sin leer?', levels: { 1: 'Leyó casi todo o se confundió.', 2: 'Explicó lo básico, con algo de lectura.', 3: 'Lo explicó con sus palabras y con seguridad.' } },
    { icon: '💡', title: 'Momento memorable', question: '¿Nos atrapó desde el inicio y nos hizo participar?', levels: { 1: 'No hubo apertura ni actividad.', 2: 'Abrió bien o hizo la actividad, pero participamos poco.', 3: 'Abrió con un dato o una pregunta que atrapó y todos participamos.' } },
    { icon: '📍', title: 'Caso real de Cobija', question: '¿Mostró un ejemplo real con su evidencia (captura, foto o fuente)?', levels: { 1: 'Sin ejemplo, o un ejemplo inventado.', 2: 'Ejemplo real, pero sin evidencia clara.', 3: 'Caso real con su evidencia, bien explicado.' } },
    { icon: '⏱️', title: 'Claridad y tiempo', question: '¿Se entendió, aprovechó bien su tiempo y cerró con su frase?', levels: { 1: 'Confuso, muy corto o se pasó mucho.', 2: 'Se entendió, pero falló el tiempo o el cierre.', 3: 'Claro, a tiempo y cerró con su frase.' } },
    { icon: '🎯', title: 'Responde preguntas', question: '¿Respondió bien la pregunta del docente o del curso?', levels: { 1: 'No supo responder.', 2: 'Respondió con dudas.', 3: 'Respondió bien y con seguridad.' } },
  ],
}

/** Rúbrica general (4 niveles) para cualquier materia. */
export const GENERAL_RUBRIC: Rubric = {
  levels: [
    { v: 1, emoji: '🌱', label: 'En inicio', hint: 'Insuficiente' },
    { v: 2, emoji: '🐾', label: 'En proceso', hint: 'Regular' },
    { v: 3, emoji: '🐆', label: 'Logrado', hint: 'Bueno' },
    { v: 4, emoji: '🏆', label: '¡Garra de jaguar!', hint: 'Excelente' },
  ],
  criteria: [
    { icon: '🧠', title: 'Dominio del tema', question: '¿Explicó con sus palabras y sin leer?', levels: { 1: 'Leyó todo o se confundió.', 2: 'Explicó lo básico con mucha lectura.', 3: 'Explicó bien con poca lectura.', 4: 'Dominó el tema con seguridad y ejemplos.' } },
    { icon: '🗂️', title: 'Organización', question: '¿Tuvo inicio, desarrollo y cierre claros?', levels: { 1: 'Desordenado.', 2: 'Algo de orden.', 3: 'Ordenado.', 4: 'Muy bien estructurado y fácil de seguir.' } },
    { icon: '🖼️', title: 'Material de apoyo', question: '¿Las diapositivas o recursos ayudaron a entender?', levels: { 1: 'Sin material o ilegible.', 2: 'Material con mucho texto.', 3: 'Material claro.', 4: 'Material claro, visual y bien usado.' } },
    { icon: '⏱️', title: 'Tiempo y voz', question: '¿Se escuchó bien y respetó el tiempo?', levels: { 1: 'No se escuchó o no respetó el tiempo.', 2: 'Problemas de voz o de tiempo.', 3: 'Buena voz y tiempo adecuado.', 4: 'Voz segura y tiempo exacto.' } },
    { icon: '🎯', title: 'Responde preguntas', question: '¿Respondió las preguntas del docente o del curso?', levels: { 1: 'No supo responder.', 2: 'Respondió con dudas.', 3: 'Respondió bien.', 4: 'Respondió con seguridad y amplió la idea.' } },
  ],
}

export const TEMPLATES = [
  { id: 'copa', name: 'Copa Salvando el Semestre (3 niveles)', rubric: COPA_RUBRIC },
  { id: 'general', name: 'Rúbrica general (4 niveles)', rubric: GENERAL_RUBRIC },
]

export const maxLevel = (r: Rubric) => Math.max(...r.levels.map((l) => l.v))
/** Igual que en el servidor: suma ÷ (criterios × nivel máximo) × 100 */
export function scoreOf(scores: (number | null | undefined)[], r: Rubric): number | null {
  if (!scores.length || scores.some((s) => s == null)) return null
  const sum = (scores as number[]).reduce((a, b) => a + b, 0)
  return Math.round((10000 * sum) / (scores.length * maxLevel(r))) / 100
}
export const fmt = (n: number | null | undefined, d = 1) => (n == null ? '—' : Number(n).toLocaleString('es-BO', { maximumFractionDigits: d, minimumFractionDigits: 0 }))
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
