import { cn } from '../lib/cn'

/**
 * Fondo "Amazonía digital": malla de color animada (mesh gradient) +
 * siluetas de hojas y un río sinuoso. Puro CSS/SVG, sin imágenes externas.
 */
export function AnimatedBackground({ variant = 'jungle', className }: { variant?: 'jungle' | 'calm'; className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
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

      {/* hojas */}
      <Leaf className="absolute -left-10 top-[12%] w-40 rotate-[25deg] text-uap-green/20 animate-float-slow dark:text-game-selva/10" />
      <Leaf className="absolute right-[6%] top-[6%] w-28 -rotate-[35deg] text-uap-gold/30 animate-float-med dark:text-uap-gold/15" />
      <Leaf className="absolute bottom-[18%] right-[-30px] w-48 rotate-[200deg] text-uap-green/20 animate-float-med dark:text-game-selva/10" />
      <Leaf className="absolute bottom-[8%] left-[8%] w-24 rotate-[120deg] text-uap-blue/15 animate-float-slow dark:text-game-electric/10" />

      {/* grano fino para dar textura */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-multiply dark:mix-blend-screen [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  )
}

function Leaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} fill="currentColor">
      <path d="M60 4 C 110 50, 118 130, 62 196 C 4 132, 10 52, 60 4 Z" />
      <path d="M60 18 L61 188" stroke="white" strokeOpacity="0.35" strokeWidth="2.5" fill="none" />
      {[40, 70, 100, 130].map((y) => (
        <g key={y} stroke="white" strokeOpacity="0.25" strokeWidth="2" fill="none">
          <path d={`M61 ${y} Q 80 ${y - 6} 92 ${y - 18}`} />
          <path d={`M60 ${y + 10} Q 40 ${y + 4} 28 ${y - 8}`} />
        </g>
      ))}
    </svg>
  )
}
