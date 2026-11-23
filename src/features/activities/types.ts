import {
  ArrowDownUp,
  Clapperboard,
  Leaf,
  Lightbulb,
  ListOrdered,
  MapPin,
  MessagesSquare,
  Presentation,
  Puzzle,
  Rocket,
  ThumbsUp,
  FileSearch,
  Headphones,
  Blocks,
  Brain,
  Grid3x3,
  LayoutList,
  Link2,
  PawPrint,
  Search,
  TextCursorInput,
  Shuffle,
  type LucideIcon,
} from 'lucide-react'

export type ActivityType =
  | 'crossword'
  | 'wordsearch'
  | 'matching'
  | 'memory'
  | 'fill_text'
  | 'rosco'
  | 'anagram'
  | 'sentence'
  | 'hangman'
  | 'classify'
  | 'research'
  | 'dictation'
  | 'froggy'
  | 'yesno'
  | 'rows'
  | 'riddle'
  | 'map'
  | 'video'
  | 'asterquiz'
  | 'puzzle'
  | 'slides'
  | 'dialogue'

export interface ActivityMeta {
  label: string
  short: string
  description: string
  icon: LucideIcon
  color: string
  /** Etiquetas de las columnas del editor */
  termLabel: string
  promptLabel: string
  promptRequired: boolean
  min: number
  max: number
  /** Usa intentos por palabra (las demás tienen su propia mecánica) */
  usesTries: boolean
  /** Tablero fijo: todos los estudiantes ven el mismo (no se eligen palabras al azar) */
  fixedBoard: boolean
  tip: string
}

