import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config'
import type { StudentResponse } from '../scoring'
import { friendlyError, supabase } from '../supabase'

// ---------------------------------------------------------------- tipos
export type Phase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'leaderboard' | 'finished'
export type QType = 'single' | 'multiple' | 'true_false' | 'short_text' | 'ordering' | 'image_choice'
export interface Avatar {
  animal?: string
  color?: string
}
export interface LeaderRow {
  id: string
  nickname: string
  avatar: Avatar
  score: number
  streak: number
  correct_count: number
  rank: number
}
export interface HostOption {
  key: string
  text: string
  image_url: string | null
  is_correct: boolean
  correct_position: number | null
}
export interface HostParticipant {
  id: string
  nickname: string
  avatar: Avatar
  score: number
  streak: number
  correct_count: number
  connected: boolean
  kicked: boolean
  takeover_pending: boolean
  tab_switch_count: number
  student_id: string | null
  paste_count: number
  max_streak: number
  code: string | null
  full_name: string | null
  grade: number | null
  answered: boolean
}
export interface HostState {
  server_now: string
  session: {
    id: string
    pin: string
    status: string
    phase: Phase
    mode: string
    question_index: number | null
    total: number
    phase_started_at: string
    question_started_at: string | null
    question_ends_at: string | null
    paused_at: string | null
    identification: 'roster' | 'nickname'
    require_ci: boolean
    show_ranking: boolean
    allow_late_join: boolean
    quiz_title: string
    subject: { id: string; code: string; parallel: string; name: string; theme_color: string | null }
    created_at: string
  }
  question: {
    id: string
    type: QType
    prompt: string
    image_url: string | null
    time_limit_sec: number
    base_points: number
    explanation: string | null
    accepted_answers: string[] | null
    options: HostOption[]
  } | null
  answered: number
  distribution: { by_option: Record<string, number>; correct: number; partial: number; wrong: number } | null
  participants: HostParticipant[]
  absent: string[]
  leaderboard: LeaderRow[]
}

export interface PlayState {
  ok: true
  server_now: string
  session: {
    id: string
    phase: Phase
    status: string
    question_index: number | null
    total: number
    phase_started_at: string
    question_started_at: string | null
    question_ends_at: string | null
    paused: boolean
    show_ranking: boolean
    quiz_title: string
  }
  me: { id: string; nickname: string; avatar: Avatar; score: number; streak: number; rank: number; of: number; correct_count: number }
  question?: {
    id: string
    type: QType
    prompt: string
    image_url: string | null
    time_limit_sec: number
    base_points: number
    options: { key: string; text: string; image_url: string | null }[]
  }
  my_answer?: { answered: boolean; response?: StudentResponse; correct?: boolean; partial?: number; points?: number }
  reveal?: { correct_keys: string[]; correct_order: string[] | null; accepted_answers: string[] | null; explanation: string | null }
  leaderboard?: LeaderRow[]
  summary?: { rank: number; of: number; score: number; correct: number; questions: number; max_streak: number; grade: number | null; fastest: boolean }
}
export type PlayError = { ok: false; error: string }

export interface SessionSettings {
  identification: 'roster' | 'nickname'
  require_ci: boolean
  show_ranking: boolean
  allow_late_join: boolean
  grading_item_id?: string | null
}

// ---------------------------------------------------------------- helpers
async function rpc<T>(fn: string, args: Record<string, unknown>, client = supabase): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

/** Mensajes en español para los errores que devuelve el servidor al estudiante. */
export const PLAY_ERRORS: Record<string, string> = {
  pin: 'No encontramos ese PIN. Revisa los 6 números del proyector.',
  finished: 'Esta sesión ya terminó.',
  not_open: 'La sesión todavía no está abierta.',
  started: 'La sesión ya empezó y el docente no permite entrar tarde.',
  not_enrolled: 'Ese RU no está inscrito en esta asignatura. Revisa el número o avisa al docente.',
  ci: 'Los últimos 3 dígitos del CI no coinciden.',
  other_device: 'Ese RU ya está jugando en otro dispositivo. El docente puede autorizarte desde el proyector.',
  kicked: 'El docente te retiró de esta sesión.',
  nickname_length: 'El apodo debe tener entre 2 y 20 letras.',
  nickname_bad: 'Elige un apodo apropiado.',
  nickname_taken: 'Ese apodo ya está en uso. Prueba otro.',
  token: 'Tu sesión de juego ya no es válida. Vuelve a entrar con el PIN.',
  closed: 'El tiempo terminó.',
  late: 'Se acabó el tiempo.',
  not_current: 'Esa pregunta ya pasó.',
  already: 'Ya habías respondido.',
}

/** Diferencia entre el reloj del servidor y el del dispositivo (ms). */
export function serverOffset(serverNow: string, requestStart: number) {
  const now = Date.now()
  const rtt = now - requestStart
  return new Date(serverNow).getTime() + rtt / 2 - now
}

