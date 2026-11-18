import { useEffect } from 'react'

/** Temas visuales por evaluación (se ven en el proyector y en el celular del estudiante). */
export type VisualTheme = 'amazonia' | 'espacio' | 'neon' | 'clasico' | 'minimal'

export const VISUAL_THEMES: { id: VisualTheme; label: string; hint: string; swatch: string; dark?: boolean }[] = [
  { id: 'amazonia', label: 'Amazonía', hint: 'Selva, río y piel de jaguar', swatch: 'linear-gradient(135deg,#1F3864,#1B7339 55%,#C9A23A)' },
  { id: 'espacio', label: 'Espacio', hint: 'Estrellas, planeta y estrellas fugaces', swatch: 'linear-gradient(135deg,#050816,#1d1450 60%,#5b2fb3)', dark: true },
  { id: 'neon', label: 'Neón', hint: 'Luces de colores y cuadrícula retro', swatch: 'linear-gradient(135deg,#07060d,#ff2bd6 55%,#14e1ff)', dark: true },
  { id: 'clasico', label: 'Clásico UAP', hint: 'Colores y escudo institucional', swatch: 'linear-gradient(135deg,#1F3864 45%,#8B1A1A 45% 70%,#C9A23A 70%)' },
  { id: 'minimal', label: 'Minimalista', hint: 'Fondo limpio, sin adornos', swatch: 'linear-gradient(135deg,#f4f6fa,#dfe4ec)' },
]

export function asTheme(v: string | null | undefined): VisualTheme {
  return VISUAL_THEMES.some((t) => t.id === v) ? (v as VisualTheme) : 'amazonia'
}

/** Los temas nocturnos (Espacio, Neón) se ven siempre en modo oscuro mientras la pantalla está abierta. */
export function useForcedDark(theme: VisualTheme) {
  const dark = VISUAL_THEMES.find((t) => t.id === theme)?.dark
  useEffect(() => {
    if (!dark) return
    const root = document.documentElement
    const had = root.classList.contains('dark')
    root.classList.add('dark')
    return () => {
      if (!had) root.classList.remove('dark')
    }
  }, [dark])
}