export const ACTIVITY_META: Record<ActivityType, ActivityMeta> = {
  crossword: {
    label: 'Crucigrama',
    short: 'Crucigrama',
    description: 'Palabras que se cruzan a partir de sus definiciones.',
    icon: Grid3x3,
    color: '#1F3864',
    termLabel: 'Palabra',
    promptLabel: 'Definición (pista)',
    promptRequired: true,
    min: 3,
    max: 25,
    usesTries: true,
    fixedBoard: true,
    tip: 'El tablero se arma solo. Las palabras con letras en común se cruzan mejor.',
  },
  wordsearch: {
    label: 'Sopa de letras',
    short: 'Sopa',
    description: 'Encontrar palabras escondidas en una cuadrícula.',
    icon: Search,
    color: '#1B7339',
    termLabel: 'Palabra',
    promptLabel: 'Definición (opcional)',
    promptRequired: false,
    min: 3,
    max: 15,
    usesTries: false,
    fixedBoard: true,
    tip: 'Si muestra definiciones en lugar de las palabras, el estudiante debe deducir qué buscar.',
  },
  matching: {
    label: 'Relacionar columnas',
    short: 'Relacionar',
    description: 'Unir cada concepto con su definición o imagen.',
    icon: Link2,
    color: '#1d5fd6',
    termLabel: 'Concepto (columna A)',
    promptLabel: 'Definición (columna B)',
    promptRequired: true,
    min: 3,
    max: 15,
    usesTries: true,
    fixedBoard: false,
    tip: 'La columna B puede ser texto o una imagen.',
  },
  memory: {
    label: 'Memoria (parejas)',
    short: 'Memoria',
    description: 'Voltear cartas y encontrar las parejas.',
    icon: Brain,
    color: '#7C3AED',
    termLabel: 'Carta 1',
    promptLabel: 'Carta 2 (su pareja)',
    promptRequired: true,
    min: 3,
    max: 12,
    usesTries: false,
    fixedBoard: false,
    tip: 'Cada pareja que encuentra suma; si se equivoca mucho con la misma carta, vale menos.',
  },
  fill_text: {
    label: 'Completar el texto',
    short: 'Completar',
    description: 'Un texto con espacios en blanco para completar.',
    icon: TextCursorInput,
    color: '#0f766e',
    termLabel: 'Palabra que falta',
    promptLabel: '',
    promptRequired: false,
    min: 1,
    max: 30,
    usesTries: true,
    fixedBoard: true,
    tip: 'Escriba el texto y ponga entre corchetes las palabras que el estudiante debe completar: La capital de Pando es [Cobija].',
  },
  rosco: {
    label: 'Rosco (pasapalabra)',
    short: 'Rosco',
    description: 'Una palabra por letra del abecedario, con “Pasapalabra”.',
    icon: PawPrint,
    color: '#b45309',
    termLabel: 'Respuesta',
    promptLabel: 'Definición',
    promptRequired: true,
    min: 3,
    max: 27,
    usesTries: true,
    fixedBoard: false,
    tip: 'La letra se toma de la primera letra de la respuesta; puede cambiarla y marcar “contiene”.',
  },
  anagram: {
    label: 'Ordenar letras',
    short: 'Letras',
    description: 'Formar la palabra con sus letras desordenadas.',
    icon: Shuffle,
    color: '#c81e3c',
    termLabel: 'Palabra',
    promptLabel: 'Pista',
    promptRequired: true,
    min: 1,
    max: 30,
    usesTries: true,
    fixedBoard: false,
    tip: 'Funciona muy bien para términos técnicos y nombres propios.',
  },
  sentence: {
    label: 'Ordenar la frase',
    short: 'Frases',
    description: 'Poner en orden las palabras de una oración.',
    icon: ArrowDownUp,
    color: '#8B1A1A',
    termLabel: 'Frase correcta',
    promptLabel: 'Pista (opcional)',
    promptRequired: false,
    min: 1,
    max: 20,
    usesTries: true,
    fixedBoard: false,
    tip: 'Ideal para definiciones, pasos de un procedimiento o citas importantes.',
  },
  hangman: {
    label: 'Adivina la palabra',
    short: 'Adivina',
    description: 'Descubrir la palabra letra por letra (6 vidas).',
    icon: Blocks,
    color: '#8a6416',
    termLabel: 'Palabra',
    promptLabel: 'Pista',
    promptRequired: true,
    min: 1,
    max: 20,
    usesTries: false,
    fixedBoard: false,
    tip: 'Cada letra equivocada quita una huella; con 6 errores pierde la palabra.',
  },
  classify: {
    label: 'Clasificar en grupos',
    short: 'Clasificar',
    description: 'Llevar cada elemento a la categoría que le corresponde.',
    icon: LayoutList,
    color: '#4D4D4D',
    termLabel: 'Elemento',
    promptLabel: 'Grupo',
    promptRequired: true,
    min: 4,
    max: 30,
    usesTries: true,
    fixedBoard: false,
    tip: 'Use entre 2 y 5 grupos. Escriba el nombre del grupo igual en cada fila.',
  },
  dictation: {
    label: 'Dictado',
    short: 'Dictado',
    description: 'Escuchar una palabra, frase o definición y escribirla bien.',
    icon: Headphones,
    color: '#0e7490',
    termLabel: 'Lo que debe escribir',
    promptLabel: 'Pista (o la definición que se dicta)',
    promptRequired: false,
    min: 1,
    max: 30,
    usesTries: true,
    fixedBoard: false,
    tip: 'Se escucha con la voz del celular o la PC. Elija si se dicta la palabra (cuentan las tildes) o la definición (el estudiante escribe el término).',
  },
  froggy: {
    label: 'Froggy Jumps',
    short: 'Froggy',
    description: 'La rana cruza el estanque saltando a la hoja con la respuesta correcta.',
    icon: Leaf,
    color: '#2f9e44',
    termLabel: 'Respuesta correcta',
    promptLabel: 'Pregunta',
    promptRequired: true,
    min: 3,
    max: 30,
    usesTries: true,
    fixedBoard: false,
    tip: 'Escriba 2 o 3 respuestas incorrectas creíbles: la rana elige entre todas.',
  },
  yesno: {
    label: 'Sí o No',
    short: 'Sí o No',
    description: 'Tarjetas rápidas: decidir si cada una cumple o no (desliza o toca).',
    icon: ThumbsUp,
    color: '#e8590c',
    termLabel: 'Tarjeta (afirmación o ejemplo)',
    promptLabel: '',
    promptRequired: false,
    min: 4,
    max: 40,
    usesTries: true,
    fixedBoard: false,
    tip: 'Escriba una pregunta general (por ejemplo «¿Es un objetivo SMART?») y marque Sí o No en cada tarjeta.',
  },
  rows: {
    label: 'Filas (ordenar)',
    short: 'Filas',
    description: 'Poner en el orden correcto los pasos, etapas o elementos de cada fila.',
    icon: ListOrdered,
    color: '#5c7cfa',
    termLabel: 'Elementos en el orden correcto (uno por línea)',
    promptLabel: 'Título de la fila',
    promptRequired: true,
    min: 1,
    max: 15,
    usesTries: true,
    fixedBoard: false,
    tip: 'Ideal para procesos: etapas del embudo, método AIDA, pasos de una campaña.',
  },
  riddle: {
    label: 'Adivinanza',
    short: 'Adivinanza',
    description: 'Adivinar el término con pistas que se piden de a una: menos pistas, más puntos.',
    icon: Lightbulb,
    color: '#f08c00',
    termLabel: 'Respuesta',
    promptLabel: '',
    promptRequired: false,
    min: 1,
    max: 20,
    usesTries: true,
    fixedBoard: false,
    tip: 'Ordene las pistas de la más difícil a la más fácil. Cada pista extra resta 20 %.',
  },
  map: {
    label: 'Mapa interactivo',
    short: 'Mapa',
    description: 'Ubicar o nombrar puntos sobre una imagen: un anuncio, una web, un mapa.',
    icon: MapPin,
    color: '#0b7285',
    termLabel: 'Nombre del punto',
    promptLabel: 'Descripción (opcional)',
    promptRequired: false,
    min: 2,
    max: 20,
    usesTries: true,
    fixedBoard: false,
    tip: 'Suba una imagen, elija una fila y toque la imagen para ubicar su punto.',
  },
  video: {
    label: 'Video Quiz',
    short: 'Video',
    description: 'El video de YouTube se detiene y hace preguntas en los minutos que usted elige.',
    icon: Clapperboard,
    color: '#c92a2a',
    termLabel: 'Respuesta correcta',
    promptLabel: 'Pregunta',
    promptRequired: true,
    min: 1,
    max: 20,
    usesTries: true,
    fixedBoard: false,
    tip: 'Pegue el enlace de YouTube y escriba en qué minuto aparece cada pregunta.',
  },
  asterquiz: {
    label: 'AsterQuiz',
    short: 'AsterQuiz',
    description: 'Una nave dispara al asteroide con la respuesta correcta antes de que se acabe el tiempo.',
    icon: Rocket,
    color: '#3b5bdb',
    termLabel: 'Respuesta correcta',
    promptLabel: 'Pregunta',
    promptRequired: true,
    min: 3,
    max: 30,
    usesTries: true,
    fixedBoard: false,
    tip: 'Respuestas cortas funcionan mejor en los asteroides.',
  },
  puzzle: {
    label: 'Puzzle',
    short: 'Puzzle',
    description: 'Cada respuesta correcta revela una pieza de la imagen escondida.',
    icon: Puzzle,
    color: '#ae3ec9',
    termLabel: 'Respuesta correcta',
    promptLabel: 'Pregunta',
    promptRequired: true,
    min: 4,
    max: 16,
    usesTries: true,
    fixedBoard: false,
    tip: 'Suba una imagen: se divide en tantas piezas como preguntas.',
  },
  slides: {
    label: 'Presentación',
    short: 'Presentación',
    description: 'Diapositivas para leer antes de practicar; cuenta como hecha al verlas todas.',
    icon: Presentation,
    color: '#495057',
    termLabel: 'Título de la diapositiva',
    promptLabel: 'Contenido (líneas con «- » se ven como viñetas)',
    promptRequired: true,
    min: 1,
    max: 30,
    usesTries: false,
    fixedBoard: true,
    tip: 'Úsela como lectura previa. La nota es 100 al ver todas las diapositivas.',
  },
  dialogue: {
    label: 'Diálogo',
    short: 'Diálogo',
    description: 'Una conversación que se escucha (y se lee) y luego preguntas de comprensión.',
    icon: MessagesSquare,
    color: '#1971c2',
    termLabel: 'Respuesta correcta',
    promptLabel: 'Pregunta sobre el diálogo',
    promptRequired: true,
    min: 1,
    max: 15,
    usesTries: true,
    fixedBoard: false,
    tip: 'Escriba el diálogo en Opciones (Nombre: lo que dice) y aquí las preguntas.',
  },
  research: {
    label: 'Investigación',
    short: 'Investigación',
    description: 'Cada estudiante recibe un caso distinto, investiga y responde con sus palabras. La califica el docente.',
    icon: FileSearch,
    color: '#8B1A1A',
    termLabel: 'Pregunta',
    promptLabel: 'Ayuda',
    promptRequired: false,
    min: 1,
    max: 10,
    usesTries: false,
    fixedBoard: true,
    tip: 'Cada estudiante recibe uno de los casos al azar.',
  },
}