export function playUrl(pin?: string) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  return pin ? `${base}#/play/${pin}` : base
}

// ---------------------------------------------------------------- docente
export const createSession = (quizId: string, subjectId: string, settings: SessionSettings) =>
  rpc<{ id: string; pin: string }>('create_session', { p_quiz: quizId, p_subject: subjectId, p_settings: settings })
export const hostState = (id: string) => rpc<HostState>('host_state', { p_session: id })
export const hostAdvance = (id: string, from: Phase) => rpc<HostState>('host_advance', { p_session: id, p_from: from })
export const hostPause = (id: string, pause: boolean) => rpc<HostState>('host_pause', { p_session: id, p_pause: pause })
export const hostAddTime = (id: string, seconds: number) => rpc<HostState>('host_add_time', { p_session: id, p_seconds: seconds })
export const hostEnd = (id: string) => rpc<HostState>('host_end', { p_session: id })
export const hostParticipant = (participantId: string, action: 'kick' | 'unkick' | 'authorize_device') =>
  rpc<null>('host_participant', { p_participant: participantId, p_action: action })

export interface SessionListRow {
  id: string
  pin: string
  status: string
  phase: Phase
  mode: string
  created_at: string
  finished_at: string | null
  identification: string
  quizzes: { title: string } | null
  subjects: { code: string; parallel: string; name: string; theme_color: string | null } | null
  participants: { count: number }[]
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, pin, status, phase, mode, created_at, finished_at, identification, quizzes(title), subjects(code, parallel, name, theme_color), participants(count)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(friendlyError(error.message))
      return data as unknown as SessionListRow[]
    },
  })
}

// ---------------------------------------------------------------- estudiante
export const sessionInfo = (pin: string) =>
  rpc<{ ok: true; identification: 'roster' | 'nickname'; require_ci: boolean; quiz_title: string; subject: string; phase: Phase } | PlayError>(
    'session_info',
    { p_pin: pin },
  )
export const lookupStudent = (pin: string, code: string) =>
  rpc<{ ok: true; name: string; require_ci: boolean } | PlayError>('lookup_student', { p_pin: pin, p_code: code })
export const joinSession = (args: { pin: string; code?: string; ci?: string; nickname?: string; avatar: Avatar; device: string }) =>
  rpc<{ ok: true; token: string; nickname: string; rejoined: boolean } | PlayError>('join_session', {
    p_pin: args.pin,
    p_code: args.code ?? null,
    p_ci: args.ci ?? null,
    p_nickname: args.nickname ?? null,
    p_avatar: args.avatar,
    p_device: args.device,
  })
export const getState = (token: string) => rpc<PlayState | PlayError>('get_state', { p_token: token })
export const submitAnswer = (token: string, questionId: string, response: StudentResponse) =>
  rpc<{ ok: true } | PlayError>('submit_answer', { p_token: token, p_question: questionId, p_response: response })
export const reportEvent = (token: string, kind: 'tab' | 'paste') => rpc<null>('report_event', { p_token: token, p_kind: kind }).catch(() => null)

/** Identificador estable del navegador (para reconectar y evitar que otro use tu RU). */
export function deviceId() {
  try {
    let id = localStorage.getItem('yq-device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('yq-device', id)
    }
    return id
  } catch {
    return 'sin-almacenamiento'
  }
}

/** Cliente anónimo aparte (para el simulador de estudiantes del proyector: no usa la sesión del docente). */
let botClient: ReturnType<typeof createClient> | null = null
export function anonClient() {
  botClient ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'yq-bots' },
  })
  return botClient
}
export const botRpc = <T,>(fn: string, args: Record<string, unknown>) => rpc<T>(fn, args, anonClient() as unknown as typeof supabase)

// ---------------------------------------------------------------- tiempo real
/**
 * Canal de avisos: el proyector avisa "cambió algo" y los celulares consultan su estado al instante.
 * El aviso no lleva datos (nada de respuestas): solo despierta la consulta. Si Realtime falla,
 * igual funciona porque cada celular consulta cada pocos segundos.
 */
export function useNudgeChannel(sessionId: string | undefined, onNudge?: () => void) {
  const chan = useRef<RealtimeChannel | null>(null)
  const cb = useRef(onNudge)
  useEffect(() => {
    cb.current = onNudge
  }, [onNudge])
  useEffect(() => {
    if (!sessionId) return
    const c = supabase.channel(`yq:${sessionId}`, { config: { broadcast: { self: false } } })
    c.on('broadcast', { event: 'nudge' }, () => cb.current?.()).subscribe()
    chan.current = c
    return () => {
      chan.current = null
      void supabase.removeChannel(c)
    }
  }, [sessionId])
  return () => {
    void chan.current?.send({ type: 'broadcast', event: 'nudge', payload: {} })
  }
}
