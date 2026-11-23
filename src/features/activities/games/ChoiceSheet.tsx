import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../../lib/cn'

export interface Choice {
  key: string
  label: ReactNode
  /** color de fondo (grupos); sin color = botón claro */
  color?: string
  image_url?: string | null
  disabled?: boolean
}

/**
 * Ventana para elegir: aparece sola cuando el estudiante toca algo (tarjeta, concepto, espacio, punto).
 * En el celular sale desde abajo; en la PC, al centro. Siempre se ve sin tener que bajar la pantalla.
 */
export function ChoiceSheet({
  open,
  title,
  subject,
  choices,
  onChoose,
  onClose,
  cols = 1,
  busy,
  children,
  footer,
}: {
  open: boolean
  title: string
  /** lo que se está ubicando (texto de la tarjeta, del concepto…) */
  subject?: ReactNode
  choices?: Choice[]
  onChoose?: (key: string) => void
  onClose: () => void
  cols?: number
  busy?: boolean
  /** contenido propio (por ejemplo, un campo para escribir) */
  children?: ReactNode
  footer?: ReactNode
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const t = setTimeout(() => first.current?.focus({ preventScroll: true }), 120)
    return () => {
      window.removeEventListener('keydown', k)
      clearTimeout(t)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
          >
            <span className="mx-auto mt-2 block h-1.5 w-12 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
            <div className="flex items-start gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pt-5">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-black leading-tight">{title}</p>
                {subject && <div className="mt-2 rounded-2xl bg-uap-gold/15 px-3 py-2 font-display font-bold leading-snug text-ink ring-1 ring-uap-gold/40">{subject}</div>}
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-ink/10" aria-label="Cerrar sin elegir">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
              {choices && (
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {choices.map((c, i) => (
                    <motion.button
                      key={c.key}
                      ref={i === 0 ? first : undefined}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      disabled={busy || c.disabled}
                      onClick={() => onChoose?.(c.key)}
                      className={cn(
                        'flex min-h-12 items-center gap-3 rounded-2xl px-4 py-2.5 text-left font-semibold leading-snug shadow-sm transition disabled:opacity-40',
                        c.color ? 'justify-center text-center font-display font-black text-white hover:brightness-110' : 'border-2 border-line bg-surface-2 hover:border-uap-blue hover:bg-uap-blue/5',
                      )}
                      style={c.color ? { background: c.color } : undefined}
                    >
                      {c.image_url && <img src={c.image_url} alt="" className="size-14 shrink-0 rounded-xl bg-white object-contain" />}
                      <span className="flex-1">{c.label}</span>
                    </motion.button>
                  ))}
                </div>
              )}
              {children}
              {footer}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
