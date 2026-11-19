import { cleanCell, EMAIL_RE, normalizeCode, normalizeText } from '../../lib/text'

export type StudentField =
  | 'university_code'
  | 'ci'
  | 'last_names'
  | 'first_names'
  | 'email'
  | 'career'
  | 'paternal_last_name'
  | 'maternal_last_name'
  | 'phone'
  | 'extra_emails'
  | 'address'
  | 'degree'
  | 'status_label'

export interface StudentData {
  university_code: string
  ci: string
  last_names: string
  first_names: string
  email: string
  career: string
  paternal_last_name: string
  maternal_last_name: string
  phone: string
  extra_emails: string
  address: string
  degree: string
  status_label: string
}

export type RowStatus = 'new' | 'existing' | 'enrolled' | 'error'

export interface ParsedStudentRow {
  /** Número de fila tal como se ve en Excel (1 = encabezado) */
  rowNumber: number
  data: StudentData
  errors: string[]
  warnings: string[]
  status: RowStatus
}

export interface ParseResult {
  rows: ParsedStudentRow[]
  /** Error que impide leer el archivo (encabezados irreconocibles, archivo vacío…) */
  fatal?: string
  mappedColumns: Partial<Record<StudentField | 'full_name', string>>
  stats: { total: number; valid: number; errors: number; new: number; existing: number; enrolled: number }
}

/** Columnas oficiales de la plantilla (en orden). */
export const TEMPLATE_HEADERS: { field: StudentField; header: string; required: boolean; example: string[] }[] = [
  { field: 'university_code', header: 'codigo_universitario', required: true, example: ['2024-0153', '2024-0218', '2023-0987'] },
  { field: 'ci', header: 'ci', required: false, example: ['7654321', '8123456', '6543210-1B'] },
  { field: 'last_names', header: 'apellidos', required: true, example: ['Pérez Gómez', 'Mamani Quispe', 'Rojas Vaca'] },
  { field: 'first_names', header: 'nombres', required: true, example: ['Ana Lucía', 'Carlos', 'María José'] },
  { field: 'email', header: 'correo', required: false, example: ['ana.perez@gmail.com', '', 'mjrojas@gmail.com'] },
  { field: 'career', header: 'carrera', required: false, example: ['Turismo Sostenible', 'Turismo Sostenible', 'Turismo Sostenible'] },
  { field: 'phone', header: 'celular', required: false, example: ['72912345', '', '68012345'] },
  { field: 'extra_emails', header: 'correos_adicionales', required: false, example: ['', '', ''] },
  { field: 'address', header: 'direccion', required: false, example: ['', '', ''] },
  { field: 'degree', header: 'grado_academico', required: false, example: ['', '', ''] },
  { field: 'status_label', header: 'estado', required: false, example: ['ACTIVO', 'ACTIVO', 'ACTIVO'] },
]

/** Sinónimos aceptados en los encabezados (ya normalizados: sin tildes ni mayúsculas). */
const SYNONYMS: Record<StudentField | 'full_name', string[]> = {
  university_code: [
    'codigo universitario', 'codigo', 'cod', 'ru', 'r u', 'registro universitario', 'registro', 'nro registro',
    'matricula', 'cu', 'codigo estudiante',
  ],
  ci: ['ci', 'c i', 'carnet', 'carnet de identidad', 'cedula', 'cedula de identidad', 'documento', 'dni'],
  last_names: ['apellidos', 'apellido', 'apellido paterno y materno', 'apellidos completos'],
  first_names: ['nombres', 'nombre', 'nombre s'],
  email: ['correo', 'correo electronico', 'email', 'e mail', 'mail', 'gmail', 'email principal', 'correo principal'],
  career: ['carrera', 'programa', 'especialidad'],
  paternal_last_name: ['apellido paterno', 'paterno', 'primer apellido'],
  maternal_last_name: ['apellido materno', 'materno', 'segundo apellido'],
  phone: ['celular', 'telefono', 'cel', 'telefono celular', 'movil', 'whatsapp', 'nro celular', 'numero de celular'],
  extra_emails: ['correos adicionales', 'correo adicional', 'otros correos', 'email adicional', 'emails adicionales'],
  address: ['direccion', 'domicilio', 'direccion domicilio'],
  degree: ['grado academico', 'grado', 'nivel academico'],
  status_label: ['estado', 'situacion', 'estado del estudiante'],
  full_name: ['apellidos y nombres', 'nombre completo', 'nombres y apellidos', 'estudiante', 'nombre y apellido'],
}