/** Tipos que se crean desde la galería (la investigación se prepara con sus casos y criterios) */
export const ACTIVITY_TYPES = (Object.keys(ACTIVITY_META) as ActivityType[]).filter((t) => t !== 'research')

export interface ResearchCase {
  title: string
  context?: string
  tasks?: string[]
}
export interface ResearchCriterion {
  title: string
  desc?: string
}

export interface ActivitySettings {
  type: ActivityType
  instructions?: string
  tries?: number
  show_words?: boolean
  difficulty?: 'facil' | 'media' | 'dificil'
  word_bank?: boolean
  distractors?: string[]
  text?: string
  layout?: CrosswordLayout
  grid?: { letters: string[]; placements?: { i: number; cells: [number, number][] }[] }
  /** Versiones: a cada estudiante le toca una (tablero/texto distinto, o un caso de investigación) */
  variants?: ({ pos?: number[]; case?: ResearchCase } & Partial<Pick<ActivitySettings, 'layout' | 'grid' | 'text'>>)[]
  /** Investigación: criterios que califica el docente y mínimo de palabras por respuesta */
  criteria?: ResearchCriterion[]
  min_words?: number
  /** Dictado: qué se escucha (la palabra/frase o la definición) y si las tildes cuentan */
  listen?: 'term' | 'prompt'
  accents?: boolean
  /** Imagen del mapa interactivo o del puzzle */
  image_url?: string | null
  map_mode?: 'tap' | 'write'
  /** Video Quiz: enlace de YouTube */
  video_url?: string
  /** Diálogo: intervenciones y si el texto se ve o solo se escucha */
  dialogue?: DialogueLine[]
  dialogue_text?: 'show' | 'hide'
  /** Sí o No: la pregunta que se hace para todas las tarjetas */
  question?: string
  /** AsterQuiz: segundos por pregunta */
  seconds?: number
}

