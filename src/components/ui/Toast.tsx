import { sfx } from '../../lib/sound'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  title: string
  message?: string
}

interface ToastApi {
  show: (kind: Kind, title: string, message?: string, quiet?: boolean) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string, quiet?: boolean) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info }
const COLORS = {
  success: 'border-l-uap-green text-uap-green dark:text-game-selva',
  error: 'border-l-uap-red text-uap-red dark:text-game-coral',
  info: 'border-l-uap-blue text-uap-blue dark:text-game-electric',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const show = useCallback(
    (kind: Kind, title: string, message?: string, quiet?: boolean) => {
      const id = nextId++
      if (!quiet) {
        if (kind === 'error') sfx.wrong()
        else sfx.notify()
      }
      setItems((xs) => [...xs.slice(-3), { id, kind, title, message }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (t, m) => show('success', t, m),
      error: (t, m) => show('error', t, m),
      info: (t, m, q) => show('info', t, m, q),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICONS[t.kind]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className={cn(
                  'glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border-l-4 p-4',
                  COLORS[t.kind],
                )}
                role="status"
              >
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 text-ink">
                  <p className="font-display font-bold">{t.title}</p>
                  {t.message && <p className="text-sm text-ink-soft">{t.message}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded-lg p-1 text-ink-soft hover:bg-ink/5"
                  aria-label="Cerrar notificación"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
