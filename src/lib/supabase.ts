import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // PKCE: los enlaces de correo vuelven con ?code=... y no chocan con el HashRouter (#/...)
    flowType: 'pkce',
    detectSessionInUrl: true,
    storageKey: 'yq-auth',
  },
})

/** Traduce los mensajes de error más comunes de Supabase al español. */
export function friendlyError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.'
  if (m.includes('weak password') || m.includes('password is known')) return 'Esa contraseña es muy débil. Usa una más larga y única.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet.'
  if (m.includes('row-level security') || m.includes('permission denied')) return 'No tienes permiso para realizar esta acción.'
  return message || 'Ocurrió un error inesperado.'
}
