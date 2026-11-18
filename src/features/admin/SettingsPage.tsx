import { CheckCircle2, Clock, Construction, ShieldCheck, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
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
        <p className="text-ink-soft">Cuenta, docentes y conexiones (Google Sheets llega en la Fase 6).</p>
      </header>
      <SolidCard>
        <h2 className="mb-3 font-display text-xl font-bold">Mi cuenta</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Info label="Nombre" value={teacher?.full_name || '—'} />
          <Info label="Correo" value={teacher?.email || '—'} />
          <Info label="Rol" value={isAdmin ? 'Administrador' : 'Docente'} />
        </dl>
      </SolidCard>
      {isAdmin && <TeachersAdmin />}
    </div>
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
