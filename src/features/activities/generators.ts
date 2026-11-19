import { gameLetters, type CrosswordLayout } from './types'

type Dir = 'across' | 'down'
interface Placed {
  i: number
  word: string
  row: number
  col: number
  dir: Dir
}

/** Generador pseudoaleatorio con semilla (para que "Generar de nuevo" dé tableros distintos y reproducibles). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}
function shuffle<T>(a: T[], r: () => number): T[] {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

// ================================================================== crucigrama
/**
 * Arma un crucigrama con todas las palabras posibles cruzadas entre sí.
 * Prueba varios órdenes y se queda con el que coloca más palabras, con más cruces y en menos espacio.
 */
export function buildCrossword(terms: string[], seed = Date.now()): { layout: CrosswordLayout; unplaced: number[] } {
  const words = terms.map((t, i) => ({ i, word: gameLetters(t) })).filter((w) => w.word.length >= 2)
  const r = rng(seed)
  let best: { placed: Placed[]; score: number } | null = null

  for (let attempt = 0; attempt < 60; attempt++) {
    const order = attempt === 0 ? [...words].sort((a, b) => b.word.length - a.word.length) : shuffle(words, r).sort((a, b) => (r() < 0.6 ? b.word.length - a.word.length : 0))
    const placed: Placed[] = []
    const grid = new Map<string, string>()
    const key = (y: number, x: number) => `${y},${x}`
    const put = (p: Placed) => {
      placed.push(p)
      for (let k = 0; k < p.word.length; k++) grid.set(key(p.row + (p.dir === 'down' ? k : 0), p.col + (p.dir === 'across' ? k : 0)), p.word[k])
    }
    const fits = (w: string, row: number, col: number, dir: Dir): number => {
      // devuelve la cantidad de cruces, o -1 si no cabe
      const dy = dir === 'down' ? 1 : 0
      const dx = dir === 'across' ? 1 : 0
      const before = grid.get(key(row - dy, col - dx))
      const after = grid.get(key(row + dy * w.length, col + dx * w.length))
      if (before || after) return -1
      let cross = 0
      for (let k = 0; k < w.length; k++) {
        const y = row + dy * k
        const x = col + dx * k
        const c = grid.get(key(y, x))
        if (c) {
          if (c !== w[k]) return -1
          // la celda ya es parte de una palabra en la MISMA dirección → no
          if (placed.some((p) => p.dir === dir && cellOf(p, y, x))) return -1
          cross++
        } else {
          // vecinos laterales vacíos (para no formar palabras falsas)
          if (grid.get(key(y + dx, x + dy)) || grid.get(key(y - dx, x - dy))) return -1
        }
      }
      return cross
    }
    const cellOf = (p: Placed, y: number, x: number) =>
      p.dir === 'across' ? y === p.row && x >= p.col && x < p.col + p.word.length : x === p.col && y >= p.row && y < p.row + p.word.length

    const pending = [...order]
    if (!pending.length) break
    const first = pending.shift()!
    put({ ...first, row: 0, col: 0, dir: 'across' })
    let progress = true
    while (pending.length && progress) {
      progress = false
      for (let n = 0; n < pending.length; n++) {
        const w = pending[n]
        let cand: { row: number; col: number; dir: Dir; score: number } | null = null
        for (const p of placed) {
          for (let a = 0; a < p.word.length; a++) {
            for (let b = 0; b < w.word.length; b++) {
              if (p.word[a] !== w.word[b]) continue
              const dir: Dir = p.dir === 'across' ? 'down' : 'across'
              const y = p.dir === 'across' ? p.row - b : p.row + a
              const x = p.dir === 'across' ? p.col + a : p.col - b
              const c = fits(w.word, y, x, dir)
              if (c <= 0) continue
              const box = bounds([...placed, { ...w, row: y, col: x, dir }])
              const score = c * 10 - (box.h * box.w) / 20 - Math.abs(box.h - box.w) + r()
              if (!cand || score > cand.score) cand = { row: y, col: x, dir, score }
            }
          }
        }
        if (cand) {
          put({ ...w, row: cand.row, col: cand.col, dir: cand.dir })
          pending.splice(n, 1)
          n--
          progress = true
        }
      }
    }
    const box = bounds(placed)
    const crosses = placed.length * 2
    const score = placed.length * 1000 + crosses - box.h * box.w * 0.5 - Math.abs(box.h - box.w) * 2
    if (!best || score > best.score) best = { placed, score }
    if (best.placed.length === words.length && attempt > 20) break
  }

  const placed = best?.placed ?? []
  const box = bounds(placed)
  const norm = placed.map((p) => ({ ...p, row: p.row - box.y, col: p.col - box.x }))
  // numeración de crucigrama: por fila y columna de inicio
  const starts = [...new Set(norm.map((p) => p.row * 1000 + p.col))].sort((a, b) => a - b)
  const words2 = norm
    .map((p) => ({ i: p.i, n: starts.indexOf(p.row * 1000 + p.col) + 1, row: p.row, col: p.col, dir: p.dir }))
    .sort((a, b) => a.n - b.n || (a.dir === 'across' ? -1 : 1))
  const placedIdx = new Set(norm.map((p) => p.i))
  return {
    layout: { rows: box.h, cols: box.w, words: words2 },
    unplaced: terms.map((_t, i) => i).filter((i) => !placedIdx.has(i)),
  }
}

