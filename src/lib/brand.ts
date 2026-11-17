/** Rutas a recursos públicos respetando el "base" de Vite (GitHub Pages). */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const BRAND = {
  appName: 'AmazoQuiz',
  institution: 'Universidad Amazónica de Pando',
  short: 'UAP',
  city: 'Cobija · Pando · Bolivia',
  teacher: 'Ing. Jimmy Luis Laruta Villarreal',
  logoColor: asset('brand/logo-uap-color.webp'),
  logoWhite: asset('brand/logo-uap-blanco.png'),
  logoBlack: asset('brand/logo-uap-negro.png'),
} as const

/** Las 4 respuestas: color + forma (accesible para daltonismo) + tecla. */
export const ANSWER_STYLES = [
  { key: '1', shape: 'triangle', label: 'Triángulo', bg: 'bg-game-coral', edge: '#b3122f', text: 'text-white' },
  { key: '2', shape: 'diamond', label: 'Rombo', bg: 'bg-game-electric', edge: '#1452b8', text: 'text-white' },
  { key: '3', shape: 'circle', label: 'Círculo', bg: 'bg-game-mango', edge: '#b98300', text: 'text-[#2a1a00]' },
  { key: '4', shape: 'square', label: 'Cuadrado', bg: 'bg-game-selva', edge: '#0f8a50', text: 'text-white' },
] as const

export type AnswerShape = (typeof ANSWER_STYLES)[number]['shape']
