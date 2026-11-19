import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Mail, Send, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { mailNow, setMailEnabled, useMailStatus } from '../../lib/sheets'

/** Correos automáticos a los estudiantes: aviso de cada tarea y nota de cada actividad (desde el Gmail del docente). */
export function MailCard() {
  const st = useMailStatus()
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<'toggle' | 'send' | null>(null)
  const s = st.data

  async function toggle() {
    if (!s) return
    setBusy('toggle')
    try {
      const r = await setMailEnabled(!s.enabled)
      qc.setQueryData(['mail-status'], r)
      toast.success(r.enabled ? 'Correos activados' : 'Correos desactivados')
    } catch (e) {
      toast.error('No se pudo cambiar', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function send() {
    setBusy('send')
    const r = await mailNow()
    setBusy(null)
    void qc.invalidateQueries({ queryKey: ['mail-status'] })
    if (r.ok) toast.success('Listo', r.sent ? `Se enviaron ${r.sent} correo(s).` : 'No había correos pendientes.')
    else toast.error('No se pudo enviar', r.message ?? 'Revise la conexión con Google (paso 2).')
  }

  return (
    <SolidCard className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-uap-blue text-white">
          <Mail className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">Correos a los estudiantes</h2>
          <p className="text-sm text-ink-soft">Acceso al sistema (enlace y RU), aviso de cada tarea que lance y la nota de cada actividad, desde su Gmail.</p>
        </div>
        {s && (
          <Button variant={s.enabled ? 'secondary' : 'success'} disabled={busy !== null} onClick={() => void toggle()}>
            {busy === 'toggle' ? <Loader2 className="size-4 animate-spin" /> : null}
            {s.enabled ? 'Desactivar' : 'Activar correos'}
          </Button>
        )}
      </div>

      {st.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : st.isError || !s ? (
        <p className="text-sm text-uap-red">Falta actualizar la base de datos (migración 0013).</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Estado" value={s.enabled ? 'Activados' : 'Apagados'} ok={s.enabled} />
            <Stat label="Estudiantes con correo" value={`${s.with_email} de ${s.students}`} ok={s.with_email > 0} />
            <Stat label="En cola" value={String(s.pending)} />
            <Stat label="Enviados hoy" value={String(s.sent_today)} />
          </dl>
          {s.last_error && (
            <p className="flex items-start gap-2 rounded-2xl bg-uap-red/10 p-3 text-sm text-uap-red">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Último error de Gmail: {s.last_error}
            </p>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>
              Correos de los estudiantes: cárguelos en <b>Estudiantes</b> (columna «correo»). Si alguno no tiene, YaguarQuiz se lo pide la primera vez que entra.
            </li>
            <li className={s.configured ? '' : 'font-semibold text-ink'}>
              {s.configured ? (
                <span className="inline-flex items-center gap-1 text-uap-green">
                  <CheckCircle2 className="size-4" /> Conexión con Google guardada (tarjeta de abajo).
                </span>
              ) : (
                'Conecte su script de Google (tarjeta «Google Sheets», abajo).'
              )}
            </li>
            <li>
              En el editor de su script, elija la función <b>activarCorreos</b> y presione <b>▶ Ejecutar</b> una vez: Google pide permiso para enviar correos desde su Gmail y desde ahí envía cada 5 minutos.
            </li>
            <li>
              El correo de <b>acceso</b> (enlace, RU y cómo entrar) se envía desde la lista de cada asignatura: <b>Asignaturas → Estudiantes → Enviar acceso por correo</b>.
            </li>
            <li>Gmail gratuito permite unos 100 correos por día: cada estudiante recibe un solo correo con todo lo nuevo; lo que no alcanza sale al día siguiente.</li>
          </ol>
          <div>
            <Button size="sm" variant="ghost" disabled={busy !== null || !s.enabled || !s.configured} onClick={() => void send()}>
              {busy === 'send' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar ahora lo pendiente
            </Button>
          </div>
        </>
      )}
    </SolidCard>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-2xl bg-ink/5 p-3">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className={`font-display text-lg font-black ${ok === true ? 'text-uap-green' : ok === false ? 'text-ink-soft' : ''}`}>{value}</dd>
    </div>
  )
}
