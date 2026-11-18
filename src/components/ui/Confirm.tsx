import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

/** Diálogo de confirmación propio (reemplaza window.confirm). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(undefined)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (v: boolean) => {
    resolver.current?.(v)
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {opts?.confirmText ?? 'Aceptar'}
            </Button>
          </>
        }
      >
        <div className="text-ink-soft">{opts?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}
