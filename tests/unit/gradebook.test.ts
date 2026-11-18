import { describe, expect, it } from 'vitest'
import { computeGradebook, type GbData } from '../../src/lib/gradebook'

const base: GbData = {
  subject: { id: 's', code: 'TSOS 023', parallel: 'A', name: 'TIC', career: null, period: 'II/2026' },
  plan: {
    id: 'p',
    pass_mark: 51,
    max_score: 100,
    items: [
      { id: 'ex1', term: 1, category: 'Examen', weight: 20, source: 'yaguarquiz' },
      { id: 'pr1', term: 1, category: 'Prácticas', weight: 10, source: 'yaguarquiz' },
      { id: 'ex2', term: 2, category: 'Examen', weight: 30, source: 'yaguarquiz' },
      { id: 'as3', term: 3, category: 'Asistencia', weight: 10, source: 'manual' },
      { id: 'pf3', term: 3, category: 'Proyecto final', weight: 30, source: 'manual' },
    ],
  },
  students: [
    { id: 'ana', code: '1', name: 'Ana' },
    { id: 'luis', code: '2', name: 'Luis' },
  ],
  sessions: [
    { id: 'q1', mode: 'exam', title: 'Examen 1', date: '2026-09-01', grading_item_id: 'ex1', done: true },
    { id: 'p1', mode: 'live', title: 'Práctica 1', date: '2026-09-02', grading_item_id: 'pr1', done: true },
    { id: 'p2', mode: 'homework', title: 'Práctica 2', date: '2026-09-09', grading_item_id: 'pr1', done: true },
    { id: 'q2', mode: 'exam', title: 'Examen 2', date: '2026-10-01', grading_item_id: 'ex2', done: false },
    { id: 'x', mode: 'live', title: 'Repaso sin nota', date: '2026-10-02', grading_item_id: null, done: true },
  ],
  grades: [
    { session_id: 'q1', student_id: 'ana', grade: 80 },
    { session_id: 'p1', student_id: 'ana', grade: 100 },
    { session_id: 'p2', student_id: 'ana', grade: 60 },
    { session_id: 'q2', student_id: 'ana', grade: 90 },
    { session_id: 'x', student_id: 'ana', grade: 10 },
    { session_id: 'q1', student_id: 'luis', grade: 50 },
    { session_id: 'p1', student_id: 'luis', grade: 70 },
  ],
  manual: [
    { item_id: 'as3', student_id: 'ana', score: 100 },
    { item_id: 'pf3', student_id: 'ana', score: 85 },
  ],
}

describe('conversor de notas', () => {
  const { rows, maxByTerm, terms } = computeGradebook(base)
  const ana = rows.find((r) => r.student.id === 'ana')!
  const luis = rows.find((r) => r.student.id === 'luis')!

  it('aporte = (nota / 100) × peso', () => {
    expect(ana.cells.ex1.contribution).toBe(16) // 80 % de 20
    expect(ana.cells.ex2.contribution).toBe(27) // 90 % de 30 (aunque el examen siga abierto, ya tiene nota)
  })
  it('varias actividades de una categoría se promedian', () => {
    expect(ana.cells.pr1.score).toBe(80) // (100 + 60) / 2
    expect(ana.cells.pr1.contribution).toBe(8)
  })
  it('ausente en una actividad cerrada cuenta 0; en una abierta queda pendiente', () => {
    expect(luis.cells.pr1.score).toBe(35) // (70 + 0) / 2
    expect(luis.cells.ex2.score).toBeNull()
    expect(luis.cells.ex2.contribution).toBeNull()
  })
  it('las actividades sin categoría no influyen', () => {
    expect(ana.final).toBe(16 + 8 + 27 + 10 + 25.5)
  })
  it('notas manuales y pendientes', () => {
    expect(ana.cells.pf3.contribution).toBe(25.5)
    expect(ana.pending).toBe(0)
    expect(luis.pending).toBe(3) // examen 2 abierto + asistencia + proyecto
  })
  it('totales por parcial, nota final redondeada y aprobación con 51', () => {
    expect(terms).toEqual([1, 2, 3])
    expect(maxByTerm).toEqual({ 1: 30, 2: 30, 3: 40 })
    expect(ana.termTotals).toEqual({ 1: 24, 2: 27, 3: 35.5 })
    expect(ana.finalRounded).toBe(87)
    expect(ana.passed).toBe(true)
    expect(luis.final).toBe(13.5) // 50 % de 20 = 10 + 35 % de 10 = 3,5
    expect(luis.passed).toBe(false)
  })
  it('50,5 se redondea a 51 (aprueba)', () => {
    const d: GbData = {
      ...base,
      plan: { ...base.plan!, items: [{ id: 'm', term: 1, category: 'Todo', weight: 100, source: 'manual' }] },
      manual: [{ item_id: 'm', student_id: 'ana', score: 50.5 }],
    }
    const r = computeGradebook(d).rows.find((x) => x.student.id === 'ana')!
    expect(r.finalRounded).toBe(51)
    expect(r.passed).toBe(true)
  })
  it('sin plan no rompe', () => {
    const r = computeGradebook({ ...base, plan: null })
    expect(r.rows[0].final).toBe(0)
    expect(r.items).toEqual([])
  })
})
