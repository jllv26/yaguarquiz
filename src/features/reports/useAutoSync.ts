import { useEffect, useRef } from 'react'
import { useToast } from '../../components/ui/Toast'
import { syncSession, useSheetsSettings } from '../../lib/sheets'

/**
 * Envía los resultados a Google Sheets una sola vez cuando la sesión termina (si está configurado).
 * Reenviar es seguro (el script no duplica filas); el registro local solo evita envíos repetidos.
 */
export function useAutoSync(sessionId: string, done: boolean, alreadySynced = false, onDone?: () => void) {
  const settings = useSheetsSettings()
  const toast = useToast()
  const ran = useRef(false)
  useEffect(() => {
    const s = settings.data
    if (!done || ran.current || alreadySynced || !s?.sheets_webapp_url || !s.sheets_token) return
    const key = `yq-synced-${sessionId}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      /* sin almacenamiento */
    }
    ran.current = true
    void syncSession(sessionId, s).then((r) => {
      if (r.ok) {
        try {
          localStorage.setItem(key, '1')
        } catch {
          /* sin almacenamiento */
        }
        toast.success('Resultados enviados a Google Sheets')
      } else toast.error('No se pudo enviar a Google Sheets', `${r.message ?? ''} Puede reintentar desde Reportes.`)
      onDone?.()
    })
  }, [done, alreadySynced, sessionId, settings.data, toast, onDone])
}
