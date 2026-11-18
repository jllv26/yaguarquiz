import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

/**
 * Enlaces de invitación enviados desde el panel de Supabase llegan como
 * #access_token=...&type=invite (flujo implícito), lo que choca con el HashRouter.
 * Se capturan aquí, antes de crear el cliente, y se limpian de la URL.
 */
export interface PendingLink {
  tokens?: { access_token: string; refresh_token: string }
  type?: string | null
  error?: string | null
}

function readAuthHash(): PendingLink | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw.includes('access_token=') && !raw.includes('error_description=')) return null
  const p = new URLSearchParams(raw)
  const access_token = p.get('access_token')
  const refresh_token = p.get('refresh_token')
  const target = access_token ? '#/admin/configuracion' : '#/admin/login'
  window.history.replaceState(null, '', `${window.location.pathname}${target}`)
  return {
    tokens: access_token && refresh_token ? { access_token, refresh_token } : undefined,
    type: p.get('type'),
    error: p.get('error_description'),
  }
}

export const pendingLink = readAuthHash()

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
  if (m.includes('expired') || m.includes('invalid')) return 'El enlace venció o ya fue usado. Pide uno nuevo.'
  if (m.includes('signups not allowed') || m.includes('user not found')) return 'Ese correo no tiene una cuenta de docente.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet.'
  if (m.includes('row-level security') || m.includes('permission denied')) return 'No tienes permiso para realizar esta acción.'
  return message || 'Ocurrió un error inesperado.'
}
