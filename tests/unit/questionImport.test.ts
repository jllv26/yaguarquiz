import { describe, expect, it } from 'vitest'
import { buildWorkbook, readTable } from '../../src/lib/excel'
import {
  parseQuestionMatrix,
  QUESTION_HEADERS,
  questionErrorMessages,
  questionsToMatrix,
  ZIP_PREFIX,
} from '../../src/features/quizzes/questionImport'
import { buildQuestionTemplate } from '../../src/features/quizzes/questionTemplate'
import { convertType, matchesShortAnswer, newQuestion, toDb, validateQuestion } from '../../src/features/quizzes/questionModel'

/** 30 preguntas: 5 de cada tipo MVP. */
function thirty(): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [[...QUESTION_HEADERS]]
  for (let i = 1; i <= 5; i++) {
    rows.push(['single', `Única ${i}: ¿capital de Pando?`, null, 'Cobija', 'Riberalta', 'Trinidad', 'Sucre', null, null, (i % 4) + 1, 20, 1000, 'Explicación', 'fácil', 'pando, geo'])
    rows.push(['multiple', `Varias ${i}`, `https://ejemplo.com/img${i}.png`, 'A', 'B', 'C', 'D', 'E', null, '1,3,5', 30, 2000, null, 'media', null])
    rows.push(['true_false', `VF ${i}`, null, null, null, null, null, null, null, i % 2 ? 'V' : 'falso', 10, 0, null, null, 'vf'])
    rows.push(['short_text', `Corta ${i}`, null, null, null, null, null, null, null, 'Cobija|cobija pando', 30, 1000, null, 'difícil', null])
    rows.push(['ordering', `Ordenar ${i}`, null, 'uno', 'dos', 'tres', 'cuatro', null, null, '3,1,4,2', 45, 1000, null, null, null])
    rows.push(['image_choice', `Imagen ${i}`, `foto${i}.jpg`, 'a.png', 'b.png', 'https://x.com/c.png', null, null, null, 2, 20, 1000, null, null, null])
  }
  return rows
}
const ZIP = new Set(['a.png', 'b.png', 'foto1.jpg', 'foto2.jpg', 'foto3.jpg', 'foto4.jpg', 'foto5.jpg'])