function bounds(ps: Placed[]) {
  if (!ps.length) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of ps) {
    x0 = Math.min(x0, p.col)
    y0 = Math.min(y0, p.row)
    x1 = Math.max(x1, p.col + (p.dir === 'across' ? p.word.length - 1 : 0))
    y1 = Math.max(y1, p.row + (p.dir === 'down' ? p.word.length - 1 : 0))
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// ================================================================== sopa de letras
const DIRS = {
  facil: [
    [0, 1],
    [1, 0],
  ],
  media: [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ],
  dificil: [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [1, -1],
  ],
} as const
// letras de relleno con frecuencia parecida al castellano
const FILL = 'AAAAAAAEEEEEEEOOOOOOSSSSSRRRRRNNNNNIIIIIDDDDLLLLCCCCTTTTUUUMMMPPBBGVYQHFZJÑXK'

export function buildWordsearch(
  terms: string[],
  difficulty: 'facil' | 'media' | 'dificil' = 'media',
  seed = Date.now(),
): { letters: string[]; placements: { i: number; cells: [number, number][] }[]; unplaced: number[] } {
  const words = terms.map((t, i) => ({ i, w: gameLetters(t) })).filter((x) => x.w.length >= 2)
  const longest = Math.max(6, ...words.map((x) => x.w.length))
  const letters = words.reduce((n, x) => n + x.w.length, 0)
  const r = rng(seed)
  let size = Math.max(longest, Math.ceil(Math.sqrt(letters * 2.2)), 8)

  for (let grow = 0; grow < 6; grow++, size++) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const g: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(''))
      const placements: { i: number; cells: [number, number][] }[] = []
      let ok = true
      for (const { i, w } of [...words].sort((a, b) => b.w.length - a.w.length)) {
        let done = false
        for (let t = 0; t < 200 && !done; t++) {
          const [dy, dx] = DIRS[difficulty][Math.floor(r() * DIRS[difficulty].length)]
          const y = Math.floor(r() * size)
          const x = Math.floor(r() * size)
          const ye = y + dy * (w.length - 1)
          const xe = x + dx * (w.length - 1)
          if (ye < 0 || ye >= size || xe < 0 || xe >= size) continue
          let fits = true
          for (let k = 0; k < w.length; k++) {
            const c = g[y + dy * k][x + dx * k]
            if (c && c !== w[k]) {
              fits = false
              break
            }
          }
          if (!fits) continue
          const cells: [number, number][] = []
          for (let k = 0; k < w.length; k++) {
            g[y + dy * k][x + dx * k] = w[k]
            cells.push([y + dy * k, x + dx * k])
          }
          placements.push({ i, cells })
          done = true
        }
        if (!done) {
          ok = false
          break
        }
      }
      if (!ok) continue
      for (const row of g) for (let x = 0; x < row.length; x++) if (!row[x]) row[x] = FILL[Math.floor(r() * FILL.length)]
      return { letters: g.map((row) => row.join('')), placements: placements.sort((a, b) => a.i - b.i), unplaced: [] }
    }
  }
  return { letters: [], placements: [], unplaced: words.map((w) => w.i) }
}
