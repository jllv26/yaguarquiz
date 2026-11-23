// Vista previa del docente: arma el mismo tablero que entrega el servidor y corrige en el navegador
// con las mismas reglas (intentos, porcentajes, ahorcado, memoria). Solo se usa en el editor y en la vitrina.
import {
  dictEncode,
  dictNorm,
  gameLetters,
  gameNorm,
  looseNorm,
  triesFor,
  tryPartial,
  type ActivityBoard,
  type ActivityItem,
  type ActivitySettings,
  type Boards,
  type Engine,
  type PlayAction,
  type PlayResult,
  type Progress,
} from './types'

const rand = () => Math.random().toString(36).slice(2, 10)
const shuffle = <T,>(a: T[]) => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}
const mask = (term: string, letters: string[]) =>
  [...gameNorm(term)].map((c) => (c === ' ' ? ' ' : letters.includes(c) || !/[A-ZÑ]/.test(c) ? c : '_')).join('')

export function localActivity(settings: ActivitySettings, items: ActivityItem[]): { board: ActivityBoard; engine: Engine } {
  const type = settings.type
  const keyed = items.map((it, i) => ({ ...it, key: it.id ?? `item-${i}-${rand()}`, pos: i, dKey: rand(), tKey: rand() }))
  const byKey = new Map(keyed.map((k) => [k.key, k]))
  const tries = triesFor(settings)
  let board: Boards[keyof Boards]

  switch (type) {
    case 'crossword':
      board = {
        rows: settings.layout?.rows ?? 0,
        cols: settings.layout?.cols ?? 0,
        words: (settings.layout?.words ?? [])
          .filter((w) => keyed[w.i])
          .map((w) => ({ key: keyed[w.i].key, n: w.n, row: w.row, col: w.col, dir: w.dir, len: gameLetters(keyed[w.i].term).length, clue: keyed[w.i].prompt, image_url: keyed[w.i].image_url ?? null })),
      }
      break
    case 'wordsearch': {
      const show = settings.show_words ?? true
      board = { grid: settings.grid?.letters ?? [], show_words: show, clues: keyed.map((k) => ({ key: k.key, text: show ? gameNorm(k.term) : k.prompt, len: show ? null : gameLetters(k.term).length, image_url: k.image_url ?? null })) }
      break
    }
    case 'matching':
      board = { left: shuffle(keyed.map((k) => ({ key: k.key, text: k.term }))), right: shuffle(keyed.map((k) => ({ key: k.dKey, text: k.prompt, image_url: k.image_url ?? null }))) }
      break
    case 'memory':
      board = { cards: shuffle(keyed.flatMap((k) => [{ key: k.tKey, text: k.term }, { key: k.dKey, text: k.prompt, image_url: k.image_url ?? null }])) }
      break
    case 'fill_text':
      board = {
        text: settings.text ?? '',
        gaps: keyed.map((k) => ({ key: k.key, i: k.pos, len: k.term.length })),
        bank: settings.word_bank ?? true ? shuffle([...keyed.map((k) => k.term), ...(settings.distractors ?? []).filter((d) => d.trim())]) : null,
      }
      break
    case 'rosco':
      board = { items: keyed.map((k) => ({ key: k.key, letter: (k.group?.trim()?.[0] ?? gameNorm(k.term)[0] ?? '?').toUpperCase(), contains: !!k.contains, clue: k.prompt, image_url: k.image_url ?? null })) }
      break
    case 'anagram':
      board = {
        items: shuffle(keyed).map((k) => {
          const w = gameLetters(k.term)
          let tiles = shuffle([...w])
          if (tiles.join('') === w && w.length > 1) tiles = tiles.reverse()
          return { key: k.key, clue: k.prompt, image_url: k.image_url ?? null, words: gameNorm(k.term).split(' ').map((x) => x.length), tiles }
        }),
      }
      break
    case 'sentence':
      board = {
        items: shuffle(keyed).map((k) => {
          const ws = k.term.trim().split(/\s+/)
          let tiles = shuffle(ws)
          if (tiles.join(' ') === ws.join(' ') && ws.length > 1) tiles = tiles.reverse()
          return { key: k.key, clue: k.prompt, image_url: k.image_url ?? null, tiles }
        }),
      }
      break
    case 'hangman':
      board = { max_wrong: 6, items: shuffle(keyed).map((k) => ({ key: k.key, clue: k.prompt, image_url: k.image_url ?? null, mask: mask(k.term, []) })) }
      break
    case 'research':
      board = {
        case: settings.variants?.[0]?.case ?? null,
        criteria: settings.criteria ?? [],
        min_words: settings.min_words ?? 40,
        questions: keyed.map((k) => ({ key: k.key, text: k.term, hint: k.prompt || null, value: null })),
      }
      break
    case 'dictation': {
      const listen = settings.listen ?? 'term'
      board = {
        listen,
        accents: settings.accents ?? listen !== 'prompt',
        items: shuffle(keyed).map((k) => ({
          key: k.key,
          image_url: k.image_url ?? null,
          say: listen === 'prompt' ? k.prompt : dictEncode(k.term),
          hint: listen === 'prompt' ? null : k.prompt || null,
          words: k.term.trim().split(/\s+/).length,
        })),
      }
      break
    }
    case 'classify':
      board = {
        groups: shuffle([...new Set(keyed.map((k) => k.group?.trim()).filter((g): g is string => !!g))]),
        cards: shuffle(keyed.map((k) => ({ key: k.key, text: k.term, image_url: k.image_url ?? null }))),
      }
      break
  }

  const progress: Record<string, Progress & { letters?: string[] }> = {}
  const miss: Record<string, number> = {}

  const engine: Engine = {
    async play(action: PlayAction, data: Record<string, unknown>): Promise<PlayResult> {
      await new Promise((r) => setTimeout(r, 120))
      const val = String(data.value ?? '').trim()
      if (action === 'save') return { ok: true, item: String(data.item), done: val !== '' }
      if (action === 'find') {
        const v = gameLetters(val)
        const k = keyed.find((x) => !progress[x.key] && v && (gameLetters(x.term) === v || [...gameLetters(x.term)].reverse().join('') === v))
        if (!k) {
          return { ok: true, correct: false }
        }
        progress[k.key] = { done: true, correct: true, value: gameNorm(k.term), cells: data.cells as [number, number][], tries: 1, partial: 1 }
        return { ok: true, correct: true, item: k.key, value: gameNorm(k.term), points: 1000 }
      }
      if (action === 'pair') {
        const find = (key: unknown) => keyed.find((x) => x.tKey === key || x.dKey === key)
        const a = find(data.a)
        const b = find(data.b)
        if (!a || !b || data.a === data.b) return { ok: false, error: 'cards' }
        if (a === b) {
          const m = miss[a.key] ?? 0
          const partial = Math.max(0.5, 1 - 0.1 * Math.max(0, m - 1))
          progress[a.key] = { done: true, correct: true, partial, pair: [a.tKey, a.dKey] }
          return { ok: true, correct: true, item: a.key, points: Math.round(1000 * partial) }
        }
        miss[a.key] = (miss[a.key] ?? 0) + 1
        miss[b.key] = (miss[b.key] ?? 0) + 1
        return { ok: true, correct: false }
      }
      const k = byKey.get(String(data.item))
      if (!k) return { ok: false, error: 'item' }
      const prev = progress[k.key]
      if (prev?.done) return { ok: false, error: 'already' }
      if (action === 'letter') {
        const letter = gameNorm(String(data.letter ?? ''))[0]
        if (!letter) return { ok: false, error: 'letter' }
        const letters = prev?.letters ?? []
        let wrong = prev?.wrong ?? 0
        const hit = gameNorm(k.term).includes(letter)
        if (!letters.includes(letter)) {
          letters.push(letter)
          if (!hit) wrong++
        }
        const m = mask(k.term, letters)
        const correct = !m.includes('_')
        const done = correct || wrong >= 6
        const partial = correct ? Math.max(0.4, 1 - 0.1 * wrong) : 0
        progress[k.key] = { done, correct, wrong, letters, partial, value: done ? m : undefined }
        return { ok: true, item: k.key, mask: m, hit, wrong, done, correct, points: Math.round(1000 * partial), answer: done && !correct ? gameNorm(k.term) : undefined }
      }
      let ok = false
      if (!val) ok = false
      else if (type === 'crossword' || type === 'anagram') ok = gameLetters(val) === gameLetters(k.term)
      else if (type === 'rosco' || type === 'fill_text') ok = looseNorm(val) === looseNorm(k.term)
      else if (type === 'sentence') ok = gameNorm(val) === gameNorm(k.term)
      else if (type === 'classify') ok = looseNorm(val) === looseNorm(k.group ?? '')
      else if (type === 'matching') ok = val === k.dKey
      else if (type === 'dictation') ok = (settings.accents ?? (settings.listen ?? 'term') !== 'prompt') ? dictNorm(val) === dictNorm(k.term) : looseNorm(val) === looseNorm(k.term)
      const near = type === 'dictation' && !ok && looseNorm(val) === looseNorm(k.term)
      const n = (prev?.tries ?? 0) + 1
      const done = ok || n >= tries
      const partial = ok ? tryPartial(n) : 0
      const answer = type === 'classify' ? k.group : type === 'matching' ? k.dKey : ['crossword', 'anagram', 'rosco'].includes(type) ? gameNorm(k.term) : k.term
      progress[k.key] = { done, correct: ok, tries: n, partial, value: ok ? val : undefined, answer: done ? answer : undefined }
      return { ok: true, item: k.key, correct: ok, done, tries: n, tries_left: Math.max(0, tries - n), points: Math.round(1000 * partial), answer: done && !ok ? answer : undefined, near: near || undefined }
    },
  }

  return {
    board: { type, instructions: settings.instructions ?? null, tries, total: keyed.length, reveal: true, board, progress: {}, errors: 0 } as ActivityBoard,
    engine,
  }
}
