import { useCallback, useEffect, useRef, useState } from 'react'
import { botRpc, type HostState } from '../../lib/api/live'
import { randomAvatar } from '../../lib/avatars'
import type { StudentResponse } from '../../lib/scoring'

const NAMES = ['Yaguar', 'Paraba', 'Bufeo', 'Peta', 'Londra', 'Harpía', 'Tapir', 'Tucán', 'Capibara', 'Mapache', 'Puma', 'Caimán', 'Tatú', 'Jochi', 'Anta']

/**
 * Simulador de estudiantes (solo sesiones con apodo): sirve para ensayar la clase
 * desde el proyector sin necesitar celulares. Los bots responden al azar.
 */
export function useBots(state: HostState | null) {
  const tokens = useRef<string[]>([])
  const answeredFor = useRef<string>('')
  const [count, setCount] = useState(0)
  const pin = state?.session.pin
  const phase = state?.session.phase
  const question = state?.question
  const qid = question?.id

  const add = useCallback(
    async (n: number) => {
      if (!pin) return
      const start = tokens.current.length
      const res = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          botRpc<{ ok: boolean; token?: string }>('join_session', {
            p_pin: pin,
            p_code: null,
            p_ci: null,
            p_nickname: `🤖 ${NAMES[(start + i) % NAMES.length]} ${start + i + 1}`,
            p_avatar: randomAvatar(),
            p_device: `bot-${pin}-${start + i}`,
          }).catch(() => ({ ok: false, token: undefined })),
        ),
      )
      for (const r of res) if (r.ok && r.token) tokens.current.push(r.token)
      setCount(tokens.current.length)
    },
    [pin],
  )

  useEffect(() => {
    if (phase !== 'question' || !question || !qid || answeredFor.current === qid || !tokens.current.length) return
    answeredFor.current = qid
    const limit = question.time_limit_sec * 1000
    const timers = tokens.current.map((t) => {
      if (Math.random() < 0.1) return 0 // algunos no responden
      const delay = 800 + Math.random() * Math.min(limit * 0.7, 12000)
      return window.setTimeout(() => {
        void botRpc('submit_answer', { p_token: t, p_question: qid, p_response: randomResponse(question) }).catch(() => null)
      }, delay)
    })
    return () => timers.forEach((x) => x && clearTimeout(x))
  }, [phase, qid, question])

  return { count, add }
}

function randomResponse(q: NonNullable<HostState['question']>): StudentResponse {
  const opts = q.options
  const good = Math.random() < 0.6
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
  switch (q.type) {
    case 'multiple': {
      const keys = opts.filter((o) => (good ? o.is_correct : Math.random() < 0.5)).map((o) => o.key)
      return { kind: 'choices', keys: keys.length ? keys : [opts[0].key] }
    }
    case 'short_text':
      return { kind: 'text', text: good && q.accepted_answers?.length ? q.accepted_answers[0] : 'no sé' }
    case 'ordering': {
      const ok = [...opts].sort((a, b) => (a.correct_position ?? 0) - (b.correct_position ?? 0)).map((o) => o.key)
      return { kind: 'order', keys: good ? ok : [...ok].sort(() => Math.random() - 0.5) }
    }
    default: {
      const correct = opts.filter((o) => o.is_correct)
      return { kind: 'choice', key: (good && correct.length ? pick(correct) : pick(opts)).key }
    }
  }
}
