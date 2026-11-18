// Prueba el script de Google Sheets (Code.gs) con una hoja de cálculo simulada en memoria.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Cell = string | number | boolean | Date | null
class FakeSheet {
  grid: Cell[][] = []
  hidden = new Set<number>()
  constructor(public name: string) {}
  private get(r: number, c: number): Cell {
    return this.grid[r - 1]?.[c - 1] ?? ''
  }
  private set(r: number, c: number, v: Cell) {
    while (this.grid.length < r) this.grid.push([])
    const row = this.grid[r - 1]
    while (row.length < c) row.push('')
    row[c - 1] = v
  }
  getLastRow() {
    for (let i = this.grid.length; i > 0; i--) if (this.grid[i - 1].some((v) => v !== '' && v !== null)) return i
    return 0
  }
  getLastColumn() {
    return this.grid.reduce((m, row) => {
      for (let i = row.length; i > 0; i--) if (row[i - 1] !== '' && row[i - 1] !== null) return Math.max(m, i)
      return m
    }, 0)
  }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`Rango inválido ${r},${c},${nr},${nc}`)
    const self = this
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => self.get(r + i, c + j))),
      setValues: (vals: Cell[][]) => {
        if (vals.length !== nr || vals.some((row) => row.length !== nc)) throw new Error('Las dimensiones no coinciden')
        vals.forEach((row, i) => row.forEach((v, j) => self.set(r + i, c + j, v)))
        return range
      },
      setValue: (v: Cell) => (self.set(r, c, v), range),
      clearContent: () => {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (self.grid[r - 1 + i]?.[c - 1 + j] !== undefined) self.set(r + i, c + j, '')
        return range
      },
      setFontWeight: () => range,
      setBackground: () => range,
      setFontColor: () => range,
    }
    return range
  }
  setFrozenRows() {}
  hideRows(r: number) {
    this.hidden.add(r)
  }
  rows(from = 1) {
    const w = this.getLastColumn()
    return this.grid
      .slice(from - 1, this.getLastRow())
      .map((r) => Array.from({ length: w }, (_, i) => r[i] ?? ''))
      .map((r) => r.map((v) => (v instanceof Date ? 'fecha' : v)))
  }
}
class FakeBook {
  sheets = new Map<string, FakeSheet>()
  getSheetByName(n: string) {
    return this.sheets.get(n) ?? null
  }
  insertSheet(n: string) {
    const s = new FakeSheet(n)
    this.sheets.set(n, s)
    return s
  }
  getName() {
    return 'Notas YaguarQuiz'
  }
  getUrl() {
    return 'https://docs.google.com/spreadsheets/d/x'
  }
}

function loadScript(token = 'secreto-123') {
  const book = new FakeBook()
  const code = readFileSync('google-apps-script/Code.gs', 'utf8').replace("const TOKEN = 'PEGUE_AQUI_SU_TOKEN';", `const TOKEN = '${token}';`)
  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }),
    },
  }
  const fn = new Function(...Object.keys(globals), `${code}; return { doPost, doGet };`)
  const api = fn(...Object.values(globals)) as { doPost: (e: unknown) => { body: Record<string, unknown> }; doGet: () => { body: Record<string, unknown> } }
  const post = (data: unknown) => api.doPost({ postData: { contents: JSON.stringify(data) } }).body
  return { book, post, api }
}

const payload = (id: string, title: string, grades: [string, string, number | null][]) => ({
  token: 'secreto-123',
  action: 'sync',
  session: { id, fecha: '18/11/2026', gestion: 2026, periodo: 'II/2026', asignatura: 'TIC', sigla: 'TSOS 023', paralelo: 'A', tema: 'Ofimática', evaluacion: title, modo: 'Examen', participantes: grades.length, inscritos: 3, promedio: 70, aprobacion_pct: 66.7, categoria: '1er parcial · Examen' },
  notas: { sheet: 'Notas_TSOS023_A', column: { id, header: `${title} (18/11)` }, rows: grades.map(([ru, nombre, nota]) => ({ ru, nombre, nota })) },
  respuestas: grades.flatMap(([ru, nombre]) => [1, 2].map((n) => ({ ru, nombre, n, pregunta: `P${n}`, respuesta: 'x', correcta: n === 1, credito: n === 1 ? 100 : 0, tiempo_s: 3, puntos: 900 }))),
  preguntas: [1, 2].map((n) => ({ n, pregunta: `P${n}`, tipo: 'Opción única', respondieron: grades.length, aciertos: 1, pct: 33.3, distractor: 'Riberalta', tiempo_s: 4, dificil: n === 2 })),
})

