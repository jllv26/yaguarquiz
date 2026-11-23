// Datos de ejemplo para la vitrina de diseño (juego local, sin servidor)
import { buildCrossword, buildWordsearch } from './generators'
import { localActivity } from './localEngine'
import { AD_POINTS, AD_SVG, FUNNEL_SVG } from './sampleImages'
import type { ActivityItem, ActivitySettings, ActivityType } from './types'

const AMAZONIA: ActivityItem[] = [
  { term: 'Cobija', prompt: 'Capital del departamento de Pando' },
  { term: 'Castaña', prompt: 'Fruto amazónico que Bolivia más exporta' },
  { term: 'Jaguar', prompt: 'Felino más grande de América y mascota de YaguarQuiz' },
  { term: 'Acre', prompt: 'Río que separa Cobija de Brasil' },
  { term: 'Siringa', prompt: 'Árbol del que se extrae el caucho' },
  { term: 'Riberalta', prompt: 'Ciudad del Beni conocida como capital de la castaña' },
]

const MC: ActivityItem[] = [
  { term: 'CTR', prompt: '¿Qué indicador divide los clics entre las impresiones?', extra: { wrong: ['CPA', 'ROAS'], t: 8 } },
  { term: 'Alcance', prompt: '¿Cómo se llaman las personas distintas que vieron una publicación?', extra: { wrong: ['Impresiones', 'Leads'], t: 20 } },
  { term: 'Lead', prompt: 'Persona interesada que deja sus datos para que la contacten', extra: { wrong: ['Influencer', 'Algoritmo'], t: 35 } },
  { term: 'Remarketing', prompt: 'Volver a mostrar anuncios a quien ya visitó tu web', extra: { wrong: ['SEO', 'Branding'], t: 50 } },
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
  dictation: {
    items: [
      { term: 'Castaña', prompt: 'Fruto amazónico' },
      { term: 'Jaguar', prompt: 'Felino de la selva' },
      { term: 'El río Acre separa Cobija de Brasil.', prompt: 'Una frase' },
    ],
    extra: { listen: 'term', accents: true },
  },
  froggy: { items: MC },
  asterquiz: { items: MC, extra: { seconds: 30 } },
  puzzle: { items: MC, extra: { image_url: FUNNEL_SVG } },
  video: { items: MC, extra: { video_url: '' } },
  dialogue: {
    items: [
      { term: 'Los martes', prompt: '¿Qué día hacen envíos a Porvenir?', extra: { wrong: ['Todos los días', 'Los sábados'] } },
      { term: 'Desde Bs 100', prompt: '¿Desde qué monto el envío es gratis?', extra: { wrong: ['Desde Bs 50', 'Siempre es gratis'] } },
    ],
    extra: {
      dialogue: [
        { who: 'Cliente', text: 'Hola, ¿hacen envíos a Porvenir?' },
        { who: 'Tienda', text: 'Sí, los martes. Si tu compra pasa de cien bolivianos, el envío es gratis.' },
        { who: 'Cliente', text: 'Perfecto, quiero dos docenas.' },
      ],
    },
  },
  yesno: {
    items: [
      { term: 'Lograr 200 seguidores nuevos en marzo', prompt: '', group: 'Sí' },
      { term: 'Ser la marca más querida', prompt: '', group: 'No' },
      { term: 'Vender 50 docenas por WhatsApp hasta el 30 de abril', prompt: '', group: 'Sí' },
      { term: 'Publicar más', prompt: '', group: 'No' },
    ],
    extra: { question: '¿Es un objetivo SMART?' },
  },
  rows: { items: [{ term: 'Atención | Interés | Deseo | Acción', prompt: 'Ordena el método AIDA' }, { term: 'Atraer | Interesar | Convertir | Fidelizar', prompt: 'Ordena el embudo de ventas' }] },
  riddle: {
    items: [
      { term: 'SEO', prompt: '', extra: { clues: ['Tiene tres letras', 'Trabaja con palabras clave', 'Sirve para aparecer en Google sin pagar'] } },
      { term: 'Hashtag', prompt: '', extra: { clues: ['Viene del inglés', 'Agrupa publicaciones de un tema', 'Empieza con el signo #'] } },
    ],
  },
  map: { items: AD_POINTS.map((p) => ({ term: p.term, prompt: p.prompt, extra: { x: p.x, y: p.y } })), extra: { image_url: AD_SVG, map_mode: 'tap' } },
  slides: {
    items: [
      { term: '¿Qué es el embudo de ventas?', prompt: 'Es el camino que recorre una persona desde que conoce tu marca hasta que compra.\n- Muchos te conocen\n- Algunos se interesan\n- Pocos compran' },
      { term: 'Cómo se mide', prompt: '- Alcance: cuántos te vieron\n- CTR: cuántos hicieron clic\n- Conversión: cuántos compraron' },
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
