import { cn } from '../lib/cn'

/** Mosaico de rosetas de jaguar (SVG en línea, sin descargas). */
function rosetteTile(color: string) {
  const ros = (x: number, y: number, s: number, r: number) => {
    const blobs = [0, 60, 130, 200, 270]
      .map((a) => {
        const rad = (a * Math.PI) / 180
        const cx = (Math.cos(rad) * 11).toFixed(1)
        const cy = (Math.sin(rad) * 11).toFixed(1)
        return `<ellipse cx='${cx}' cy='${cy}' rx='5.2' ry='3.4' transform='rotate(${a + 90} ${cx} ${cy})'/>`
      })
      .join('')
    return `<g transform='translate(${x} ${y}) rotate(${r}) scale(${s})'>${blobs}<circle r='2.6' opacity='0.55'/></g>`
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' fill='${color}'>${ros(40, 50, 1.1, 10)}${ros(160, 30, 0.8, 40)}${ros(110, 130, 1.25, -20)}${ros(30, 190, 0.9, 70)}${ros(200, 170, 1, 15)}<circle cx='90' cy='60' r='3'/><circle cx='190' cy='100' r='2.5'/><circle cx='70' cy='150' r='2.5'/><circle cx='150' cy='220' r='3'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
const SPOTS_LIGHT = rosetteTile('#8A5A1B')
const SPOTS_DARK = rosetteTile('#E2C46F')

/**
 * Fondo "Amazonía digital": malla de color animada (mesh gradient) +
 * rosetas, cabeza, huellas, zarpazo y ojos de jaguar, y un río sinuoso. Puro CSS/SVG, sin imágenes externas.
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
      <JaguarHead className="absolute -left-8 top-[9%] w-44 rotate-[14deg] text-uap-gold opacity-30 animate-float-slow dark:opacity-[0.18] sm:w-56" />
      <PawPrints className="absolute right-[3%] top-[5%] w-36 -rotate-[28deg] text-[#8A5A1B]/25 dark:text-uap-gold/20 sm:w-44" />
      <ClawMarks className="absolute bottom-[16%] right-[-12px] w-40 rotate-[8deg] text-uap-red/15 animate-float-med dark:text-uap-red/25 sm:w-52" />
      <JungleEyes className="absolute bottom-[10%] left-[6%] w-28 text-uap-gold/45 dark:text-[#f5c542]/70 sm:w-32" />

      {/* grano fino para dar textura */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-multiply dark:mix-blend-screen [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  )
}

/** Silueta de cabeza de jaguar: orejas redondas, cachetes anchos, rosetas y ojos calados. */
function JaguarHead({ className }: { className?: string }) {
  const rosette = (x: number, y: number, k: number, r: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${r}) scale(${k})`} fill="black" fillOpacity="0.5">
      {[0, 70, 140, 215, 285].map((a) => {
        const rad = (a * Math.PI) / 180
        const cx = Math.cos(rad) * 8
        const cy = Math.sin(rad) * 8
        return <ellipse key={a} cx={cx} cy={cy} rx="4" ry="2.6" transform={`rotate(${a + 90} ${cx} ${cy})`} />
      })}
    </g>
  )
  return (
    <svg viewBox="0 0 200 200" className={className}>
      <defs>
        <mask id="bg-jag-head">
          <rect width="200" height="200" fill="white" />
          {/* interior de las orejas */}
          <circle cx="50" cy="52" r="10" fill="black" fillOpacity="0.45" />
          <circle cx="150" cy="52" r="10" fill="black" fillOpacity="0.45" />
          {/* rosetas en frente y cachetes */}
          {rosette(100, 64, 1, 0)}
          {rosette(70, 78, 0.8, 30)}
          {rosette(130, 78, 0.8, -30)}
          {rosette(40, 116, 0.9, 60)}
          {rosette(160, 116, 0.9, -60)}
          {rosette(52, 152, 0.7, 10)}
          {rosette(148, 152, 0.7, -10)}
          <circle cx="86" cy="50" r="2.6" fill="black" fillOpacity="0.5" />
          <circle cx="114" cy="50" r="2.6" fill="black" fillOpacity="0.5" />
          {/* ojos almendrados y rasgados */}
          <path d="M90 112 Q74 94 54 102 Q68 120 90 112 Z" fill="black" />
          <path d="M110 112 Q126 94 146 102 Q132 120 110 112 Z" fill="black" />
          {/* cejas serias */}
          <path d="M50 92 Q70 84 92 98" stroke="black" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M150 92 Q130 84 108 98" stroke="black" strokeWidth="5" strokeLinecap="round" fill="none" />
          {/* líneas de lágrima */}
          <path d="M88 116 Q94 128 92 140" stroke="black" strokeOpacity="0.6" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M112 116 Q106 128 108 140" stroke="black" strokeOpacity="0.6" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          {/* nariz y boca */}
          <path d="M88 136 Q100 132 112 136 Q108 146 100 150 Q92 146 88 136 Z" fill="black" />
          <path d="M100 150 L100 160 M100 160 Q90 166 80 165 M100 160 Q110 166 120 165" stroke="black" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          {/* bigotes */}
          <g stroke="black" strokeOpacity="0.5" strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M74 150 Q54 146 30 152" /><path d="M74 157 Q54 160 34 170" />
            <path d="M126 150 Q146 146 170 152" /><path d="M126 157 Q146 160 166 170" />
          </g>
        </mask>
      </defs>
      <g mask="url(#bg-jag-head)" fill="currentColor">
        <circle cx="50" cy="52" r="22" />
        <circle cx="150" cy="52" r="22" />
        <path d="M100 36 C150 36 178 62 184 104 C188 132 180 156 160 172 C142 186 122 192 100 192 C78 192 58 186 40 172 C20 156 12 132 16 104 C22 62 50 36 100 36 Z" />
      </g>
    </svg>
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
