import { cleanCell, normalizeText } from '../../lib/text'
import {
  newOption,
  uid,
  validateQuestion,
  type Difficulty,
  type EditorQuestion,
  type QuestionType,
} from './questionModel'

/** Columnas de plantilla_preguntas.xlsx (en orden). */
export const QUESTION_HEADERS = [
  'tipo', 'pregunta', 'imagen', 'opcion_1', 'opcion_2', 'opcion_3', 'opcion_4', 'opcion_5', 'opcion_6',
  'correcta', 'tiempo_seg', 'puntos', 'explicacion', 'dificultad', 'etiquetas',
] as const

const TYPE_ALIASES: Record<string, QuestionType> = {
  single: 'single', unica: 'single', 'opcion unica': 'single', 'opcion multiple': 'single', quiz: 'single', seleccion: 'single',
  multiple: 'multiple', varias: 'multiple', 'varias correctas': 'multiple', 'seleccion multiple': 'multiple',
  'true false': 'true_false', vf: 'true_false', 'v f': 'true_false', 'verdadero falso': 'true_false', 'verdadero o falso': 'true_false',
  'short text': 'short_text', 'respuesta corta': 'short_text', texto: 'short_text', escrita: 'short_text', corta: 'short_text',
  ordering: 'ordering', ordenar: 'ordering', orden: 'ordering', puzzle: 'ordering',
  'image choice': 'image_choice', imagenes: 'image_choice', imagen: 'image_choice', 'elegir imagen': 'image_choice',
}

export const TYPE_EXCEL_NAME: Record<QuestionType, string> = {
  single: 'single', multiple: 'multiple', true_false: 'true_false', short_text: 'short_text', ordering: 'ordering', image_choice: 'image_choice',
}

export interface ParsedQuestionRow {
  rowNumber: number
  question: EditorQuestion | null
  errors: string[]
  warnings: string[]
  /** nombres de archivo (en el ZIP) que usa esta fila */
  zipImages: string[]
}

export interface QuestionParseResult {
  rows: ParsedQuestionRow[]
  fatal?: string
  stats: { total: number; valid: number; errors: number; byType: Partial<Record<QuestionType, number>> }
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s)
/** Prefijo para imágenes que vienen en el ZIP (se reemplaza por la URL al subirlas). */
export const ZIP_PREFIX = 'zip:'
export const zipKey = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')

function parseImage(cell: string, zipNames: Set<string>, errors: string[], label: string, used: string[]): string | null {
  if (!cell) return null
  if (isUrl(cell)) return cell
  const k = zipKey(cell)
  if (!zipNames.has(k)) {
    errors.push(
      zipNames.size
        ? `la imagen "${cell}" (columna ${label}) no está en el ZIP.`
        : `la columna ${label} dice "${cell}": sube el ZIP con las imágenes junto al Excel, o usa una dirección web (https://…).`,
    )
    return null
  }
  used.push(k)
  return ZIP_PREFIX + k
}

function parseList(cell: string): string[] {
  return cell
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function parsePoints(cell: string, warnings: string[]): 0 | 1000 | 2000 {
  const n = normalizeText(cell)
  if (!n) return 1000
  if (['0', 'sin puntos', 'ninguno', 'no', 'practica'].includes(n)) return 0
  if (['2000', 'doble', 'x2', '2x'].includes(n)) return 2000
  if (['1000', 'estandar', 'normal', 'standard'].includes(n)) return 1000
  warnings.push(`puntos "${cell}" no reconocido; se usó 1000.`)
  return 1000
}

function parseDifficulty(cell: string): Difficulty | null {
  const n = normalizeText(cell)
  if (!n) return null
  if (n.startsWith('fac')) return 'facil'
  if (n.startsWith('med') || n === 'normal') return 'media'
  if (n.startsWith('dif')) return 'dificil'
  return null
}

function findHeader(matrix: unknown[][]) {
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const map = new Map<string, number>()
    matrix[r]?.forEach((cell, c) => {
      const h = normalizeText(cell).replace(/\s+/g, '_')
      const norm = h === 'opcion1' ? 'opcion_1' : h.replace(/^opcion_?(\d)$/, 'opcion_$1').replace(/^explicacion$|^retroalimentacion$/, 'explicacion')
      const alias: Record<string, string> = { enunciado: 'pregunta', respuesta: 'correcta', respuesta_correcta: 'correcta', tiempo: 'tiempo_seg', segundos: 'tiempo_seg', tags: 'etiquetas' }
      const key = alias[norm] ?? norm
      if ((QUESTION_HEADERS as readonly string[]).includes(key) && !map.has(key)) map.set(key, c)
    })
    if (map.has('tipo') && map.has('pregunta')) return { headerRow: r, map }
  }
  return null
}

