import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, Plug, Sheet, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { isWebAppUrl, newToken, pingSheets, saveSheetsSettings, useSheetsSettings } from '../../lib/sheets'
import { useAuth } from '../auth/AuthProvider'

const CODE_URL = 'https://github.com/jllv26/yaguarquiz/blob/main/google-apps-script/Code.gs'

/** Conexión con Google Sheets (Apps Script del docente). */
export function SheetsCard() {
  const { teacher } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const settings = useSheetsSettings()
  const [url, setUrl] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'ping' | null>(null)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const curUrl = url ?? settings.data?.sheets_webapp_url ?? ''
  const curToken = token ?? settings.data?.sheets_token ?? ''
  const dirty = url !== null || token !== null

  async function save() {
    if (!teacher) return
    if (curUrl && !isWebAppUrl(curUrl)) return toast.error('La URL no es de Apps Script', 'Debe empezar con https://script.google.com/macros/s/…')
    setBusy('save')
    try {
      await saveSheetsSettings(teacher.id, { sheets_webapp_url: curUrl.trim() || null, sheets_token: curToken || null })
      setUrl(null)
      setToken(null)
      await qc.invalidateQueries({ queryKey: ['sheets-settings'] })
      toast.success('Conexión guardada')
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function ping() {
    setBusy('ping')
    setTest(null)
    try {
      const r = await pingSheets({ sheets_webapp_url: curUrl.trim(), sheets_token: curToken })
      setTest(
        r.ok
          ? { ok: true, text: `Conectado con la hoja “${'name' in r ? r.name : ''}”.` }
          : { ok: false, text: 'error' in r && r.error === 'token' ? 'El token del script no coincide con este. Péguelo de nuevo en Code.gs y vuelva a implementar.' : (r.message ?? 'No se pudo conectar.') },
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <SolidCard className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Sheet className="mt-1 size-8 shrink-0 text-uap-green" />
        <div>
          <h2 className="font-display text-xl font-bold">Google Sheets</h2>
          <p className="text-sm text-ink-soft">
            Al terminar cada sesión, los resultados se copian a su hoja de Google: <strong>Resumen_Sesiones</strong>, <strong>Notas_SIGLA_PARALELO</strong> (libreta),{' '}
            <strong>Detalle_Respuestas</strong> y <strong>Analisis_Preguntas</strong>. Reenviar no duplica filas.
          </p>
        </div>
      </div>

      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          Cree una hoja nueva en Google Sheets (con su cuenta de Gmail) y abra <strong>Extensiones → Apps Script</strong>.
        </li>
        <li>
          Borre lo que haya y pegue el contenido de{' '}
          <a className="font-semibold text-uap-blue underline dark:text-game-electric" href={CODE_URL} target="_blank" rel="noreferrer">
            Code.gs <ExternalLink className="inline size-3.5" />
          </a>
          .
        </li>
        <li>
          Genere un token aquí abajo, cópielo y péguelo en la línea <code className="rounded bg-ink/10 px-1">const TOKEN = '…'</code> del script.
        </li>
        <li>
          <strong>Implementar → Nueva implementación → Aplicación web</strong>, “Ejecutar como: Yo”, “Quién tiene acceso: Cualquier persona”. Autorice y copie la URL.
        </li>
        <li>Pegue la URL aquí, guarde y presione “Probar conexión”.</li>
      </ol>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Input label="URL de la aplicación web" value={curUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
        <div className="flex items-end">
          <Button variant="secondary" onClick={() => void ping()} disabled={!curUrl || !curToken || busy !== null}>
            {busy === 'ping' ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Probar conexión
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-72 flex-1">
          <Input label="Token secreto" value={curToken} readOnly placeholder="Genere un token" className="font-mono" />
        </div>
        <Button variant="secondary" onClick={() => setToken(newToken())}>
          <KeyRound className="size-4" /> {curToken ? 'Generar otro' : 'Generar token'}
        </Button>
        <Button
          variant="secondary"
          disabled={!curToken}
          onClick={() =>
            void navigator.clipboard
              .writeText(curToken)
              .then(() => toast.success('Token copiado'))
              .catch(() => toast.error('No se pudo copiar'))
          }
        >
          <Copy className="size-4" /> Copiar
        </Button>
      </div>
      {test && (
        <p className={test.ok ? 'flex items-center gap-2 font-semibold text-uap-green dark:text-game-selva' : 'flex items-center gap-2 font-semibold text-uap-red dark:text-game-coral'}>
          {test.ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />} {test.text}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={!dirty || busy !== null}>
          {busy === 'save' && <Loader2 className="size-4 animate-spin" />} Guardar conexión
        </Button>
      </div>
    </SolidCard>
  )
}
