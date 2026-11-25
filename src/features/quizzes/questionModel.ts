import { normalizeText } from '../../lib/text'

export type QuestionType = 'single' | 'multiple' | 'true_false' | 'short_text' | 'ordering' | 'image_choice'
export type Difficulty = 'facil' | 'media' | 'dificil'

export interface EditorOption {
  id?: string
  /** clave local estable para React (no se guarda) */
  key: string
  text: string
  image_url: string | null
  is_correct: boolean
  correct_position: number | null
}

export interface EditorQuestion {
  id?: string
  key: string
  type: QuestionType
  prompt: string
  image_url: string | null
  time_limit_sec: number
  base_points: 0 | 1000 | 2000
  difficulty: Difficulty | null
  explanation: string
  tags: string[]
  accepted_answers: string[]
  options: EditorOption[]
  /** escena del caso (questions.extra.scene): solo se muestra, el editor no la cambia */
  scene?: import('../../components/SceneCard').Scene | null
}

export const TIME_PRESETS = [5, 10, 20, 30, 45, 60, 90, 120]
export const POINTS = [
  { value: 1000, label: 'Estándar', hint: '1000 pts' },
  { value: 2000, label: 'Doble', hint: '2000 pts' },
  { value: 0, label: 'Sin puntos', hint: 'práctica' },
] as const

export const QUESTION_TYPES: Record<
  QuestionType,
  { label: string; short: string; description: string; minOptions: number; maxOptions: number }
> = {
  single: { label: 'Opción única', short: 'Única', description: 'Una sola respuesta correcta', minOptions: 2, maxOptions: 6 },
  multiple: { label: 'Varias correctas', short: 'Varias', description: 'Dos o más respuestas correctas (puntaje parcial)', minOptions: 2, maxOptions: 6 },
  true_false: { label: 'Verdadero / Falso', short: 'V/F', description: 'Dos opciones fijas', minOptions: 2, maxOptions: 2 },
  short_text: { label: 'Respuesta corta', short: 'Escrita', description: 'El estudiante escribe; ignora mayúsculas, tildes y espacios', minOptions: 0, maxOptions: 0 },
  ordering: { label: 'Ordenar', short: 'Ordenar', description: 'Arrastrar los elementos al orden correcto', minOptions: 2, maxOptions: 6 },
  image_choice: { label: 'Elegir imagen', short: 'Imágenes', description: 'Las opciones son imágenes; una es la correcta', minOptions: 2, maxOptions: 6 },
}

let seq = 0
export const uid = () => `k${Date.now().toString(36)}${(++seq).toString(36)}`

export function newOption(partial: Partial<EditorOption> = {}): EditorOption {
  return { key: uid(), text: '', image_url: null, is_correct: false, correct_position: null, ...partial }
}

/** Pregunta nueva con valores por defecto (20 s, 1000 pts). */
export function newQuestion(type: QuestionType = 'single'): EditorQuestion {
  const base: EditorQuestion = {
    key: uid(),
    type,
    prompt: '',
    image_url: null,
    time_limit_sec: 20,
    base_points: 1000,
    difficulty: null,
    explanation: '',
    tags: [],
    accepted_answers: [],
    options: [],
  }
  return convertType(base, type)
}

/** Cambia el tipo de una pregunta conservando lo que se pueda. */
export function convertType(q: EditorQuestion, type: QuestionType): EditorQuestion {
  const out: EditorQuestion = { ...q, type }
  const texts = q.options.map((o) => o.text).filter(Boolean)
  switch (type) {
    case 'true_false': {
      const wasTrue = q.type === 'true_false' ? q.options[0]?.is_correct ?? true : true
      out.options = [
        newOption({ id: q.options[0]?.id, text: 'Verdadero', is_correct: wasTrue }),
        newOption({ id: q.options[1]?.id, text: 'Falso', is_correct: !wasTrue }),
      ]
      break
    }
    case 'short_text':
      out.options = []
      if (!out.accepted_answers.length) out.accepted_answers = q.options.filter((o) => o.is_correct && o.text).map((o) => o.text)
      break
    case 'ordering': {
      const src = q.options.length >= 2 && q.type !== 'true_false' ? q.options : [newOption(), newOption(), newOption()]
      out.options = src.map((o, i) => ({ ...o, is_correct: true, correct_position: i + 1, image_url: null }))
      break
    }
    case 'image_choice': {
      const src = q.options.length >= 2 && q.type !== 'true_false' ? q.options : [newOption(), newOption(), newOption(), newOption()]
      let found = false
      out.options = src.map((o) => {
        const c = o.is_correct && !found
        if (c) found = true
        return { ...o, is_correct: c, correct_position: null }
      })
      if (!found) out.options[0].is_correct = true
      break
    }
    case 'single':
    case 'multiple': {
      const src =
        q.type === 'true_false' || q.type === 'short_text' || q.options.length < 2
          ? [0, 1, 2, 3].map((i) => newOption({ text: texts[i] ?? (q.type === 'short_text' && i === 0 ? q.accepted_answers[0] ?? '' : '') }))
          : q.options.map((o) => ({ ...o, correct_position: null }))
      if (type === 'single') {
        let found = false
        out.options = src.map((o) => {
          const c = o.is_correct && !found
          if (c) found = true
          return { ...o, is_correct: c }
        })
        if (!found) out.options[0] = { ...out.options[0], is_correct: true }
      } else {
        out.options = src
        if (!src.some((o) => o.is_correct)) out.options[0] = { ...out.options[0], is_correct: true }
      }
      break
    }
  }
  return out
}

