import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { useAuth } from './AuthProvider'

type Mode = 'login' | 'signup'

export function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/admin" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'signup') {
      if (fullName.trim().length < 3) return setError('Escribe tu nombre completo.')
      if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
      if (password !== password2) return setError('Las contraseñas no coinciden.')
    }
    setBusy(true)
    const err = mode === 'login' ? await signIn(email, password) : await signUp(fullName, email, password)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    toast.success(mode === 'login' ? '¡Bienvenido!' : '¡Cuenta creada!', mode === 'signup' ? 'Ya puedes usar tu panel.' : undefined)
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-8">
        <Card className="relative w-full overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-uap-blue via-uap-green to-uap-gold" />
          <img src={BRAND.logoColor} alt="" className="mx-auto mb-3 w-16 drop-shadow-lg" />
          <h1 className="text-center font-display text-3xl font-extrabold">Panel docente</h1>
          <p className="mt-1 text-center text-ink-soft">
            {BRAND.appName} · {BRAND.institution}
          </p>

          {/* Pestañas */}
          <div className="mt-6 grid grid-cols-2 rounded-2xl bg-ink/5 p-1" role="tablist">
            {(
              [
                ['login', 'Ingresar', LogIn],
                ['signup', 'Crear cuenta', UserPlus],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={cn(
                  'relative flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors',
                  mode === m ? 'text-ink' : 'text-ink-soft hover:text-ink',
                )}
              >
                {mode === m && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-xl bg-surface-2 shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative size-4" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <Input
                    label="Nombre completo"
                    placeholder="Ej. Ing. Jimmy Luis Laruta Villarreal"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Correo electrónico"
              type="email"
              placeholder="tucorreo@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <div className="relative">
              <Input
                label="Contraseña"
                type={showPass ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-[38px] rounded-lg p-1.5 text-ink-soft hover:bg-ink/5"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>

            {mode === 'signup' && (
              <Input
                label="Repite la contraseña"
                type={showPass ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            )}

            {error && (
              <p role="alert" className="rounded-2xl bg-uap-red/10 px-4 py-3 text-sm font-medium text-uap-red dark:text-game-coral">
                {error}
              </p>
            )}

            <Button type="submit" variant={mode === 'login' ? 'primary' : 'success'} size="lg" block disabled={busy}>
              {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear mi cuenta'}
            </Button>

            {mode === 'signup' && (
              <p className="text-center text-xs text-ink-soft">
                La primera cuenta creada será la del <strong>administrador</strong>. Las siguientes cuentas de docentes
                necesitarán su aprobación.
              </p>
            )}
          </form>

          <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Card>
      </main>
    </div>
  )
}