/**
 * Lee la hoja de preguntas, valida cada fila y la convierte en preguntas del editor.
 * @param zipNames nombres (normalizados con zipKey) de las imágenes del ZIP
 */
export function parseQuestionMatrix(matrix: unknown[][], zipNames: Set<string> = new Set()): QuestionParseResult {
  const emptyStats = { total: 0, valid: 0, errors: 0, byType: {} }
  const found = findHeader(matrix)
  if (!found)
    return {
      rows: [],
      fatal: 'No encontré los encabezados "tipo" y "pregunta". Descarga la plantilla de preguntas para ver el formato.',
      stats: emptyStats,
    }
  const { headerRow, map } = found
  const get = (row: unknown[], k: string) => {
    const c = map.get(k)
    return c === undefined ? '' : cleanCell(row[c])
  }

  const rows: ParsedQuestionRow[] = []
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? []
    if (raw.every((c) => cleanCell(c) === '')) continue
    const errors: string[] = []
    const warnings: string[] = []
    const zipImages: string[] = []

    const tipoRaw = get(raw, 'tipo')
    const type = TYPE_ALIASES[normalizeText(tipoRaw)]
    if (!type) {
      errors.push(
        tipoRaw
          ? `el tipo "${tipoRaw}" no existe. Usa: single, multiple, true_false, short_text, ordering o image_choice.`
          : 'falta el tipo de pregunta.',
      )
      rows.push({ rowNumber: r + 1, question: null, errors, warnings, zipImages })
      continue
    }

    const optionCells = [1, 2, 3, 4, 5, 6].map((i) => get(raw, `opcion_${i}`))
    // Opciones hasta la última no vacía (permite huecos detectables)
    let lastFilled = -1
    optionCells.forEach((v, i) => v && (lastFilled = i))
    const optCells = optionCells.slice(0, lastFilled + 1)
    const correctRaw = get(raw, 'correcta')
    const timeRaw = get(raw, 'tiempo_seg')
    let time = 20
    if (timeRaw) {
      const t = Number(timeRaw.replace(',', '.'))
      if (!Number.isFinite(t) || t < 5 || t > 600) errors.push(`el tiempo "${timeRaw}" debe ser un número entre 5 y 600 segundos.`)
      else time = Math.round(t)
    }

    const q: EditorQuestion = {
      key: uid(),
      type,
      prompt: get(raw, 'pregunta'),
      image_url: parseImage(get(raw, 'imagen'), zipNames, errors, 'imagen', zipImages),
      time_limit_sec: time,
      base_points: parsePoints(get(raw, 'puntos'), warnings),
      difficulty: parseDifficulty(get(raw, 'dificultad')),
      explanation: get(raw, 'explicacion'),
      tags: parseList(get(raw, 'etiquetas')).map((t) => t.toLowerCase()),
      accepted_answers: [],
      options: [],
    }
    if (get(raw, 'dificultad') && !q.difficulty) warnings.push(`dificultad "${get(raw, 'dificultad')}" no reconocida (usa fácil, media o difícil).`)
    if (optCells.some((v) => !v) && type !== 'short_text' && type !== 'true_false')
      errors.push('hay una opción vacía entre otras opciones (no dejes columnas de opción en blanco en medio).')

    const n = optCells.length
    const optionNumber = (token: string): number | null => {
      const k = Number(token)
      if (!Number.isInteger(k) || k < 1) {
        errors.push(`la columna 'correcta' tiene "${token}", que no es un número de opción.`)
        return null
      }
      if (k > n) {
        errors.push(`la columna 'correcta' indica la opción ${k} pero solo hay ${n} opciones.`)
        return null
      }
      return k
    }

    switch (type) {
      case 'single':
      case 'image_choice': {
        q.options = optCells.map((t, i) =>
          type === 'image_choice'
            ? newOption({ text: '', image_url: parseImage(t, zipNames, errors, `opcion_${i + 1}`, zipImages) })
            : newOption({ text: t }),
        )
        if (!correctRaw) errors.push("falta la columna 'correcta' (número de la opción correcta).")
        else if (parseList(correctRaw).length > 1) errors.push("este tipo admite una sola respuesta correcta; para varias usa el tipo 'multiple'.")
        else {
          const k = optionNumber(correctRaw)
          if (k) q.options[k - 1].is_correct = true
        }
        break
      }
      case 'multiple': {
        q.options = optCells.map((t) => newOption({ text: t }))
        if (!correctRaw) errors.push("falta la columna 'correcta' (por ejemplo 1,3).")
        for (const tok of parseList(correctRaw)) {
          const k = optionNumber(tok)
          if (k) q.options[k - 1].is_correct = true
        }
        break
      }
      case 'true_false': {
        const v = normalizeText(correctRaw)
        const isTrue = ['v', 'verdadero', 'true', 't', 'si', '1'].includes(v)
        const isFalse = ['f', 'falso', 'false', 'no', '0'].includes(v)
        if (!isTrue && !isFalse) errors.push(`la columna 'correcta' debe ser V o F (dice "${correctRaw || 'vacío'}").`)
        q.options = [newOption({ text: 'Verdadero', is_correct: isTrue }), newOption({ text: 'Falso', is_correct: !isTrue && isFalse })]
        break
      }
      case 'short_text': {
        q.accepted_answers = correctRaw
          .split('|')
          .map((x) => x.trim())
          .filter(Boolean)
        if (!q.accepted_answers.length) errors.push("falta la columna 'correcta' con las respuestas aceptadas (sepáralas con |).")
        if (n) warnings.push('las columnas de opciones se ignoran en preguntas de respuesta corta.')
        break
      }
      case 'ordering': {
        // Sin 'correcta' → el orden de las columnas ya es el correcto.
        let order = optCells.map((_, i) => i + 1)
        if (correctRaw) {
          const toks = parseList(correctRaw)
          const nums = toks.map(optionNumber)
          if (nums.every((x) => x !== null)) {
            const set = new Set(nums)
            if (nums.length !== n || set.size !== n)
              errors.push(`la columna 'correcta' debe listar las ${n} opciones una sola vez (por ejemplo ${[...Array(n)].map((_, i) => n - i).join(',')}).`)
            else order = nums as number[]
          }
        }
        q.options = order.map((k, i) => newOption({ text: optCells[k - 1] ?? '', is_correct: true, correct_position: i + 1 }))
        break
      }
    }

    for (const msg of validateQuestion(q)) {
      const m = msg.charAt(0).toLowerCase() + msg.slice(1)
      // evita repetir lo ya explicado con más detalle
      if (m.includes('respuesta') && errors.some((x) => x.includes("'correcta'"))) continue
      if (m.includes('imagen') && errors.some((x) => x.includes('ZIP'))) continue
      if (!errors.includes(m)) errors.push(m)
    }

    rows.push({ rowNumber: r + 1, question: q, errors, warnings, zipImages })
  }

  const byType: Partial<Record<QuestionType, number>> = {}
  rows.forEach((x) => x.question && !x.errors.length && (byType[x.question.type] = (byType[x.question.type] ?? 0) + 1))
  const stats = {
    total: rows.length,
    errors: rows.filter((x) => x.errors.length).length,
    valid: rows.filter((x) => !x.errors.length).length,
    byType,
  }
  if (!rows.length) return { rows, fatal: 'La hoja no tiene preguntas debajo de los encabezados.', stats }
  return { rows, stats }
}

