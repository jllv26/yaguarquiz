/**
 * Configuración pública de Supabase.
 * La "publishable key" (sb_publishable_...) es pública por diseño: la seguridad
 * real la dan las reglas RLS y las funciones del servidor.
 * Se puede sobrescribir con un archivo .env (ver .env.example).
 * NUNCA pongas aquí la "secret key" (sb_secret_...).
 */
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://ywoamnwsacphjfjokmkg.supabase.co'

export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_WJyzJzbWEvLTRztsEbvP5g_pKXe6OsZ'