describe('importación de preguntas', () => {
  it('importa 30 preguntas de los 6 tipos MVP sin errores', async () => {
    const blob = await buildWorkbook([{ sheet: 'Preguntas', data: thirty() }])
    const res = parseQuestionMatrix(await readTable(blob), ZIP)
    expect(questionErrorMessages(res.rows)).toEqual([])
    expect(res.stats).toMatchObject({ total: 30, valid: 30, errors: 0 })
    expect(res.stats.byType).toEqual({ single: 5, multiple: 5, true_false: 5, short_text: 5, ordering: 5, image_choice: 5 })
    const q = res.rows.map((r) => r.question!)
    expect(q[0].options.findIndex((o) => o.is_correct)).toBe(1) // i=1 → (1%4)+1 = 2
    expect(q[1].options.filter((o) => o.is_correct).map((o) => o.text)).toEqual(['A', 'C', 'E'])
    expect(q[1].base_points).toBe(2000)
    expect(q[2].options.map((o) => o.is_correct)).toEqual([true, false])
    expect(q[3].accepted_answers).toEqual(['Cobija', 'cobija pando'])
    expect(q[4].options.map((o) => o.text)).toEqual(['tres', 'uno', 'cuatro', 'dos'])
    expect(q[5].image_url).toBe(ZIP_PREFIX + 'foto1.jpg')
    expect(q[5].options.map((o) => o.image_url)).toEqual([ZIP_PREFIX + 'a.png', ZIP_PREFIX + 'b.png', 'https://x.com/c.png'])
    expect(res.rows[5].zipImages).toEqual(['foto1.jpg', 'a.png', 'b.png'])
  })

  it('exportar y volver a importar da las mismas preguntas (ida y vuelta)', () => {
    const first = parseQuestionMatrix(thirty(), ZIP).rows.map((r) => r.question!)
    // en la exportación las imágenes ya son URLs
    const withUrls = first.map((q) => ({
      ...q,
      image_url: q.image_url?.replace(ZIP_PREFIX, 'https://cdn/') ?? null,
      options: q.options.map((o) => ({ ...o, image_url: o.image_url?.replace(ZIP_PREFIX, 'https://cdn/') ?? null })),
    }))
    const back = parseQuestionMatrix([[...QUESTION_HEADERS], ...questionsToMatrix(withUrls)]).rows.map((r) => r.question!)
    const strip = (qs: typeof first) => qs.map((q) => toDb(q, 'quiz'))
    expect(strip(back)).toEqual(strip(withUrls))
  })

  it('mensajes de error claros por fila', () => {
    const m = [
      [...QUESTION_HEADERS],
      ['single', 'Sin correcta', null, 'a', 'b', null, null, null, null, null],
      ['single', 'Fuera de rango', null, 'a', 'b', 'c', 'd', null, null, 5],
      ['multiple', 'Mala', null, 'a', 'b', null, null, null, null, 'x'],
      ['true_false', 'VF', null, null, null, null, null, null, null, 'quizás'],
      ['short_text', 'Corta', null, null, null, null, null, null, null, null],
      ['ordering', 'Orden', null, 'a', 'b', 'c', null, null, null, '1,1,2'],
      ['image_choice', 'Img', null, 'x.png', 'y.png', null, null, null, null, 1],
      ['pregunta rara', 'Tipo inválido'],
      ['single', '', null, 'a', 'b', null, null, null, null, 1, 3],
    ]
    const msgs = questionErrorMessages(parseQuestionMatrix(m).rows)
    expect(msgs).toContain("Fila 2: falta la columna 'correcta' (número de la opción correcta).")
    expect(msgs).toContain("Fila 3: la columna 'correcta' indica la opción 5 pero solo hay 4 opciones.")
    expect(msgs).toContain('Fila 4: la columna \'correcta\' tiene "x", que no es un número de opción.')
    expect(msgs).toContain('Fila 5: la columna \'correcta\' debe ser V o F (dice "quizás").')
    expect(msgs.some((x) => x.startsWith('Fila 6: falta la columna'))).toBe(true)
    expect(msgs.some((x) => x.startsWith("Fila 7: la columna 'correcta' debe listar las 3 opciones"))).toBe(true)
    expect(msgs.some((x) => x.startsWith('Fila 8: la columna opcion_1 dice "x.png": sube el ZIP'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('Fila 9: el tipo "pregunta rara" no existe'))).toBe(true)
    expect(msgs).toContain('Fila 10: falta el enunciado de la pregunta.')
    expect(msgs).toContain('Fila 10: el tiempo "3" debe ser un número entre 5 y 600 segundos.')
  })

  it('la plantilla descargable se importa sin errores (con su ZIP)', async () => {
    const res = parseQuestionMatrix(await readTable(await buildQuestionTemplate()), new Set(['escudo_uap.png', 'escudo_otro.png']))
    expect(questionErrorMessages(res.rows)).toEqual([])
    expect(res.stats.valid).toBe(6)
  })

  it('cambiar de tipo conserva lo posible y deja preguntas válidas', () => {
    const q = newQuestion('single')
    q.prompt = 'P'
    q.options = q.options.map((o, i) => ({ ...o, text: `op${i}` }))
    expect(validateQuestion(q)).toEqual([])
    const m = convertType(q, 'multiple')
    expect(m.options.map((o) => o.text)).toEqual(['op0', 'op1', 'op2', 'op3'])
    expect(validateQuestion(convertType(q, 'true_false'))).toEqual([])
    const st = convertType(q, 'short_text')
    expect(st.accepted_answers).toEqual(['op0'])
    expect(validateQuestion(convertType(q, 'ordering'))).toEqual([])
  })

  it('respuesta corta ignora mayúsculas, tildes y espacios', () => {
    expect(matchesShortAnswer('  COBÍJA ', ['Cobija'])).toBe(true)
    expect(matchesShortAnswer('cobija   pando', ['Cobija Pando'])).toBe(true)
    expect(matchesShortAnswer('Riberalta', ['Cobija'])).toBe(false)
  })
})
