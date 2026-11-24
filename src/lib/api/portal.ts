import type { GbData } from '../gradebook'
import { supabase } from '../supabase'
import type { ActivityType } from '../../features/activities/types'

export interface PortalItem {
  id: string
  pin: string
  mode: 'homework' | 'exam'
  title: string
  activity: ActivityType | null
  opens: string | null
  closes: string | null
  max_attempts: number
  time_limit_sec: number | null
  win: 'open' | 'not_open' | 'closed'
  category: string | null
  done: number
  best: number | null
  in_progress: boolean
}
export type PortalResult =
  | { ok: false; error: 'code' | 'ru' | 'ci' }
  | { ok: true; step: 'ru'; subject: string; parallel: string }
  | { ok: true; step: 'ci'; subject: string; name: string }
  | { ok: true; step: 'list'; subject: string; parallel: string; code: string; student: { name: string; ru: string }; items: PortalItem[] }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const portalLookup = async (code: string, ru?: string | null, ci?: string | null) => {
  const r = await rpc<PortalResult>('portal_lookup', { p_code: code, p_ru: ru ?? null, p_ci: ci ?? null })
  // mismo cierre → por su número («Casa 2» antes de «Casa 10»)
  if (r.ok && r.step === 'list')
    r.items = [...r.items].sort((a, b) => (a.closes ?? '').slice(0, 16).localeCompare((b.closes ?? '').slice(0, 16)) || a.title.localeCompare(b.title, 'es', { numeric: true }))
  return r
}
export const portalSetCode = (subject: string, code: string) => rpc<{ ok: true; code: string }>('portal_set_code', { p_subject: subject, p_code: code })

/** Lo que el estudiante dejó en este navegador para no escribirlo cada vez. */
export interface PortalLogin {
  code: string
  ru: string
  ci: string
}
const KEY = 'yq-aula'
export function readPortalLogin(): PortalLogin | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PortalLogin | null
    return v && v.code && v.ru ? v : null
  } catch {
    return null
  }
}
export function savePortalLogin(v: PortalLogin | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* sin almacenamiento */
  }
}
export const portalUrl = (code: string) => `${location.origin}${location.pathname}#/aula/${code}`

/** Libreta del estudiante (solo su fila): mismos datos que la libreta del docente. */
export type PortalGradesData = Omit<GbData, 'sessions'> & { sessions: (GbData['sessions'][number] & { show_grade: boolean })[] }
export type PortalGrades = { ok: false; error: 'code' | 'ru' | 'ci' } | ({ ok: true } & PortalGradesData)
export const portalGrades = (code: string, ru: string, ci: string) => rpc<PortalGrades>('portal_grades', { p_code: code, p_ru: ru, p_ci: ci || null })
