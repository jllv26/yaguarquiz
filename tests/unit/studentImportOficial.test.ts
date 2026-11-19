import { describe, expect, it } from 'vitest'
import { parseStudentMatrix } from '../../src/features/students/studentImport'

// Mismo formato que la lista oficial de la universidad (LISTA_CON_DATOS_ESTUDIANTES_…xlsx)
const OFICIAL = [
  ['Lista de estudiantes — Ingeniería Comercial'],
  ['SEXTO SEMESTRE · Gestión 2026 · Periodo 2 · Generado 2026-11-19 · Ordenado por nombre'],
  ['N°', 'RU', 'CI', 'Nombre', 'Apellido paterno', 'Apellido materno', 'Nombre completo', 'Email principal', 'Correos adicionales', 'Celular', 'Dirección', 'Grado académico', 'Estado'],
  [1, '39302', '5706673', 'ALAN ADEMAR', 'TANGARA', 'DORI', 'ALAN ADEMAR TANGARA DORI', 'AlanAdemar@Gmail.com', '', '72926390', '', '', 'ACTIVO'],
  [2, '43929', '4219971', 'ARACELY BLANCA', 'PARUMA', '', 'ARACELY BLANCA PARUMA', 'aracelyparuma927@gmail.com', '', '71355859', '', '', 'ACTIVO'],
  [3, '266', '4202641', 'JIMMY LUIS', 'LARUTA', 'VILLARREAL', 'JIMMY LUIS LARUTA VILLARREAL', 'jismartbrands@gmail.com', '', '', '', 'LICENCIATURA', 'ACTIVO'],
  [4, '11111', '1234567', 'ANA', 'PEREZ', 'ROJAS', 'ANA PEREZ ROJAS', '', 'ana@uap.edu.bo', '7-123-4567', 'Calle 1', '', 'RETIRADO'],
]

describe('lista oficial de la universidad', () => {
  const r = parseStudentMatrix(OFICIAL)
  it('encuentra los encabezados debajo de los títulos', () => {
    expect(r.fatal).toBeUndefined()
    expect(r.rows).toHaveLength(4)
  })
  it('arma los apellidos con paterno + materno y usa la columna Nombre (no Nombre completo)', () => {
    expect(r.rows[0].data).toMatchObject({ university_code: '39302', ci: '5706673', last_names: 'TANGARA DORI', first_names: 'ALAN ADEMAR', paternal_last_name: 'TANGARA', maternal_last_name: 'DORI' })
    expect(r.rows[1].data.last_names).toBe('PARUMA')
    expect(r.rows[0].warnings).toEqual([])
  })
  it('guarda correo (en minúsculas), celular, correos adicionales, dirección, grado y estado', () => {
    expect(r.rows[0].data).toMatchObject({ email: 'alanademar@gmail.com', phone: '72926390', status_label: 'ACTIVO' })
    expect(r.rows[3].data).toMatchObject({ extra_emails: 'ana@uap.edu.bo', phone: '71234567', address: 'Calle 1', status_label: 'RETIRADO' })
  })
  it('avisa del docente (tiene grado académico) y de los retirados', () => {
    expect(r.rows[2].warnings.join(' ')).toMatch(/docente/)
    expect(r.rows[3].warnings.join(' ')).toMatch(/inactivo/)
    expect(r.stats.errors).toBe(0)
  })
})