describe('Google Apps Script (4 hojas)', () => {
  it('rechaza un token incorrecto', () => {
    const { post, book } = loadScript()
    expect(post({ token: 'otro', action: 'sync' })).toMatchObject({ ok: false, error: 'token' })
    expect(book.sheets.size).toBe(0)
  })
  it('el script sin token configurado no acepta nada', () => {
    const { post } = loadScript('PEGUE_AQUI_SU_TOKEN')
    expect(post({ token: 'PEGUE_AQUI_SU_TOKEN', action: 'ping' }).ok).toBe(false)
  })
  it('ping responde con el nombre de la hoja', () => {
    const { post } = loadScript()
    expect(post({ token: 'secreto-123', action: 'ping' })).toMatchObject({ ok: true, name: 'Notas YaguarQuiz' })
  })

  it('crea las 4 hojas y reenviar NO duplica', () => {
    const { post, book } = loadScript()
    const p1 = payload('s1', 'Examen 1', [['101', 'Pérez, Ana', 80], ['102', 'Rojas, Luis', 40]])
    expect(post(p1).ok).toBe(true)
    expect([...book.sheets.keys()].sort()).toEqual(['Analisis_Preguntas', 'Detalle_Respuestas', 'Notas_TSOS023_A', 'Resumen_Sesiones'])
    const snap = () => [...book.sheets.values()].map((s) => s.getLastRow())
    const before = snap()
    expect(post(p1).ok).toBe(true)
    expect(post(p1).ok).toBe(true)
    expect(snap()).toEqual(before)
    expect(book.getSheetByName('Resumen_Sesiones')!.getLastRow()).toBe(2)
    expect(book.getSheetByName('Detalle_Respuestas')!.getLastRow()).toBe(1 + 4)
    expect(book.getSheetByName('Analisis_Preguntas')!.getLastRow()).toBe(1 + 2)
  })

  it('la libreta: una fila por estudiante y una columna por evaluación', () => {
    const { post, book } = loadScript()
    post(payload('s1', 'Examen 1', [['101', 'Pérez, Ana', 80], ['102', 'Rojas, Luis', 40]]))
    post(payload('s2', 'Práctica 2', [['102', 'Rojas, Luis', 90], ['103', 'Vaca, María', 100]]))
    // corrección de nota en la sesión 1 y reenvío
    post(payload('s1', 'Examen 1', [['101', 'Pérez, Ana', 85], ['102', 'Rojas, Luis', 40]]))
    const notas = book.getSheetByName('Notas_TSOS023_A')!
    expect(notas.hidden.has(1)).toBe(true)
    expect(notas.rows(2)).toEqual([
      ['RU', 'Apellidos y nombres', 'Examen 1 (18/11)', 'Práctica 2 (18/11)'],
      ['101', 'Pérez, Ana', 85, ''],
      ['102', 'Rojas, Luis', 40, 90],
      ['103', 'Vaca, María', '', 100],
    ])
    const resumen = book.getSheetByName('Resumen_Sesiones')!
    expect(resumen.getLastRow()).toBe(3)
    // el detalle de s1 se reemplazó, el de s2 se conservó
    const det = book.getSheetByName('Detalle_Respuestas')!.rows(2)
    expect(det.filter((r) => r[0] === 's1').length).toBe(4)
    expect(det.filter((r) => r[0] === 's2').length).toBe(4)
    expect(det.length).toBe(8)
  })
})