export interface DialogueLine {
  who: string
  text: string
}

/** Datos propios de cada tipo: respuestas incorrectas, pistas, punto sobre la imagen, segundo del video */
export interface ItemExtra {
  /** otras respuestas válidas (sinónimos, plural, sigla) en las actividades donde se escribe */
  alt?: string[]
  wrong?: string[]
  clues?: string[]
  x?: number
  y?: number
  t?: number
}

/** Tipos de opción múltiple (misma corrección, distinta «piel») */
export const MC_TYPES: ActivityType[] = ['froggy', 'asterquiz', 'puzzle', 'video', 'dialogue']

export interface CrosswordLayout {
  rows: number
  cols: number
  words: { i: number; n: number; row: number; col: number; dir: 'across' | 'down' }[]
}

/** Palabra tal como se edita (prompt = pista/definición/pareja · group = grupo o letra del rosco). */
export interface ActivityItem {
  id?: string
  term: string
  prompt: string
  image_url?: string | null
  group?: string
  contains?: boolean
  extra?: ItemExtra
}

// ------------------------------------------------------------------ tablero del estudiante
export interface Progress {
  done: boolean
  correct?: boolean
  tries?: number
  partial?: number
  value?: string
  cells?: [number, number][]
  wrong?: number
  pair?: [string, string]
  answer?: string
}