const FIELD_LABEL: Record<StudentField, string> = {
  university_code: 'código universitario (RU)',
  ci: 'CI',
  last_names: 'apellidos',
  first_names: 'nombres',
  email: 'correo',
  career: 'carrera',
  paternal_last_name: 'apellido paterno',
  maternal_last_name: 'apellido materno',
  phone: 'celular',
  extra_emails: 'correos adicionales',
  address: 'dirección',
  degree: 'grado académico',
  status_label: 'estado',
}

function matchHeader(cell: unknown): StudentField | 'full_name' | null {
  const h = normalizeText(cell)
  if (!h) return null
  for (const [field, list] of Object.entries(SYNONYMS) as [StudentField | 'full_name', string[]][]) {
    if (list.includes(h)) return field
  }
  return null
}

/** Busca la fila de encabezados entre las primeras 10 filas (algunas listas traen títulos arriba). */
function findHeaderRow(matrix: unknown[][]) {
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const map = new Map<StudentField | 'full_name', number>()
    matrix[r]?.forEach((cell, c) => {
      const f = matchHeader(cell)
      if (f && !map.has(f)) map.set(f, c)
    })
    const hasLast = map.has('last_names') || map.has('paternal_last_name')
    if (map.has('university_code') && (map.has('full_name') || (hasLast && map.has('first_names')))) {
      return { headerRow: r, map }
    }
  }
  return null
}

/**
 * Divide "PÉREZ GÓMEZ ANA LUCÍA" en apellidos y nombres (convención boliviana:
 * los dos primeros términos son apellidos). Respeta partículas como "DE LA".
 */
export function splitFullName(full: string): { last: string; first: string } {
  const words = full.split(' ').filter(Boolean)
  if (words.length <= 1) return { last: words[0] ?? '', first: '' }
  if (words.length === 2) return { last: words[0], first: words[1] }
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'vda', 'vda.'])
  const last: string[] = []
  let surnames = 0
  let i = 0
  while (i < words.length - 1 && surnames < 2) {
    last.push(words[i])
    if (!particles.has(words[i].toLowerCase())) surnames++
    i++
  }
  return { last: last.join(' '), first: words.slice(i).join(' ') }
}

/**
 * Convierte la hoja (matriz de celdas) en filas validadas.
 * @param existingCodes RU que el docente ya tiene registrados (se reutilizan)
 * @param enrolledCodes RU que ya están inscritos en esta asignatura
 */
