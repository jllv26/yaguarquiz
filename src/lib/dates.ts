/** Año actual (se calcula una vez al cargar la app). */
export const CURRENT_YEAR = new Date().getFullYear()

/** "2026-08-01" → "1 ago." */
export function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
}

/** Fecha y hora completa (timestamp) → "17 nov., 21:00" en hora de Bolivia. */
export function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })
}