export function questionErrorMessages(rows: ParsedQuestionRow[]) {
  return rows.flatMap((r) => r.errors.map((e) => `Fila ${r.rowNumber}: ${e}`))
}

/** Preguntas → filas de Excel con el mismo formato de la plantilla (para exportar o respaldar). */
export function questionsToMatrix(questions: EditorQuestion[]): (string | number | null)[][] {
  return questions.map((q) => {
    const opts = q.type === 'short_text' ? [] : q.options
    const cells = [0, 1, 2, 3, 4, 5].map((i) => {
      const o = opts[i]
      if (!o) return null
      return q.type === 'image_choice' ? o.image_url : o.text
    })
    let correcta = ''
    if (q.type === 'single' || q.type === 'image_choice') correcta = String(opts.findIndex((o) => o.is_correct) + 1)
    if (q.type === 'multiple') correcta = opts.map((o, i) => (o.is_correct ? i + 1 : 0)).filter(Boolean).join(',')
    if (q.type === 'true_false') correcta = opts[0]?.is_correct ? 'V' : 'F'
    if (q.type === 'short_text') correcta = q.accepted_answers.join('|')
    if (q.type === 'ordering') correcta = opts.map((_, i) => i + 1).join(',')
    return [
      TYPE_EXCEL_NAME[q.type],
      q.prompt,
      q.image_url,
      ...cells,
      correcta,
      q.time_limit_sec,
      q.base_points,
      q.explanation || null,
      q.difficulty === 'facil' ? 'fácil' : q.difficulty === 'dificil' ? 'difícil' : q.difficulty,
      q.tags.join(', ') || null,
    ]
  })
}
