import { Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../lib/brand'
import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="glass grid size-11 place-items-center rounded-2xl text-ink transition-transform hover:scale-105 active:scale-95"
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

/** crowded: hay varios botones a la derecha; en celulares angostos se muestra solo el escudo. */
export function TopBar({ right, crowded = false }: { right?: ReactNode; crowded?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6 short:pt-2">
      <Link to="/" className={`glass flex shrink-0 items-center gap-3 rounded-2xl p-1.5 ${crowded ? 'min-[420px]:pr-4' : 'pr-4'}`} title="Ir al inicio" aria-label="YaguarQuiz: ir al inicio">
        <img src={BRAND.logoColor} alt="" className="size-10 rounded-xl bg-white object-contain p-0.5 short:size-8" />
        {/* en celulares angostos solo el escudo, para dejar lugar a los botones */}
        <span className={crowded ? 'hidden leading-tight min-[420px]:block' : 'leading-tight'}>
          <span className="block font-display text-lg font-extrabold text-uap-blue dark:text-white">
            Yaguar<span className="text-[#8a6416] dark:text-uap-gold-300">Quiz</span>
          </span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{BRAND.short} · Cobija</span>
        </span>
      </Link>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {right}
        <ThemeToggle />
      </div>
    </header>
  )
}
