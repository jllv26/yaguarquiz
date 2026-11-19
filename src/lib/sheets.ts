import { useQuery } from '@tanstack/react-query'
import {
  DIFFICULT_PCT,
  fetchAnswers,
  fetchReport,
  logSheetSync,
  MODE_LABEL,
  questionPct,
  stats,
  topDistractor,
  TYPE_LABEL,
  type AnswerRow,
  type SessionReport,
} from './api/reports'
import { TERM_LABEL } from '../features/academic/gradingDefaults'
import { friendlyError, supabase } from './supabase'

export interface SheetsSettings {
  sheets_webapp_url: string | null
  sheets_token: string | null
}

export function useSheetsSettings() {
  return useQuery({
    queryKey: ['sheets-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teacher_settings').select('sheets_webapp_url, sheets_token').maybeSingle()
      if (error) throw new Error(friendlyError(error.message))
      return (data ?? { sheets_webapp_url: null, sheets_token: null }) as SheetsSettings
    },
  })
}

export async function saveSheetsSettings(uid: string, s: SheetsSettings) {
  const { error } = await supabase.from('teacher_settings').upsert({ teacher_id: uid, ...s, updated_at: new Date().toISOString() })
  if (error) throw new Error(friendlyError(error.message))
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return 'yq_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const isWebAppUrl = (u: string) => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(u.trim())

/**
 * Envía a Apps Script. Se usa Content-Type text/plain para que el navegador no haga la consulta previa
 * (CORS) que Apps Script no responde.
 */
async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; message?: string; url?: string; name?: string }> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
  } catch {
    return { ok: false, error: 'network', message: 'No se pudo conectar con Google. Revise el internet o la URL de la aplicación web.' }
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as { ok: boolean; error?: string; message?: string; url?: string }
  } catch {
    const hint = /accounts\.google|ServiceLogin|Sign in/i.test(text)
      ? 'Google pidió iniciar sesión: en la implementación elija "Quién tiene acceso: Cualquier persona".'
      : 'La URL no parece ser la de la aplicación web de su script.'
    return { ok: false, error: 'response', message: hint }
  }
}