export interface Boards {
  crossword: { rows: number; cols: number; words: { key: string; n: number; row: number; col: number; dir: 'across' | 'down'; len: number; clue: string; image_url: string | null }[] }
  wordsearch: { grid: string[]; show_words: boolean; clues: { key: string; text: string; len: number | null; image_url: string | null }[] }
  matching: { left: { key: string; text: string }[]; right: { key: string; text: string; image_url: string | null }[] }
  memory: { cards: { key: string; text: string; image_url?: string | null }[] }
  fill_text: { text: string; gaps: { key: string; i: number; len: number }[]; bank: string[] | null }
  rosco: { items: { key: string; letter: string; contains: boolean; clue: string; image_url: string | null }[] }
  anagram: { items: { key: string; clue: string; image_url: string | null; words: number[]; tiles: string[] }[] }
  sentence: { items: { key: string; clue: string; image_url: string | null; tiles: string[] }[] }
  hangman: { max_wrong: number; items: { key: string; clue: string; image_url: string | null; mask: string }[] }
  classify: { groups: string[]; cards: { key: string; text: string; image_url: string | null }[] }
  dictation: { listen: 'term' | 'prompt'; accents: boolean; items: { key: string; say: string; hint: string | null; words: number; image_url: string | null }[] }
  froggy: McBoard
  asterquiz: McBoard
  puzzle: McBoard
  video: McBoard
  dialogue: McBoard
  yesno: { question: string; items: { key: string; text: string; image_url: string | null }[] }
  rows: { items: { key: string; title: string; image_url: string | null; tiles: string[] }[] }
  riddle: { items: { key: string; image_url: string | null; words: number[]; total: number; clues: string[] | null }[] }
  map: { image_url: string | null; mode: 'tap' | 'write'; points: { key: string; x: number; y: number }[]; names: { key: string; text: string; desc: string | null }[] | null }
  slides: { items: { key: string; title: string; text: string; image_url: string | null }[] }
  research: { case: ResearchCase | null; criteria: ResearchCriterion[]; min_words: number; questions: { key: string; text: string; hint: string | null; value: string | null }[] }
}

export interface McBoard {
  image_url: string | null
  video_url: string | null
  dialogue: DialogueLine[] | null
  dialogue_text: 'show' | 'hide' | null
  seconds: number | null
  items: { key: string; q: string; image_url: string | null; t: number | null; options: string[] }[]
}

export interface ActivityBoard<T extends ActivityType = ActivityType> {
  type: T
  instructions: string | null
  tries: number
  total: number
  reveal: boolean
  board: Boards[T]
  progress: Record<string, Progress>
  errors: number
}

export type PlayAction = 'answer' | 'find' | 'pair' | 'letter' | 'save' | 'clue' | 'seen'
export interface PlayResult {
  ok: boolean
  error?: string
  item?: string
  correct?: boolean
  done?: boolean
  tries?: number
  tries_left?: number
  points?: number
  answer?: string
  value?: string
  mask?: string
  hit?: boolean
  wrong?: number
  /** Dictado: solo faltan/sobran tildes o mayúsculas */
  near?: boolean
  /** Adivinanza: pista nueva y cuántas pistas lleva */
  clue?: string
  clues?: number
}

/** Quien corrige las jugadas: el servidor (estudiante) o el navegador (vista previa del docente). */
export interface Engine {
  play(action: PlayAction, data: Record<string, unknown>): Promise<PlayResult>
}

