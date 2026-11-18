/** Año actual (se calcula una vez al cargar la app). */
export const CURRENT_YEAR = new Date().getFullYear()

/** "2026-08-01" → "1 ago." */
export function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
}
