import { cn } from '../lib/cn'
import { BRAND } from '../lib/brand'
import type { VisualTheme } from '../lib/visualThemes'
import { JAGUAR } from './jaguar/assets'

const BASE = 'pointer-events-none fixed inset-0 -z-10 overflow-hidden'
const CONTAINED = 'pointer-events-none absolute inset-0 overflow-hidden'


/**
 * Fondo "Amazonía": foto real de la selva de Pando con un velo para leer bien,
 * piel de jaguar apenas visible y huellas reales. Los demás temas son CSS/SVG.
 */
export function AnimatedBackground({
  variant = 'jungle',
  theme = 'amazonia',
  contained = false,
  className,
}: {
  variant?: 'jungle' | 'calm'
  theme?: VisualTheme
  /** Dentro de una caja (vista previa) en vez de ocupar toda la pantalla. */
  contained?: boolean
  className?: string
}) {
  const cls = cn(contained ? CONTAINED : BASE, className)
  if (theme === 'espacio') return <SpaceBackground className={cls} />
  if (theme === 'neon') return <NeonBackground className={cls} />
  if (theme === 'clasico') return <ClassicBackground className={cls} />
  if (theme === 'minimal') return <MinimalBackground className={cls} />
  return (
    <div aria-hidden className={cls}>
      {/* foto real de la selva amazónica (se acerca muy lento) */}
      <div className="absolute inset-0 bg-[#eef2ea] dark:bg-[#060b0c]" />
      <img
        src={JAGUAR.selva}
        srcSet={`${JAGUAR.selva960} 960w, ${JAGUAR.selva} 1920w`}
        sizes="100vw"
        alt=""
        decoding="async"
        className={cn(
          'absolute inset-0 h-full w-full animate-kenburns object-cover',
          variant === 'calm' ? 'opacity-[0.14] dark:opacity-[0.28]' : 'opacity-[0.42] dark:opacity-[0.6]',
        )}
      />
      {/* velo para que el texto se lea siempre */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/65 via-white/35 to-white/75 dark:from-black/55 dark:via-black/25 dark:to-black/70" />

      {/* piel de jaguar, apenas visible */}
      <div
        className="absolute inset-0 animate-spots opacity-[0.05] mix-blend-multiply dark:opacity-[0.07] dark:mix-blend-soft-light"
        style={{ backgroundImage: `url(${JAGUAR.piel})`, backgroundSize: '420px 420px' }}
      />

      {/* luz cálida */}
      <div className="absolute -bottom-[25%] left-[15%] size-[45vmax] rounded-full bg-uap-gold/15 blur-[110px] animate-float-slow dark:bg-uap-gold/10" />

      {/* huellas reales que cruzan la parte baja */}
      {variant === 'jungle' && (
        <div className="absolute bottom-[6%] right-[4%] flex -rotate-[18deg] items-end gap-6 opacity-50 dark:opacity-60">
          {[0, 1, 2].map((i) => (
            <img
              key={i}
              src={JAGUAR.huella}
              alt=""
              className={cn('w-12 animate-paw-step sm:w-16 dark:brightness-[1.7]', i % 2 ? 'translate-y-4' : '')}
              style={{ animationDelay: `${i * 0.9}s`, transform: `rotate(${i % 2 ? 98 : 82}deg)` }}
            />
          ))}
        </div>
      )}

      {/* grano fino para dar textura */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-multiply dark:mix-blend-screen [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  )
}

// ============================================================== otros temas


/** Estrellas fijas (determinísticas) con titileo. */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return { x: r(1) * 100, y: r(2) * 100, s: 1 + r(3) * 2.2, d: r(4) * 6, o: 0.35 + r(5) * 0.65 }
})

function SpaceBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#1d1450_0%,#0a0b25_55%,#03040d_100%)]" />
      <div className="absolute -left-[10%] top-[30%] size-[50vmax] rounded-full bg-[#5b2fb3]/25 blur-[110px] animate-float-slow" />
      <div className="absolute -right-[15%] -top-[10%] size-[45vmax] rounded-full bg-[#1f6fff]/20 blur-[110px] animate-float-med" />
      {STARS.map((st, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, opacity: st.o, animationDelay: `${st.d}s` }}
        />
      ))}
      {/* planeta con anillo */}
      <svg className="absolute -right-16 bottom-[8%] w-72 opacity-80 animate-float-slow sm:w-96" viewBox="0 0 300 300">
        <defs>
          <radialGradient id="pl" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffcf6b" />
            <stop offset="0.55" stopColor="#e0773a" />
            <stop offset="1" stopColor="#5a1f3c" />
          </radialGradient>
        </defs>
        <clipPath id="ring-front">
          <rect x="0" y="160" width="300" height="140" />
        </clipPath>
        <g transform="rotate(-18 150 160)">
          <ellipse cx="150" cy="160" rx="140" ry="30" fill="none" stroke="#ffd98a" strokeOpacity="0.35" strokeWidth="10" />
        </g>
        <circle cx="150" cy="150" r="80" fill="url(#pl)" />
        <path d="M74 132 Q150 110 226 140" stroke="#000" strokeOpacity="0.15" strokeWidth="10" fill="none" />
        <path d="M80 175 Q150 160 222 182" stroke="#000" strokeOpacity="0.12" strokeWidth="8" fill="none" />
        <g transform="rotate(-18 150 160)">
          <ellipse cx="150" cy="160" rx="140" ry="30" fill="none" stroke="#ffd98a" strokeOpacity="0.7" strokeWidth="10" clipPath="url(#ring-front)" />
        </g>
      </svg>
      {/* estrellas fugaces */}
      <span className="absolute left-[10%] top-[12%] h-px w-40 rotate-[20deg] bg-gradient-to-r from-transparent via-white to-transparent animate-shoot" />
      <span className="absolute left-[50%] top-[6%] h-px w-32 rotate-[20deg] bg-gradient-to-r from-transparent via-white to-transparent animate-shoot [animation-delay:4.5s]" />
    </div>
  )
}

function NeonBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="absolute inset-0 bg-[#07060d]" />
      <div className="absolute -left-[10%] -top-[20%] size-[55vmax] rounded-full bg-[#ff2bd6]/25 blur-[120px] animate-float-slow" />
      <div className="absolute -right-[15%] top-[20%] size-[50vmax] rounded-full bg-[#14e1ff]/20 blur-[120px] animate-float-med" />
      <div className="absolute bottom-[-20%] left-[25%] size-[40vmax] rounded-full bg-[#7c3aed]/25 blur-[120px] animate-float-slow" />
      {/* cuadrícula retro en perspectiva */}
      <div className="absolute inset-x-0 bottom-0 h-[45vh] [perspective:420px]">
        <div
          className="absolute inset-x-[-50%] bottom-0 h-[200%] origin-bottom animate-grid [transform:rotateX(62deg)]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(20,225,255,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,43,214,.35) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
          }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-[45vh] h-px bg-gradient-to-r from-transparent via-[#ff2bd6] to-transparent shadow-[0_0_24px_4px_rgba(255,43,214,.6)]" />
      {/* sol retro */}
      <div className="absolute bottom-[45vh] left-1/2 size-56 -translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-b from-[#ffe14d] via-[#ff7a59] to-[#ff2bd6] opacity-60 blur-[1px] [mask-image:repeating-linear-gradient(to_bottom,black_0_14px,transparent_14px_20px)] sm:size-80" />
    </div>
  )
}

function ClassicBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="absolute inset-0 bg-gradient-to-b from-[#f5f7fb] to-[#e9edf4] dark:from-[#0b1426] dark:to-[#0a1020]" />
      {/* franjas institucionales en las esquinas (no pasan detrás del texto) */}
      <div className="absolute -left-[12vw] -top-[9vh] h-[16vh] w-[55vw] -rotate-6 bg-uap-blue dark:bg-uap-blue/80" />
      <div className="absolute -left-[12vw] top-[5.5vh] h-2 w-[50vw] -rotate-6 bg-uap-gold" />
      <div className="absolute -left-[12vw] top-[7vh] h-3 w-[46vw] -rotate-6 bg-uap-red/90" />
      <div className="absolute -bottom-[24vh] -right-[12vw] h-[40vh] w-[62vw] -rotate-12 bg-uap-blue dark:bg-uap-blue/80" />
      <div className="absolute -right-[12vw] bottom-[13vh] h-3 w-[56vw] -rotate-12 bg-uap-red/90" />
      <div className="absolute -right-[12vw] bottom-[15vh] h-2 w-[52vw] -rotate-12 bg-uap-gold" />
      {/* escudo de agua */}
      <img src={BRAND.logoColor} alt="" className="absolute left-1/2 top-1/2 w-[46vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.05] grayscale dark:opacity-[0.05]" />
    </div>
  )
}

function MinimalBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f8fb] to-[#eceff5] dark:from-[#0c111c] dark:to-[#111827]" />
    </div>
  )
}
