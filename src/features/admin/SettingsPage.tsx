import { SheetsCard } from './SheetsCard'
import { CheckCircle2, Clock, Construction, KeyRound, ShieldCheck, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SolidCard } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { friendlyError, supabase } from '../../lib/supabase'
import { useAuth, type Teacher } from '../auth/AuthProvider'

export function SettingsPage() {
  const { teacher } = useAuth()
  const isAdmin = teacher?.role === 'admin'
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-black text-uap-blue dark:text-white">Configuración</h1>
        <p className="text-ink-soft">Cuenta, conexión con Google Sheets y docentes.</p>
      </header>
      <SolidCard>
        <h2 className="mb-3 font-display text-xl font-bold">Mi cuenta</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Info label="Nombre" value={teacher?.full_name || '—'} />
          <Info label="Correo" value={teacher?.email || '—'} />
          <Info label="Rol" value={isAdmin ? 'Administrador' : 'Docente'} />
        </dl>
      </SolidCard>
      <PasswordCard />
      <SheetsCard />
      {isAdmin && <TeachersAdmin />}
    </div>
  )
}

function PasswordCard() {
  const { updatePassword, needsPassword } = useAuth()
  const toast = useToast()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (p1.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (p1 !== p2) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const err = await updatePassword(p1)
    setBusy(false)
    if (err) return setError(err)
    setP1('')
    setP2('')
    toast.success('Contraseña guardada', 'Desde ahora puedes ingresar con tu correo y esta contraseña.')
  }

  return (
    <SolidCard className={needsPassword ? 'ring-4 ring-uap-gold/60' : ''}>
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold">
        <KeyRound className="size-5 text-uap-gold" /> {needsPassword ? 'Crea tu contraseña' : 'Cambiar contraseña'}
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        {needsPassword
          ? '¡Bienvenido! Tu cuenta ya está creada. Elige una contraseña para ingresar las próximas veces.'
          : 'Usa al menos 8 caracteres. También puedes ingresar con un enlace enviado a tu correo.'}
      </p>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
        <Input label="Nueva contraseña" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
        <Input label="Repítela" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
        <Button type="submit" variant="success" disabled={busy}>
          Guardar
        </Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-uap-red dark:text-game-coral">{error}</p>}
    </SolidCard>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}

function TeachersAdmin() {
  const toast = useToast()
  const { teacher: me } = useAuth()
  const [list, setList] = useState<Teacher[]>([])

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('teachers')
      .select('id, full_name, email, photo_url, role, approved')
      .order('created_at')
    if (error) toast.error('No se pudo cargar la lista', friendlyError(error.message))
    else setList(data as Teacher[])
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function setApproved(t: Teacher, approved: boolean) {
    const { error } = await supabase.from('teachers').update({ approved }).eq('id', t.id)
    if (error) return toast.error('No se pudo actualizar', friendlyError(error.message))
    toast.success(approved ? 'Docente aprobado' : 'Acceso retirado', t.email)
    void load()
  }

  return (
    <SolidCard>
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold">
        <ShieldCheck className="size-5 text-uap-green dark:text-game-selva" /> Docentes
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        Las cuentas nuevas quedan pendientes hasta que las apruebes. Cada docente solo ve sus propios datos.
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
            {t.approved ? (
              <CheckCircle2 className="size-5 text-uap-green dark:text-game-selva" />
            ) : (
              <Clock className="size-5 text-uap-gold" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{t.full_name || 'Sin nombre'}</p>
              <p className="truncate text-sm text-ink-soft">
                {t.email} · {t.role === 'admin' ? 'Administrador' : 'Docente'}
              </p>
            </div>
            {t.id !== me?.id &&
              (t.approved ? (
                <Button size="sm" variant="secondary" onClick={() => void setApproved(t, false)}>
                  Retirar acceso
                </Button>
              ) : (
                <Button size="sm" variant="success" onClick={() => void setApproved(t, true)}>
                  <UserCheck className="size-4" /> Aprobar
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </SolidCard>
  )
}

export function ComingSoon({ phase, title }: { phase: number; title: string }) {
  return (
    <SolidCard className="mx-auto mt-10 max-w-lg text-center">
      <Construction className="mx-auto mb-3 size-12 text-uap-gold" />
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-ink-soft">Este módulo se construye en la Fase {phase}.</p>
    </SolidCard>
  )
}