export async function pingSheets(s: SheetsSettings) {
  if (!s.sheets_webapp_url || !s.sheets_token) return { ok: false, message: 'Falta la URL o el token.' }
  return post(s.sheets_webapp_url, { token: s.sheets_token, action: 'ping' })
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/La_Paz' })
const sheetName = (code: string, parallel: string) => `Notas_${code.replace(/[^A-Za-z0-9]/g, '')}_${parallel.replace(/[^A-Za-z0-9]/g, '')}`

/** Arma el paquete con las 4 hojas a partir del reporte de la sesión. */
export function buildSheetsPayload(rep: SessionReport, answers: AnswerRow[], token: string) {
  const s = rep.session
  const st = stats(rep)
  const date = fmtDate(s.opens_at ?? s.created_at)
  const roster = s.identification === 'roster'
  const evaluacion = `${s.quiz_title}${s.mode !== 'live' ? ` (${MODE_LABEL[s.mode]})` : ''}`
  const graded = rep.students.filter((x) => !x.kicked)
  return {
    token,
    action: 'sync',
    session: {
      id: s.id,
      fecha: date,
      gestion: s.year,
      periodo: s.period,
      asignatura: s.subject.name,
      sigla: s.subject.code,
      paralelo: s.subject.parallel,
      tema: s.topic,
      evaluacion,
      modo: MODE_LABEL[s.mode],
      participantes: st.participants,
      inscritos: s.enrolled,
      promedio: st.avg,
      aprobacion_pct: st.passPct,
      categoria: s.grading_item ? `${TERM_LABEL(s.grading_item.term)} · ${s.grading_item.category} (${s.grading_item.weight} pts)` : '',
    },
    // la libreta solo tiene sentido con la lista oficial (RU)
    notas: roster
      ? {
          sheet: sheetName(s.subject.code, s.subject.parallel),
          column: { id: s.id, header: `${s.quiz_title} (${date})` },
          rows: [
            ...graded.filter((x) => x.code).map((x) => ({ ru: x.code, nombre: x.name, nota: x.grade === null ? null : Math.round(Number(x.grade) * 10) / 10 })),
            // los ausentes figuran con 0 solo cuando la actividad ya cerró
            ...(s.done ? rep.absent.map((a) => ({ ru: a.code, nombre: a.name, nota: 0 })) : []),
          ],
        }
      : null,
    respuestas: answers.map((a) => ({
      ru: a.code ?? '',
      nombre: a.name,
      n: a.question_index,
      pregunta: a.prompt,
      respuesta: a.answer ?? '',
      correcta: a.correct,
      credito: Math.round(Number(a.partial) * 100),
      tiempo_s: a.time_ms !== null && s.mode === 'live' ? Math.round(a.time_ms / 100) / 10 : '',
      puntos: a.points,
    })),
    preguntas: rep.questions.map((q) => {
      const pct = questionPct(q)
      return {
        n: q.index,
        pregunta: q.prompt,
        tipo: TYPE_LABEL[q.type],
        respondieron: q.answered,
        aciertos: q.correct,
        pct: pct ?? '',
        distractor: topDistractor(q) ?? '',
        tiempo_s: q.avg_time_ms ? Math.round(Number(q.avg_time_ms) / 100) / 10 : '',
        dificil: pct !== null && pct < DIFFICULT_PCT,
      }
    }),
  }
}

/** Envía una sesión a Google Sheets y deja registro (ok / error). */
export async function syncSession(sessionId: string, s: SheetsSettings) {
  if (!s.sheets_webapp_url || !s.sheets_token) return { ok: false, message: 'Configure Google Sheets en Configuración.' }
  const [rep, answers] = await Promise.all([fetchReport(sessionId), fetchAnswers(sessionId)])
  const res = await post(s.sheets_webapp_url, buildSheetsPayload(rep, answers, s.sheets_token))
  const msg = res.ok ? undefined : res.error === 'token' ? 'El token del script no coincide con el de YaguarQuiz.' : (res.message ?? 'Error desconocido')
  await logSheetSync(sessionId, res.ok, msg).catch(() => null)
  return { ok: res.ok, message: msg, url: res.url }
}

// ------------------------------------------------------------------ correos a estudiantes (0013)
export interface MailStatus {
  enabled: boolean
  configured: boolean
  pending: number
  sent_today: number
  last_sent: string | null
  last_error: string | null
  students: number
  with_email: number
}

export function useMailStatus() {
  return useQuery({
    queryKey: ['mail-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mail_status')
      if (error) throw new Error(friendlyError(error.message))
      return data as MailStatus
    },
    refetchInterval: 60_000,
  })
}

export async function setMailEnabled(on: boolean) {
  const { data, error } = await supabase.rpc('mail_set', { p_enabled: on })
  if (error) throw new Error(friendlyError(error.message))
  return data as MailStatus
}

/** Pide al script de Google que envíe ya lo pendiente (p. ej. justo después de lanzar una tarea). */
export async function mailNow(): Promise<{ ok: boolean; sent?: number; quota?: number; enabled?: boolean; error?: string; message?: string }> {
  const { data } = await supabase.from('teacher_settings').select('sheets_webapp_url, sheets_token, mail_enabled').maybeSingle()
  const s = data as (SheetsSettings & { mail_enabled?: boolean }) | null
  if (!s?.sheets_webapp_url || !s.sheets_token || !s.mail_enabled) return { ok: false, error: 'off' }
  return post(s.sheets_webapp_url, { token: s.sheets_token, action: 'mail_now' }) as Promise<{ ok: boolean; sent?: number }>
}

export const studentEmailNeeded = async (token: string) => {
  const { data, error } = await supabase.rpc('student_email_needed', { p_token: token })
  return !error && data === true
}
export const studentSetEmail = async (token: string, email: string) => {
  const { data, error } = await supabase.rpc('student_set_email', { p_token: token, p_email: email })
  if (error) return { ok: false, error: 'network' }
  return data as { ok: boolean; error?: string }
}
