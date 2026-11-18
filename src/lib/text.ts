/** Quita tildes, pasa a minúsculas y colapsa espacios (para comparar encabezados y respuestas). */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Limpia una celda de texto: recorta y colapsa espacios. */
export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value)
  return String(value).replace(/\s+/g, ' ').trim()
}

/** RU normalizado igual que en la base de datos: sin espacios y en mayúsculas. */
export function normalizeCode(value: unknown): string {
  return cleanCell(value).replace(/\s+/g, '').toUpperCase()
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
