import { describe, expect, it } from 'vitest'
import { autoGradeResearch, criterionTerms } from '../../src/features/reports/researchAutoGrade'

const criteria = [
  { title: 'Evidencia real', desc: 'Nombra el negocio y da datos concretos que se pueden comprobar (redes, seguidores, fechas, publicaciones).' },
  { title: 'Usa los conceptos del tema', desc: 'Community manager, moderación, tipos de contenido, calendario, AIDA o PAS.' },
  { title: 'Propuesta aplicable', desc: 'Mejoras concretas para el próximo mes y un copy que se pueda publicar.' },
  { title: 'Redacción propia y clara', desc: 'Se entiende, tiene ortografía cuidada y no es texto genérico.' },
]
const q = (t: string) => ({ question: 'Pregunta', text: t })
const filler = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')

describe('autoGradeResearch', () => {
  it('saca términos clave del criterio (incluye siglas)', () => {
    const t = criterionTerms(criteria[1])
    expect(t).toContain('aida')
    expect(t).toContain('modera')
  })

  it('una entrega vacía saca 0', () => {
    const r = autoGradeResearch({ criteria, minWords: 40, answers: [q(''), q(''), q(''), q('')] })
    expect(r.grade).toBe(0)
    expect(r.scores).toEqual([0, 0, 0, 0])
  })

  it('una entrega completa, con conceptos y datos, saca 100', () => {
    const full =
      'La Pastelería Esquina Dulce de Cobija está en Facebook e Instagram con 2.300 seguidores; sus publicaciones del 10 y 15 de noviembre ' +
      'muestran tortas. El community manager hace moderación, combina tipos de contenido con un calendario y usa AIDA y PAS. ' +
      'Propongo mejoras para el próximo mes: publicar reels y este copy que se puede publicar: «¿Cumpleaños? Tu torta llega hoy». ' +
      filler(10)
    const r = autoGradeResearch({ criteria, minWords: 40, answers: [q(full), q(full), q(full), q(full)] })
    expect(r.grade).toBe(100)
  })

  it('texto largo pero sin conceptos ni datos queda a medias', () => {
    const r = autoGradeResearch({ criteria, minWords: 40, answers: [q(filler(50)), q(filler(50)), q(filler(50)), q(filler(50))] })
    expect(r.grade).toBeGreaterThan(0)
    expect(r.grade).toBeLessThan(100)
    expect(r.comment).toContain('Para mejorar')
  })
})
