import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { friendlyError, pendingLink, supabase } from '../../lib/supabase'

export interface Teacher {
  id: string
  full_name: string
  email: string
  photo_url: string | null
  role: 'admin' | 'teacher'
  approved: boolean
}

interface AuthState {
  loading: boolean
  session: Session | null
  teacher: Teacher | null
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (fullName: string, email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refreshTeacher: () => Promise<void>
  sendMagicLink: (email: string) => Promise<string | null>
  sendPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  /** El docente entró por invitación o recuperación y debe crear su contraseña */
  needsPassword: boolean
  linkError: string | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(
    pendingLink?.type === 'invite' || pendingLink?.type === 'recovery',
  )
  const [linkError] = useState<string | null>(pendingLink?.error ? friendlyError(pendingLink.error) : null)

  const loadTeacher = useCallback(async (s: Session | null) => {
    if (!s) {
      setTeacher(null)
      return
    }
    const { data } = await supabase
      .from('teachers')
      .select('id, full_name, email, photo_url, role, approved')
      .eq('id', s.user.id)
      .maybeSingle()
    setTeacher((data as Teacher | null) ?? null)
  }, [])

  useEffect(() => {
    let active = true
    const cameFromEmail = new URLSearchParams(window.location.search).has('code')
    const boot = pendingLink?.tokens
      ? supabase.auth.setSession(pendingLink.tokens).then(() => supabase.auth.getSession())
      : supabase.auth.getSession()
    boot.then(async ({ data }) => {
      if (!active) return
      if (cameFromEmail) {
        window.history.replaceState(null, '', `${window.location.pathname}#/admin`)
      }
      setSession(data.session)
      await loadTeacher(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPassword(true)
        window.location.hash = '#/admin/configuracion'
      }
      // diferido para no bloquear el callback de Supabase
      window.setTimeout(() => void loadTeacher(s), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadTeacher])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? friendlyError(error.message) : null
  }, [])

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    })
    if (error) return { error: friendlyError(error.message), needsConfirmation: false }
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setTeacher(null)
  }, [])

  const refreshTeacher = useCallback(() => loadTeacher(session), [loadTeacher, session])

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`

  const sendMagicLink = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      })
      return error ? friendlyError(error.message) : null
    },
    [redirectTo],
  )

  const sendPasswordReset = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      return error ? friendlyError(error.message) : null
    },
    [redirectTo],
  )

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return friendlyError(error.message)
    setNeedsPassword(false)
    return null
  }, [])

  const value = useMemo(
    () => ({
      loading, session, teacher, signIn, signUp, signOut, refreshTeacher,
      sendMagicLink, sendPasswordReset, updatePassword, needsPassword, linkError,
    }),
    [loading, session, teacher, signIn, signUp, signOut, refreshTeacher,
      sendMagicLink, sendPasswordReset, updatePassword, needsPassword, linkError],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