// ------------------------------------------------------------------ texto
const ACC: Record<string, string> = { Á: 'A', À: 'A', Ä: 'A', Â: 'A', Ã: 'A', É: 'E', È: 'E', Ë: 'E', Ê: 'E', Í: 'I', Ì: 'I', Ï: 'I', Î: 'I', Ó: 'O', Ò: 'O', Ö: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ù: 'U', Ü: 'U', Û: 'U', Ç: 'C' }

/** Igual que _game_norm en la base de datos: MAYÚSCULAS sin tildes (conserva la Ñ), solo letras/números y espacios. */
export function gameNorm(t: string): string {
  return (t ?? '')
    .normalize('NFC')
    .toUpperCase()
    .replace(/[ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÇ]/g, (c) => ACC[c] ?? c)
    .replace(/[^A-Z0-9Ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
export const gameLetters = (t: string) => gameNorm(t).replace(/ /g, '')

/** Igual que normalize_answer en la base de datos (respuestas escritas: rosco y completar). */
export function looseNorm(t: string): string {
  return (t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Huecos [palabra] de un texto para completar → texto con {{0}}, {{1}}… y las palabras. */
export function parseFillText(src: string): { text: string; words: string[] } {
  const words: string[] = []
  const text = (src ?? '').replace(/\[([^\]]+)\]/g, (_m, w: string) => {
    words.push(w.trim())
    return `{{${words.length - 1}}}`
  })
  return { text, words }
}
export function fillTextSource(text: string, words: string[]): string {
  return (text ?? '').replace(/\{\{(\d+)\}\}/g, (_m, i: string) => `[${words[Number(i)] ?? ''}]`)
}

export const triesFor = (s: Pick<ActivitySettings, 'type' | 'tries'>) =>
  Math.max(1, Math.min(5, s.tries ?? (['rosco', ...ONE_TRY].includes(s.type) ? 1 : s.type === 'crossword' || s.type === 'riddle' ? 3 : 2)))
/** Tipos con un solo intento por defecto (opción múltiple y Sí o No) */
const ONE_TRY: ActivityType[] = ['froggy', 'asterquiz', 'yesno', 'puzzle', 'video', 'dialogue']
export const tryPartial = (n: number) => (n <= 1 ? 1 : n === 2 ? 0.6 : 0.3)

/** Dictado con tildes: minúsculas, sin signos de puntuación ni espacios de más (igual que _dict_norm). */
export function dictNorm(t: string): string {
  return (t ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,;:!?¿¡"“”«»()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El texto del dictado viaja codificado (al revés y en base64) para que no se lea a simple vista. */
export function dictDecode(say: string, listen: 'term' | 'prompt'): string {
  if (listen === 'prompt') return say
  try {
    const bin = atob(say)
    const txt = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    return Array.from(txt).reverse().join('')
  } catch {
    return ''
  }
}
export function dictEncode(t: string): string {
  const rev = Array.from(t).reverse().join('')
  return btoa(String.fromCharCode(...new TextEncoder().encode(rev)))
}

/** Número escrito por el estudiante: acepta «4,0», «Bs 15», «15 %», «1.800» (igual que _num_of). */
export function numOf(t: string): number | null {
  let s = (t ?? '').trim().toLowerCase()
  s = s.replace(/^(bs\.?)\s*/, '').replace(/\s*(bs\.?|%|bolivianos?|veces)$/, '').replace(/ /g, '')
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (/^-?\d{1,3}(,\d{3})+$/.test(s) && !/,\d{1,2}$/.test(s)) s = s.replace(/,/g, '')
  s = s.replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null
}
/** Respuesta escrita: igual a la correcta, a una alternativa válida o al mismo número (igual que _typed_match). */
export function typedMatch(val: string, term: string, alt?: string[]): boolean {
  if (looseNorm(val) === looseNorm(term)) return true
  if ((alt ?? []).some((x) => x.trim() && looseNorm(val) === looseNorm(x))) return true
  const n = numOf(term)
  return n !== null && numOf(val) === n
}
