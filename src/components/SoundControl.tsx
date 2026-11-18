import { AnimatePresence, motion } from 'framer-motion'
import { Music, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '../lib/cn'
import { onSoundPrefs, setSoundPrefs, sfx, soundPrefs } from '../lib/sound'

export function useSoundPrefs() {
  return useSyncExternalStore(onSoundPrefs, soundPrefs)
}

/**
 * Botón de sonido siempre visible. Clic = silenciar/activar; flecha = volúmenes.
 * role "host": música + efectos. role "student": efectos + opción de música en este equipo.
 */
export function SoundControl({ role, className }: { role: 'host' | 'student'; className?: string }) {
  const p = useSoundPrefs()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className={cn('relative', className)}>
      <div className="flex h-11 overflow-hidden rounded-2xl bg-surface-2 shadow-sm">
        <button
          type="button"
          onClick={() => setSoundPrefs({ muted: !p.muted })}
          className="grid w-11 place-items-center"
          aria-label={p.muted ? 'Activar sonido' : 'Silenciar'}
          title={p.muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
          aria-pressed={p.muted}
        >
          {p.muted ? <VolumeX className="size-5 text-game-coral" /> : <Volume2 className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="grid w-7 place-items-center border-l border-line text-ink-soft"
          aria-label="Ajustar volumen"
          aria-expanded={open}
        >
          <span aria-hidden className="text-xs">▾</span>
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface-2 p-4 shadow-xl"
            role="dialog"
            aria-label="Volumen"
          >
            {(role === 'host' || p.studentMusic) && (
              <Slider label="Música" value={p.music} onChange={(v) => setSoundPrefs({ music: v, muted: false })} />
            )}
            <Slider label="Efectos" value={p.sfx} onChange={(v) => setSoundPrefs({ sfx: v, muted: false })} onCommit={() => sfx.sent()} />
            {role === 'student' && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-4 accent-uap-green" checked={p.studentMusic} onChange={(e) => setSoundPrefs({ studentMusic: e.target.checked })} />
                <Music className="size-4" /> Música también en este equipo
              </label>
            )}
            <p className="mt-3 text-xs text-ink-soft">Atajo: tecla M para silenciar.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Slider({ label, value, onChange, onCommit }: { label: string; value: number; onChange: (v: number) => void; onCommit?: () => void }) {
  return (
    <label className="mb-2 block">
      <span className="flex justify-between text-sm font-semibold">
        {label} <span className="tabular-nums text-ink-soft">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="mt-1 w-full accent-uap-gold"
      />
    </label>
  )
}

/** Tecla M = silenciar (si no se está escribiendo). */
export function useMuteHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'm' || e.key === 'M') setSoundPrefs({ muted: !soundPrefs().muted })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
