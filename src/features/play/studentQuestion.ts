import type { StudentQuestion } from './QuestionView'

/** Convierte una pregunta del editor a lo que ve el estudiante (mezcla el orden en "ordenar"). */
export function toStudentQuestion(q: {
  type: StudentQuestion['type']
  prompt: string
  image_url: string | null
  time_limit_sec: number
  base_points: number
  options: { key: string; text: string; image_url: string | null }[]
}): StudentQuestion {
  let options = q.options.map(({ key, text, image_url }) => ({ key, text, image_url }))
  if (q.type === 'ordering') {
    // mezcla garantizando que no quede igual al orden correcto
    for (let t = 0; t < 10; t++) {
      const sh = [...options].sort(() => Math.random() - 0.5)
      if (sh.some((o, i) => o.key !== options[i].key) || options.length < 2) {
        options = sh
        break
      }
    }
  }
  return { type: q.type, prompt: q.prompt, image_url: q.image_url, time_limit_sec: q.time_limit_sec, base_points: q.base_points, options }
}
