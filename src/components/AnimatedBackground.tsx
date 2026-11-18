import { cn } from '../lib/cn'
import { BRAND } from '../lib/brand'
import type { VisualTheme } from '../lib/visualThemes'
import { JaguarFace } from './jaguar/JaguarFace'
import { jaguarTile } from './jaguar/rosettes'

const BASE = 'pointer-events-none fixed inset-0 -z-10 overflow-hidden'
const CONTAINED = 'pointer-events-none absolute inset-0 overflow-hidden'

const SPOTS_LIGHT = jaguarTile('#6B4312')
const SPOTS_DARK = jaguarTile('#E2C46F')

/**
 * Fondo "Amazonía digital": malla de color animada (mesh gradient) +
 * rosetas, cabeza, huellas, zarpazo y ojos de jaguar, y un río sinuoso. Puro CSS/SVG, sin imágenes externas.
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
      {/* base */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#eef3fb] via-[#f4f8f2] to-[#fbf6ea] dark:from-[#081022] dark:via-[#0a1a2a] dark:to-[#0b1f1a]" />

      {/* manchas de color */}
      <div className="absolute -left-[15%] -top-[20%] size-[60vmax] rounded-full bg-uap-blue/25 blur-[90px] animate-float-slow dark:bg-uap-blue/60" />
      <div className="absolute -right-[20%] top-[10%] size-[55vmax] rounded-full bg-uap-green/25 blur-[100px] animate-float-med dark:bg-uap-green/35" />
      {variant === 'jungle' && (
        <>
          <div className="absolute -bottom-[25%] left-[20%] size-[45vmax] rounded-full bg-uap-gold/25 blur-[100px] animate-float-slow dark:bg-uap-gold/15" />
          <div className="absolute bottom-[5%] right-[5%] size-[25vmax] rounded-full bg-uap-red/15 blur-[90px] animate-float-med dark:bg-uap-red/30" />
        </>
      )}

      {/* rosetas de jaguar (muy suaves, se desplazan lento) */}
      <div className="absolute inset-0 animate-spots opacity-[0.07] dark:hidden" style={{ backgroundImage: SPOTS_LIGHT, backgroundSize: '240px 240px' }} />
      <div className="absolute inset-0 hidden animate-spots opacity-[0.06] dark:block" style={{ backgroundImage: SPOTS_DARK, backgroundSize: '240px 240px' }} />

      {/* río */}
      <svg className="absolute inset-x-0 bottom-0 h-[38vh] w-full opacity-40 dark:opacity-25" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          d="M0 230 C 240 170, 380 300, 620 240 S 1010 140, 1200 210 S 1380 260, 1440 230 L1440 320 L0 320 Z"
          className="fill-uap-blue/15 dark:fill-game-electric/20"
        />
        <path
          d="M0 270 C 260 220, 420 320, 700 270 S 1080 210, 1260 260 S 1400 290, 1440 280 L1440 320 L0 320 Z"
          className="fill-uap-green/20 dark:fill-game-selva/15"
        />
      </svg>

      {/* toque jaguar: cabeza, huellas, zarpazo y ojos en la selva */}
      <div className="absolute -left-10 top-[8%] w-48 rotate-[12deg] opacity-[0.13] grayscale-[40%] animate-float-slow dark:opacity-[0.1] sm:w-60"><JaguarFace title="" className="w-full" /></div>
      <PawPrints className="absolute right-[3%] top-[5%] w-36 -rotate-[28deg] text-[#8A5A1B]/25 dark:text-uap-gold/20 sm:w-44" />
      <ClawMarks className="absolute bottom-[16%] right-[-12px] w-40 rotate-[8deg] text-uap-red/15 animate-float-med dark:text-uap-red/25 sm:w-52" />
      <JungleEyes className="absolute bottom-[10%] left-[6%] w-28 text-uap-gold/45 dark:text-[#f5c542]/70 sm:w-32" />

      {/* grano fino para dar textura */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-multiply dark:mix-blend-screen [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  )
}

/** Rastro de tres huellas que aparecen una tras otra. */
function PawPrints({ className }: { className?: string }) {
  const steps = [
    { x: 0, y: 120, r: -8 },
    { x: 70, y: 70, r: 10 },
    { x: 140, y: 20, r: -6 },
  ]
  return (
    <svg viewBox="0 0 210 190" className={className} fill="currentColor">
      {steps.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r} 32 32)`} className="animate-paw-step" style={{ animationDelay: `${i * 0.9}s` }}>
          <path d="M32 30c-9 0-17 8-18 15-1 6 4 10 10 9 3-1 5-2 8-2s5 1 8 2c6 1 11-3 10-9-1-7-9-15-18-15z" />
          <ellipse cx="14" cy="24" rx="6" ry="7.5" transform="rotate(-20 14 24)" />
          <ellipse cx="25" cy="13" rx="6" ry="8" transform="rotate(-6 25 13)" />
          <ellipse cx="40" cy="13" rx="6" ry="8" transform="rotate(6 40 13)" />
          <ellipse cx="51" cy="24" rx="6" ry="7.5" transform="rotate(20 51 24)" />
        </g>
      ))}
    </svg>
  )
}

/** Tres arañazos afilados (más anchos al centro, en punta en los extremos). */
function ClawMarks({ className }: { className?: string }) {
  const sliver = (sx: number, ex: number) => {
    const sy = 12, ey = 188, mx = (sx + ex) / 2 + 10, my = 100
    return `M${sx} ${sy} Q${mx + 9} ${my} ${ex} ${ey} Q${mx - 9} ${my} ${sx} ${sy} Z`
  }
  return (
    <svg viewBox="0 0 160 200" className={className} fill="currentColor">
      <path d={sliver(30, 18)} />
      <path d={sliver(72, 62)} />
      <path d={sliver(114, 106)} />
    </svg>
  )
}

/** Un par de ojos de jaguar que miran desde la oscuridad y parpadean. */
function JungleEyes({ className }: { className?: string }) {
  const eye = (cx: number) => (
    <g className="animate-bg-blink" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <path d={`M${cx - 26} 30 Q${cx} 6 ${cx + 26} 30 Q${cx} 46 ${cx - 26} 30 Z`} fill="currentColor" />
      <ellipse cx={cx} cy="29" rx="3.2" ry="11" fill="#1a1205" opacity="0.85" />
    </g>
  )
  return (
    <svg viewBox="0 0 150 60" className={className}>
      <g className="dark:[filter:drop-shadow(0_0_6px_rgba(245,197,66,0.6))]">
        {eye(36)}
        {eye(114)}
      </g>
    </svg>
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
