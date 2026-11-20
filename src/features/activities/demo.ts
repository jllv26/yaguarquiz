// Datos de ejemplo para la vitrina de diseño (juego local, sin servidor)
import { buildCrossword, buildWordsearch } from './generators'
import { localActivity } from './localEngine'
import type { ActivityItem, ActivitySettings, ActivityType } from './types'

const AMAZONIA: ActivityItem[] = [
  { term: 'Cobija', prompt: 'Capital del departamento de Pando' },
  { term: 'Castaña', prompt: 'Fruto amazónico que Bolivia más exporta' },
  { term: 'Jaguar', prompt: 'Felino más grande de América y mascota de YaguarQuiz' },
  { term: 'Acre', prompt: 'Río que separa Cobija de Brasil' },
  { term: 'Siringa', prompt: 'Árbol del que se extrae el caucho' },
  { term: 'Riberalta', prompt: 'Ciudad del Beni conocida como capital de la castaña' },
]

const DEMO: Record<ActivityType, { items: ActivityItem[]; extra?: Partial<ActivitySettings> }> = {
  crossword: { items: AMAZONIA },
  wordsearch: { items: AMAZONIA, extra: { show_words: true, difficulty: 'media' } },
  matching: { items: AMAZONIA.slice(0, 5) },
  memory: {
    items: [
      { term: 'Excel', prompt: 'Hoja de cálculo' },
      { term: 'Word', prompt: 'Procesador de texto' },
      { term: 'PowerPoint', prompt: 'Presentaciones' },
      { term: 'Gmail', prompt: 'Correo electrónico' },
      { term: 'Drive', prompt: 'Almacenamiento en la nube' },
      { term: 'Canva', prompt: 'Diseño gráfico' },
    ],
  },
  fill_text: {
    items: [{ term: 'Cobija' }, { term: 'castaña' }, { term: 'Acre' }].map((x) => ({ ...x, prompt: '' })),
    extra: { text: 'La capital de Pando es {{0}}. Su producto más exportado es la {{1}}, y el río {{2}} marca la frontera con Brasil.', word_bank: true, distractors: ['Trinidad'] },
  },
  rosco: { items: AMAZONIA.map((x) => ({ ...x, group: x.term[0] })) },
  anagram: { items: AMAZONIA.slice(0, 4) },
  sentence: {
    items: [
      { term: 'El jaguar es el felino más grande de América', prompt: 'Ordene la frase' },
      { term: 'La castaña se recolecta en la selva de Pando', prompt: 'Ordene la frase' },
    ],
  },
  hangman: { items: AMAZONIA.slice(0, 3) },
  classify: {
    items: [
      { term: 'Excel', prompt: 'Software', group: 'Software' },
      { term: 'Teclado', prompt: 'Hardware', group: 'Hardware' },
      { term: 'Word', prompt: 'Software', group: 'Software' },
      { term: 'Monitor', prompt: 'Hardware', group: 'Hardware' },
      { term: 'Chrome', prompt: 'Software', group: 'Software' },
      { term: 'Mouse', prompt: 'Hardware', group: 'Hardware' },
    ],
  },
  research: {
    items: [
      { term: '¿Qué redes sociales usa el negocio y cada cuánto publica?', prompt: 'Revisa su página y anota fechas reales.' },
      { term: '¿Qué le recomendarías mejorar primero y por qué?', prompt: '' },
    ],
    extra: { min_words: 30, criteria: [{ title: 'Datos reales' }, { title: 'Análisis' }, { title: 'Propuesta' }], variants: [{ case: { title: 'Heladería del centro de Cobija' } }] },
  },
}

export function demoActivity(type: ActivityType) {
  const d = DEMO[type]
  let s: ActivitySettings = { type, ...d.extra }
  if (type === 'crossword') s = { ...s, layout: buildCrossword(d.items.map((i) => i.term), 7).layout }
  if (type === 'wordsearch') s = { ...s, grid: buildWordsearch(d.items.map((i) => i.term), 'media', 11) }
  return localActivity(s, d.items)
}
