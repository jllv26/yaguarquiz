import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BRAND } from '../../lib/brand'
import { JAGUAR } from './assets'

/** Momento del rugido en el video (s): aparece el título. */
const ROAR_AT = 4.2
/** Si el video no empieza en este tiempo (internet muy lento), se salta la entrada. */
const START_TIMEOUT = 8000

/** Solo para pruebas automáticas: con sessionStorage "yq-no-intro" = "1" no se muestra la entrada. */
const SKIP_KEY = 'yq-no-intro'
let shownThisLoad = false
/** La entrada se ve cada vez que se abre o recarga la página (no al moverse entre pantallas). */
export function introPending() {
  if (shownThisLoad) return false
  try {
    return sessionStorage.getItem(SKIP_KEY) !== '1'
  } catch {
    return true
  }
}
export function markIntroSeen() {
  shownThisLoad = true
}

/**
 * Entrada al sistema: video real de un jaguar que sale de la selva y ruge (~7 s, sin audio).
 * Se puede saltar con el botón o con Escape. Solo se omite con el "ahorro de datos" activado.
 * Con "reducir movimiento" (animaciones apagadas en Windows, común en laboratorios) el video
 * se muestra igual, pero el título aparece sin rebote ni zoom.
 */
export function JaguarIntro({ onDone, onLanded }: { onDone?: () => void; onLanded?: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(true)
  const [title, setTitle] = useState(false)
  const done = useRef(false)

  const skip =
    typeof window !== 'undefined' &&
    (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData === true
  const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const finish = () => {
    if (done.current) return
    done.current = true
    markIntroSeen()
    setOpen(false)
    onLanded?.()
    window.setTimeout(() => onDone?.(), 450)
  }

  useEffect(() => {
    if (skip) {
      markIntroSeen()
      onDone?.()
      return
    }
    const v = video.current
    let started = false
    const t = window.setTimeout(() => !started && finish(), START_TIMEOUT)
    const onPlay = () => (started = true)
    const onTime = () => v && v.currentTime >= ROAR_AT && setTitle(true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish()
    v?.addEventListener('playing', onPlay)
    v?.addEventListener('timeupdate', onTime)
    window.addEventListener('keydown', onKey)
    // Si el navegador bloquea el video (p. ej. iPhone en ahorro de batería): título sobre la imagen y sigue
    let blocked = false
    const tryPlay = () =>
      v?.play().catch((e: unknown) => {
        if (blocked || started || (e as { name?: string })?.name !== 'NotAllowedError') return
        blocked = true
        setTitle(true)
        window.setTimeout(finish, 2600)
      })
    v?.addEventListener('canplay', tryPlay, { once: true })
    tryPlay()
    return () => {
      window.clearTimeout(t)
      v?.removeEventListener('playing', onPlay)
      v?.removeEventListener('timeupdate', onTime)
      v?.removeEventListener('canplay', tryPlay)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (skip) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          exit={calm ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45 }}
          role="dialog"
          aria-label="Entrada de YaguarQuiz"
        >
          <video
            ref={video}
            src={JAGUAR.video}
            poster={JAGUAR.poster}
            muted
            playsInline
            autoPlay
            preload="auto"
            onEnded={finish}
            onError={finish}
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden
          />
          {/* viñeta para que se lea el texto */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,.65))]" />

          <AnimatePresence>
            {title && (
              <motion.div
                className="absolute inset-x-0 bottom-[12%] flex flex-col items-center text-center"
                initial={calm ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.9 }}
                animate={calm ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={calm ? { duration: 0.4 } : { type: 'spring', stiffness: 200, damping: 16 }}
              >
                <p className="font-display text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,.8)] sm:text-7xl">
                  Yaguar<span className="text-[#FFD34D]">Quiz</span>
                </p>
                <p className="mt-2 font-display text-lg font-bold uppercase tracking-[0.3em] text-[#FFD34D] drop-shadow sm:text-2xl">
                  {BRAND.slogan}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={finish}
            className="absolute right-4 top-4 rounded-full bg-black/55 px-5 py-2.5 font-display text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-black/75 sm:right-6 sm:top-6 sm:text-base"
            autoFocus
          >
            Saltar ›
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
