import { normalizeText } from '../../lib/text'

/**
 * Calificación automática de una investigación «por cumplimiento» (pedido del docente: no calificar a mano).
 *
 * No juzga la calidad como un docente: mide si el estudiante cumplió lo pedido.
 *  - Completitud: cada pregunta cuenta hasta el mínimo de palabras (min_words).
 *  - Conceptos: cuántos términos del criterio (título + descripción) aparecen en sus respuestas.
 *  - Datos: si el criterio pide datos o cálculos, exige números en las respuestas.
 *  - Redacción: el criterio de redacción se mide solo por completitud.
 * Cada criterio sale 2 (Cumple), 1 (A medias) o 0 (No cumple), igual que la rúbrica manual.
 */

export interface AutoGradeInput {
  criteria: { title: string; desc?: string }[]
  minWords: number
  answers: { question: string; text: string }[]
}
export interface AutoGradeResult {
  scores: number[]
  grade: number
  comment: string
}

const STOP = new Set(
  'para como cada entre sobre desde hasta donde cuando porque tiene tienen hacer hace este esta estos estas esos esas aquel otra otro otros otras puede pueden debe deben todo toda todos todas muy mas menos tambien solo sola ademas segun mismo misma tema temas texto generico propia propio clara claro concreto concretos concretas real reales datos dato cuenta cuentas usa usar uso pueda pero unos unas cual bien algo sino sean seran esto eso son las los del una uno que con por'
    .split(' '),
)
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
const stem = (w: string) => w.slice(0, 6)

/** Términos clave de un criterio: palabras de 4 o más letras (siglas incluidas), sin palabras vacías. */
export function criterionTerms(c: { title: string; desc?: string }): string[] {
  const raw = `${c.title} ${c.desc ?? ''}`
  const acronyms = raw.match(/\b[A-Z]{3,5}\b/g) ?? []
  const plain = normalizeText(raw)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
  return [...new Set([...acronyms.map((a) => a.toLowerCase()), ...plain.map(stem)])]
}

const WRITING = /redacci|ortograf|clara|propia/i
const NEEDS_NUMBERS = /dato|numer|cifra|seguidor|fecha|calcul|cpa|roas|roi|ctr|metric|porcentaje/i

export function autoGradeResearch({ criteria, minWords, answers }: AutoGradeInput): AutoGradeResult {
  const min = Math.max(10, minWords || 40)
  const n = Math.max(1, answers.length)
  const completeness = answers.reduce((a, x) => a + Math.min(words(x.text), min), 0) / (n * min) // 0..1
  const empty = answers.filter((x) => words(x.text) === 0).length
  const text = normalizeText(answers.map((a) => a.text).join(' '))
  const tokens = new Set(text.split(/[^a-z0-9ñ]+/).filter(Boolean).flatMap((w) => [w, stem(w)]))
  const numbers = (answers.map((a) => a.text).join(' ').match(/\d+([.,]\d+)?/g) ?? []).length

  const notes: string[] = []
  const scores = criteria.map((c) => {
    if (WRITING.test(c.title)) {
      const s = completeness >= 0.9 && empty === 0 ? 2 : completeness >= 0.5 ? 1 : 0
      if (s < 2) notes.push(`${c.title}: respuestas incompletas o muy cortas`)
      return s
    }
    const terms = criterionTerms(c)
    const hits = terms.filter((t) => tokens.has(t)).length
    let s = hits >= 2 && completeness >= 0.75 ? 2 : (hits >= 1 || completeness >= 0.5) && completeness >= 0.25 ? 1 : 0
    if (s === 2 && NEEDS_NUMBERS.test(`${c.title} ${c.desc ?? ''}`) && numbers < 2) s = 1
    if (s < 2) notes.push(`${c.title}: ${hits < 2 ? 'faltan conceptos del tema' : 'faltan datos o desarrollo'}`)
    return s
  })
  const grade = Math.round((10000 * scores.reduce((a, b) => a + b, 0)) / (Math.max(1, criteria.length) * 2)) / 100
  const comment =
    'Calificación automática por cumplimiento.' +
    (empty ? ` Dejó ${empty} pregunta${empty === 1 ? '' : 's'} sin responder.` : '') +
    (notes.length ? ` Para mejorar: ${notes.join('; ')}.` : ' Cumplió con todo lo pedido.')
  return { scores, grade, comment }
}