/** Reglas de validación (las mismas para el editor y para el Excel). */
export function validateQuestion(q: EditorQuestion): string[] {
  const e: string[] = []
  const meta = QUESTION_TYPES[q.type]
  if (!q.prompt.trim()) e.push('Falta el enunciado de la pregunta.')
  if (q.time_limit_sec < 5 || q.time_limit_sec > 600) e.push('El tiempo debe estar entre 5 y 600 segundos.')
  if (q.type === 'short_text') {
    if (!q.accepted_answers.some((a) => a.trim())) e.push('Escribe al menos una respuesta aceptada.')
    return e
  }
  const opts = q.options
  if (opts.length < meta.minOptions) e.push(`Necesita al menos ${meta.minOptions} opciones.`)
  if (opts.length > meta.maxOptions) e.push(`Máximo ${meta.maxOptions} opciones.`)
  if (q.type === 'image_choice') {
    if (opts.some((o) => !o.image_url)) e.push('Cada opción necesita una imagen.')
  } else if (opts.some((o) => !o.text.trim())) e.push('Hay opciones vacías.')
  const correct = opts.filter((o) => o.is_correct).length
  if ((q.type === 'single' || q.type === 'true_false' || q.type === 'image_choice') && correct !== 1)
    e.push('Marca exactamente una respuesta correcta.')
  if (q.type === 'multiple' && correct < 1) e.push('Marca al menos una respuesta correcta.')
  return e
}

/** Pregunta tal como viene de la base de datos → modelo del editor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDb(row: any): EditorQuestion {
  const byOrder = row.type === 'ordering'
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) => (a.correct_position ?? a.sort_order) - (b.correct_position ?? b.sort_order)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) => a.sort_order - b.sort_order
  const options = [...(row.question_options ?? [])]
    .sort(byOrder)
    .map((o) => ({
      id: o.id,
      key: o.id ?? uid(),
      text: o.text ?? '',
      image_url: o.image_url ?? null,
      is_correct: !!o.is_correct,
      correct_position: o.correct_position ?? null,
    }))
  return {
    id: row.id,
    key: row.id ?? uid(),
    type: (row.type as QuestionType) ?? 'single',
    prompt: row.prompt ?? '',
    image_url: row.image_url ?? null,
    time_limit_sec: row.time_limit_sec ?? 20,
    base_points: row.base_points ?? 1000,
    difficulty: row.difficulty ?? null,
    explanation: row.explanation ?? '',
    tags: row.tags ?? [],
    accepted_answers: row.accepted_answers ?? [],
    options,
    scene: row.extra?.scene ?? null,
  }
}

/** Modelo del editor → JSON para save_question / import_questions. */
export function toDb(q: EditorQuestion, quizId: string) {
  return {
    id: q.id,
    quiz_id: quizId,
    type: q.type,
    prompt: q.prompt.trim(),
    image_url: q.image_url,
    time_limit_sec: q.time_limit_sec,
    base_points: q.base_points,
    difficulty: q.difficulty,
    explanation: q.explanation.trim() || null,
    tags: q.tags,
    accepted_answers: q.type === 'short_text' ? q.accepted_answers.map((a) => a.trim()).filter(Boolean) : [],
    options:
      q.type === 'short_text'
        ? []
        : q.options.map((o, i) => ({
            id: o.id,
            text: o.text.trim(),
            image_url: o.image_url,
            is_correct: q.type === 'ordering' ? true : o.is_correct,
            // En "ordenar", el editor muestra las opciones en el orden correcto
            correct_position: q.type === 'ordering' ? i + 1 : null,
          })),
  }
}

/** Compara una respuesta escrita con las aceptadas (sin mayúsculas, tildes ni espacios extra). */
export function matchesShortAnswer(answer: string, accepted: string[]) {
  const a = normalizeText(answer)
  return !!a && accepted.some((x) => normalizeText(x) === a)
}
