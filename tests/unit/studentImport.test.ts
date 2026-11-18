import { describe, expect, it } from 'vitest'
import { buildWorkbook, readTable } from '../../src/lib/excel'
import { parseStudentMatrix, rowErrorMessages, splitFullName } from '../../src/features/students/studentImport'
import { buildStudentTemplate } from '../../src/features/students/studentTemplate'

const SURNAMES = ['Pérez', 'Mamani', 'Quispe', 'Rojas', 'Vaca', 'Suárez', 'Cuéllar', 'Áñez', 'Roca', 'Melgar']
const NAMES = ['Ana', 'Carlos', 'María', 'Luis', 'Daniela', 'Jorge', 'Sofía', 'Miguel', 'Valeria', 'Diego']

/** Lista de 40 estudiantes con exactamente 2 errores (fila 8 sin nombres, fila 21 correo inválido). */
function list40(): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [['codigo_universitario', 'ci', 'apellidos', 'nombres', 'correo', 'carrera']]
  for (let i = 1; i <= 40; i++) {
    rows.push([
      `2024-${String(i).padStart(4, '0')}`,
      7000000 + i,
      `${SURNAMES[i % 10]} ${SURNAMES[(i + 3) % 10]}`,
      i === 7 ? null : NAMES[i % 10],
      i === 20 ? 'correo-malo@' : `est${i}@gmail.com`,
      'Turismo Sostenible',
    ])
  }
  return rows
}

describe('importación de estudiantes', () => {
  it('lista de 40 con 2 errores: muestra los errores por fila y deja 38 válidas', async () => {
    const blob = await buildWorkbook([{ sheet: 'Estudiantes', data: list40() }])
    const matrix = await readTable(blob)
    const res = parseStudentMatrix(matrix)
    expect(res.fatal).toBeUndefined()
    expect(res.stats.total).toBe(40)
    expect(res.stats.errors).toBe(2)
    expect(res.stats.valid).toBe(38)
    const msgs = rowErrorMessages(res.rows)
    expect(msgs).toEqual(['Fila 8: Faltan los nombres.', 'Fila 21: El correo "correo-malo@" no tiene un formato válido.'])
    expect(res.rows[0].data.ci).toBe('7000001')
  })

  it('marca existentes, ya inscritos y RU repetidos', () => {
    const m = [
      ['RU', 'Apellidos', 'Nombres'],
      ['a-1', 'Uno', 'X'],
      ['A-2', 'Dos', 'Y'],
      ['A-3', 'Tres', 'Z'],
      ['a-1', 'Repetido', 'W'],
      [null, null, null],
    ]
    const res = parseStudentMatrix(m, new Set(['A-2']), new Set(['A-3']))
    expect(res.rows.map((r) => r.status)).toEqual(['new', 'existing', 'enrolled', 'error'])
    expect(res.rows[3].errors[0]).toContain('repetido (ya aparece en la fila 2)')
  })

  it('acepta títulos arriba y una sola columna "Apellidos y nombres"', () => {
    const m = [
      ['UNIVERSIDAD AMAZÓNICA DE PANDO'],
      ['Lista oficial TSOS 023'],
      ['N°', 'Registro Universitario', 'Apellidos y Nombres'],
      [1, '2023 0001', 'PÉREZ GÓMEZ ANA LUCÍA'],
      [2, '2023-0002', 'DE LA CRUZ ROCA MIGUEL'],
    ]
    const res = parseStudentMatrix(m)
    expect(res.fatal).toBeUndefined()
    expect(res.rows[0].data).toMatchObject({ university_code: '20230001', last_names: 'PÉREZ GÓMEZ', first_names: 'ANA LUCÍA' })
    expect(res.rows[1].data).toMatchObject({ last_names: 'DE LA CRUZ ROCA', first_names: 'MIGUEL' })
    expect(res.rows[0].warnings.length).toBe(1)
  })

  it('rechaza archivos sin encabezados reconocibles', () => {
    expect(parseStudentMatrix([['a', 'b'], [1, 2]]).fatal).toMatch(/encabezados/)
  })

  it('lee CSV con punto y coma', async () => {
    const file = new File(['codigo_universitario;apellidos;nombres\n2024-1;Paz;Ana\n'], 'lista.csv', { type: 'text/csv' })
    const res = parseStudentMatrix(await readTable(file))
    expect(res.rows[0].data).toMatchObject({ university_code: '2024-1', last_names: 'Paz', first_names: 'Ana' })
  })

  it('la plantilla descargable se puede volver a importar (3 ejemplos válidos)', async () => {
    const res = parseStudentMatrix(await readTable(await buildStudentTemplate()))
    expect(res.stats).toMatchObject({ total: 3, valid: 3, errors: 0 })
  })

  it('separa nombres completos', () => {
    expect(splitFullName('Mamani Quispe Carlos')).toEqual({ last: 'Mamani Quispe', first: 'Carlos' })
    expect(splitFullName('Rojas Ana')).toEqual({ last: 'Rojas', first: 'Ana' })
  })
})