export function parseStudentMatrix(
  matrix: unknown[][],
  existingCodes: Set<string> = new Set(),
  enrolledCodes: Set<string> = new Set(),
): ParseResult {
  const empty: ParseResult['stats'] = { total: 0, valid: 0, errors: 0, new: 0, existing: 0, enrolled: 0 }
  if (!matrix.length) return { rows: [], fatal: 'El archivo está vacío.', mappedColumns: {}, stats: empty }

  const found = findHeaderRow(matrix)
  if (!found) {
    return {
      rows: [],
      fatal:
        'No encontré los encabezados. La primera fila debe tener: codigo_universitario, ci, apellidos, nombres, correo, carrera. Descarga la plantilla para ver el formato.',
      mappedColumns: {},
      stats: empty,
    }
  }

  const { headerRow, map } = found
  const mappedColumns: ParseResult['mappedColumns'] = {}
  map.forEach((col, field) => (mappedColumns[field] = cleanCell(matrix[headerRow][col])))

  const get = (row: unknown[], f: StudentField | 'full_name') => {
    const c = map.get(f)
    return c === undefined ? '' : cleanCell(row[c])
  }

  const seen = new Map<string, number>()
  const rows: ParsedStudentRow[] = []

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? []
    if (raw.every((c) => cleanCell(c) === '')) continue // fila vacía

    const errors: string[] = []
    const warnings: string[] = []
    const paternal = get(raw, 'paternal_last_name')
    const maternal = get(raw, 'maternal_last_name')
    // lista oficial con apellido paterno y materno separados: «apellidos» = paterno + materno
    let last = get(raw, 'last_names') || [paternal, maternal].filter(Boolean).join(' ')
    let first = get(raw, 'first_names')
    if (!last && !first && map.has('full_name')) {
      const split = splitFullName(get(raw, 'full_name'))
      last = split.last
      first = split.first
      if (last && first) warnings.push('Apellidos y nombres separados automáticamente: revísalos.')
    }

    const data: StudentData = {
      university_code: normalizeCode(get(raw, 'university_code')),
      ci: get(raw, 'ci').replace(/\s+/g, ''),
      last_names: last,
      first_names: first,
      email: get(raw, 'email').toLowerCase(),
      career: get(raw, 'career'),
      paternal_last_name: paternal,
      maternal_last_name: maternal,
      phone: get(raw, 'phone').replace(/[^\d+ ]/g, '').trim(),
      extra_emails: get(raw, 'extra_emails').toLowerCase(),
      address: get(raw, 'address'),
      degree: get(raw, 'degree'),
      status_label: get(raw, 'status_label').toUpperCase(),
    }

    if (!data.university_code) errors.push(`Falta el ${FIELD_LABEL.university_code}.`)
    else if (data.university_code.length > 30) errors.push('El código universitario es demasiado largo.')
    if (!data.last_names) errors.push('Faltan los apellidos.')
    if (!data.first_names) errors.push('Faltan los nombres.')
    if (data.email && !EMAIL_RE.test(data.email)) errors.push(`El correo "${data.email}" no tiene un formato válido.`)
    if (data.ci && !/^[0-9]{4,10}(-?[0-9A-Z]{1,3})?$/i.test(data.ci)) warnings.push(`Revisa el CI "${data.ci}".`)
    if (data.status_label && /^(INACTIV|RETIR|ABANDON|BAJA|SUSPEND)/.test(data.status_label)) warnings.push(`Estado ${data.status_label}: se registra como inactivo.`)
    if (/^(LIC|ING|MSC|MGR|DR|PHD)/.test(data.degree.toUpperCase())) warnings.push(`Tiene grado académico «${data.degree}»: ¿es el docente? Si no es estudiante, elimínelo después en Estudiantes.`)

    if (data.university_code) {
      const prev = seen.get(data.university_code)
      if (prev !== undefined) errors.push(`El código ${data.university_code} está repetido (ya aparece en la fila ${prev}).`)
      else seen.set(data.university_code, r + 1)
    }

    let status: RowStatus = 'new'
    if (errors.length) status = 'error'
    else if (enrolledCodes.has(data.university_code)) status = 'enrolled'
    else if (existingCodes.has(data.university_code)) status = 'existing'

    rows.push({ rowNumber: r + 1, data, errors, warnings, status })
  }

  const stats = {
    total: rows.length,
    errors: rows.filter((x) => x.status === 'error').length,
    valid: rows.filter((x) => x.status !== 'error').length,
    new: rows.filter((x) => x.status === 'new').length,
    existing: rows.filter((x) => x.status === 'existing').length,
    enrolled: rows.filter((x) => x.status === 'enrolled').length,
  }
  if (!rows.length) return { rows, fatal: 'La hoja no tiene estudiantes debajo de los encabezados.', mappedColumns, stats }
  return { rows, mappedColumns, stats }
}

/** Mensaje de error tal como se muestra al docente: "Fila 7: Faltan los nombres." */
export function rowErrorMessages(rows: ParsedStudentRow[]): string[] {
  return rows.flatMap((r) => r.errors.map((e) => `Fila ${r.rowNumber}: ${e}`))
}
