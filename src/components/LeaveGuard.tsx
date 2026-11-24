import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reportFocus } from '../lib/api/exam'
import { haptic, sfx } from '../lib/sound'
import { useConfirm } from './ui/Confirm'

type FocusResult = { ok: boolean; locked?: boolean; focus_losses?: number }

/**
 * Protege un intento en curso (actividad o examen):
 *  - antes de salir (atrás del celular, un enlace, cerrar o recargar la pestaña) pregunta si de verdad quiere salir;
 *  - si cambia de pestaña o de app, la salida queda registrada y al volver ve un aviso de que puede ser penalizado;
 *  - en la PC, cuando el mouse se va hacia las pestañas, avisa antes de que salga.
 */
export function LeaveGuard({
  token,
  active,
  what = 'la actividad',
  lockAfter,
  timed,
  onReport,
}: {
  token: string
  active: boolean
  /** «la actividad» o «el examen» */
  what?: string
  lockAfter?: number | null
  /** el tiempo sigue corriendo aunque salga */
  timed?: boolean
  onReport?: (r: FocusResult) => void
}) {
  const confirm = useConfirm()
  const [back, setBack] = useState<number | null>(null)
  const [edge, setEdge] = useState(false)
  const activeRef = useRef(active)
  const reportRef = useRef(onReport)
  useEffect(() => {
    activeRef.current = active
    reportRef.current = onReport
  })

  // ---- salir de la ventana: cambiar de pestaña o de app
  useEffect(() => {
    if (!active) return
    let away = false
    let promptAt = 0
    let count = 0
    const lose = (e?: Event) => {
      if (away || !activeRef.current) return
      // jugar dentro de un video (iframe de YouTube) no es salir
      if (e?.type === 'blur' && document.activeElement instanceof HTMLIFrameElement) return
      // el aviso del navegador al cerrar o recargar tampoco (si se queda, no salió)
      if (Date.now() - promptAt < 3000) return
      away = true
      void reportFocus(token, 'tab').then((r) => {
        count = r.focus_losses ?? count + 1
        reportRef.current?.(r)
      })
    }
    const comeBack = () => {
      if (!away || document.visibilityState !== 'visible') return
      away = false
      sfx.warning()
      haptic([80, 60, 80])
      setBack(Math.max(count, 1))
    }
    const onVis = () => (document.visibilityState === 'hidden' ? lose() : comeBack())
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return
      promptAt = Date.now()
      e.preventDefault()
      e.returnValue = '' // el navegador muestra su propio «¿Salir del sitio?»
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', lose)
    window.addEventListener('focus', comeBack)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', lose)
      window.removeEventListener('focus', comeBack)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [active, token])

  // ---- salir con el botón «atrás» o con un enlace de la página
  useEffect(() => {
    if (!active) return
    let leaving = false
    const ask = async () => {
      sfx.warning()
      haptic(60)
      const ok = await confirm({
        title: `¿Salir de ${what}?`,
        message: (
          <span className="flex flex-col gap-2">
            <span>
              Tu avance queda guardado, pero <b>la salida queda registrada</b> y tu docente la ve. Salir de la ventana <b>puede ser penalizado</b>.
            </span>
            {timed && <span className="font-semibold text-uap-red">El tiempo sigue corriendo aunque salgas.</span>}
          </span>
        ),
        confirmText: 'Sí, salir',
        danger: true,
      })
      if (ok) {
        leaving = true
        void reportFocus(token, 'tab').then((r) => reportRef.current?.(r))
      }
      return ok
    }
    // atrás del celular o del navegador: se agrega un paso extra al historial para poder preguntar
    window.history.pushState(window.history.state, '', window.location.href)
    const onPop = () => {
      if (leaving || !activeRef.current) return
      window.history.pushState(window.history.state, '', window.location.href)
      void ask().then((ok) => ok && window.history.go(-2))
    }
    // enlaces (logo, «Volver»…): se detienen antes de que los vea el router
    const onClick = (e: MouseEvent) => {
      if (leaving || !activeRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.href === window.location.href) return
      e.preventDefault()
      e.stopPropagation()
      void ask().then((ok) => ok && (window.location.href = a.href))
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('click', onClick, true)
    }
  }, [active, confirm, what, timed, token])

  // ---- PC: el mouse se va hacia las pestañas o la barra del navegador
  useEffect(() => {
    if (!active || !window.matchMedia?.('(pointer: fine)').matches) return
    let t = 0
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 8) return
      setEdge(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setEdge(false), 3500)
    }
    document.addEventListener('mouseout', onOut)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mouseout', onOut)
    }
  }, [active])

  return createPortal(
    <>
      <AnimatePresence>
        {edge && active && back === null && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="pointer-events-none fixed inset-x-0 top-2 z-[90] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-2xl bg-[#e8590c] px-4 py-2.5 font-semibold text-white shadow-2xl"
            role="status"
          >
            <AlertTriangle className="size-5 shrink-0" /> ¿Te vas? Si sales de esta ventana queda registrado y puede ser penalizado.
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {back !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="leave-title">
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0, x: [0, -10, 9, -6, 4, 0] }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="w-full max-w-md rounded-3xl bg-surface p-6 text-center shadow-2xl ring-4 ring-[#e8590c]"
            >
              <motion.span animate={{ rotate: [0, -10, 10, -6, 0] }} transition={{ duration: 0.8, repeat: 2 }} className="mx-auto grid size-16 place-items-center rounded-full bg-[#e8590c] text-white">
                <LogOut className="size-8" />
              </motion.span>
              <h2 id="leave-title" className="mt-3 font-display text-2xl font-black">
                Saliste de {what}
              </h2>
              <p className="mt-2 text-ink-soft">
                Es tu salida número <b className="text-ink">{back}</b>. Quedó registrada y tu docente la ve.
              </p>
              <p className="mt-2 rounded-2xl bg-uap-red/10 px-3 py-2 font-semibold text-uap-red">
                Salir de la ventana puede ser penalizado.
                {lockAfter ? ` A las ${lockAfter} salidas se bloquea.` : ''}
                {timed ? ' El tiempo siguió corriendo.' : ''}
              </p>
              <button type="button" autoFocus onClick={() => setBack(null)} className="mt-5 w-full rounded-2xl bg-uap-green py-3 font-display text-lg font-black text-white shadow hover:brightness-110">
                Entendido, sigo aquí
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}
