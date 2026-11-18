import { motion } from 'framer-motion'
import { useId } from 'react'
import { cn } from '../../lib/cn'

export type JaguarMood = 'neutral' | 'happy' | 'wow' | 'sad' | 'wink'

const DARK = '#1B120A'
const FUR = '#C8862A'

const ROSETTE = (x: number, y: number, s = 1, rot = 0) => (
  <g key={`r${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <circle r="3.6" fill="#9A5A14" />
    {[0, 75, 150, 220, 290].map((a) => {
      const cx = Math.cos((a * Math.PI) / 180) * 6
      const cy = Math.sin((a * Math.PI) / 180) * 6
      return <ellipse key={a} cx={cx} cy={cy} rx="2.8" ry="1.7" transform={`rotate(${a + 90} ${cx} ${cy})`} fill={DARK} />
    })}
  </g>
)

/** Altura del párpado (desde arriba del ojo) según el ánimo: más alto = mirada más dura. */
const LID: Record<JaguarMood, number> = { neutral: 8, wow: 1, happy: 13, sad: 12, wink: 8 }

/**
 * Mascota de YaguarQuiz: rostro de jaguar estilo emblema (dibujo propio).
 * Mirada intensa con pupila felina; "happy" ruge mostrando los colmillos.
 * look: hacia dónde mira (-1..1). Parpadea despacio cuando está tranquilo.
 */
export function JaguarFace({
  mood = 'neutral',
  look = { x: 0, y: 0 },
  className,
  title = 'Yaguar, la mascota de YaguarQuiz',
}: {
  mood?: JaguarMood
  look?: { x: number; y: number }
  className?: string
  title?: string
}) {
  const id = useId().replace(/:/g, '')
  const px = Math.max(-1, Math.min(1, look.x)) * 4
  const py = Math.max(-1, Math.min(1, look.y)) * 2.5
  const wide = mood === 'wow'
  const sadEars = mood === 'sad'

  // almendra: esquina interna más baja (hacia la nariz), externa elevada
  const almond = (cx: number, f: 1 | -1) =>
    `M${cx + 18 * f} 104 Q${cx + 2 * f} 84 ${cx - 18 * f} 92 Q${cx - 4 * f} 112 ${cx + 18 * f} 104 Z`

  const eye = (cx: number, f: 1 | -1, closed = false) =>
    closed ? (
      <path d={`M${cx - 20 * f} 94 Q${cx} 108 ${cx + 18 * f} 102`} stroke={DARK} strokeWidth="4" strokeLinecap="round" fill="none" />
    ) : (
    <g>
      <clipPath id={`eye-${id}-${cx}`}>
        <path d={almond(cx, f)} />
      </clipPath>
      <g clipPath={`url(#eye-${id}-${cx})`}>
        <rect x={cx - 22} y="80" width="44" height="36" fill={`url(#iris-${id})`} />
        <motion.ellipse
          cx={cx + px}
          cy={98 + py}
          rx={wide ? 5.5 : 2.4}
          ry={wide ? 7.5 : 8}
          fill={DARK}
          animate={{ cx: cx + px, cy: 98 + py, rx: wide ? 5.5 : 2.4, ry: wide ? 7.5 : 8 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        />
        <circle cx={cx + px + 3.5} cy={93 + py} r="1.5" fill="#fff" opacity="0.85" />
        {/* párpado: baja según el ánimo y en el parpadeo */}
        <motion.rect
          x={cx - 22}
          y="78"
          width="44"
          fill={DARK}
          initial={false}
          animate={
            closed
              ? { height: 40 }
              : mood === 'neutral'
                ? { height: [LID.neutral + 4, LID.neutral + 4, 40, LID.neutral + 4, LID.neutral + 4] }
                : { height: LID[mood] + 4 }
          }
          transition={mood === 'neutral' && !closed ? { duration: 5.5, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity } : { duration: 0.25 }}
        />
      </g>
      <path d={almond(cx, f)} fill="none" stroke={DARK} strokeWidth="3.2" strokeLinejoin="round" />
      {/* delineado externo tipo felino */}
      <path d={`M${cx - 18 * f} 92 L${cx - 25 * f} 88`} stroke={DARK} strokeWidth="3" strokeLinecap="round" />
    </g>
    )

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label={title}>
      <defs>
        <radialGradient id={`fur-${id}`} cx="50%" cy="48%" r="62%">
          <stop offset="0%" stopColor="#E6AA4C" />
          <stop offset="62%" stopColor={FUR} />
          <stop offset="100%" stopColor="#7E4A12" />
        </radialGradient>
        <radialGradient id={`iris-${id}`} cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor="#F2D46A" />
          <stop offset="55%" stopColor="#C9A227" />
          <stop offset="100%" stopColor="#6E6A1C" />
        </radialGradient>
        <linearGradient id={`muzzle-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3E7CF" />
          <stop offset="100%" stopColor="#DCC7A0" />
        </linearGradient>
      </defs>

      {/* orejas (pequeñas, redondeadas; caen hacia afuera si está triste) */}
      {[
        [46, -1],
        [154, 1],
      ].map(([x, s]) => (
        <motion.g
          key={x}
          style={{ transformOrigin: `${x}px 60px` }}
          animate={{ rotate: sadEars ? s * 22 : wide ? -s * 4 : 0, y: sadEars ? 4 : 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 16 }}
        >
          <path d={`M${x - 20} 64 Q${x - 18} 30 ${x} 28 Q${x + 18} 30 ${x + 20} 64 Z`} fill="#8E5414" />
          <path d={`M${x - 12} 62 Q${x - 10} 40 ${x} 38 Q${x + 10} 40 ${x + 12} 62 Z`} fill={DARK} />
          <path d={`M${x - 6} 62 Q${x - 4} 48 ${x} 46 Q${x + 4} 48 ${x + 6} 62 Z`} fill="#E9D7B4" opacity="0.8" />
        </motion.g>
      ))}

      {/* cabeza: ancha en los pómulos */}
      <path
        d="M100 32 C142 32 168 48 178 78 C186 100 186 122 176 142 C164 166 138 186 100 190 C62 186 36 166 24 142 C14 122 14 100 22 78 C32 48 58 32 100 32 Z"
        fill={`url(#fur-${id})`}
        stroke="#5A3510"
        strokeWidth="2"
      />

      {/* puente nasal más claro */}
      <path d="M90 66 Q100 60 110 66 L108 120 Q100 126 92 120 Z" fill="#E8B35C" opacity="0.55" />

      {/* rosetas y manchas */}
      {ROSETTE(76, 58, 0.85, 20)}
      {ROSETTE(124, 58, 0.85, -20)}
      {ROSETTE(40, 92, 0.9, 40)}
      {ROSETTE(160, 92, 0.9, -40)}
      {ROSETTE(32, 128, 0.8, 10)}
      {ROSETTE(168, 128, 0.8, -10)}
      {ROSETTE(48, 158, 0.7, 60)}
      {ROSETTE(152, 158, 0.7, -60)}
      {[
        [100, 46, 2.8],
        [92, 54, 2.2],
        [108, 54, 2.2],
        [100, 62, 2],
        [86, 70, 1.8],
        [114, 70, 1.8],
        [60, 74, 2.4],
        [140, 74, 2.4],
        [58, 122, 2],
        [142, 122, 2],
      ].map(([x, y, r]) => (
        <circle key={`s${x}-${y}`} cx={x} cy={y} r={r} fill={DARK} />
      ))}

      {/* cejas: arco oscuro inclinado hacia el centro (mirada seria) */}
      <motion.g
        stroke={DARK}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        animate={{ y: wide ? -5 : mood === 'sad' ? 2 : 0 }}
        transition={{ duration: 0.25 }}
      >
        <path d={mood === 'sad' ? 'M52 86 Q68 76 88 82' : 'M50 82 Q70 76 90 88'} />
        <path d={mood === 'sad' ? 'M148 86 Q132 76 112 82' : 'M150 82 Q130 76 110 88'} />
      </motion.g>

      {/* ojos */}
      {eye(70, 1, mood === 'wink')}
      {eye(130, -1)}

      {/* líneas de lágrima del jaguar */}
      <path d="M86 106 Q92 120 90 134" stroke={DARK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M114 106 Q108 120 110 134" stroke={DARK} strokeWidth="3.2" strokeLinecap="round" fill="none" />

      {/* hocico */}
      <path d="M68 128 Q100 112 132 128 Q144 156 124 174 Q100 188 76 174 Q56 156 68 128 Z" fill={`url(#muzzle-${id})`} />
      {[
        [76, 142],
        [82, 150],
        [72, 152],
        [124, 142],
        [118, 150],
        [128, 152],
      ].map(([x, y]) => (
        <circle key={`w${x}${y}`} cx={x} cy={y} r="1.7" fill={DARK} opacity="0.75" />
      ))}
      {/* bigotes */}
      <g stroke="#FBF5E8" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" fill="none">
        <path d="M70 146 Q46 140 18 144" />
        <path d="M70 152 Q46 154 20 162" />
        <path d="M130 146 Q154 140 182 144" />
        <path d="M130 152 Q154 154 180 162" />
      </g>

      {/* nariz */}
      <path d="M85 128 Q100 120 115 128 Q113 140 100 146 Q87 140 85 128 Z" fill="#4A2A20" />
      <path d="M91 128 Q100 124 109 128" stroke="#fff" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* boca */}
      {mood === 'happy' ? (
        <g>
          {/* rugido: boca abierta con colmillos */}
          <path d="M78 152 Q100 146 122 152 Q120 182 100 186 Q80 182 78 152 Z" fill="#2A0D08" />
          <ellipse cx="100" cy="176" rx="12" ry="6" fill="#9A3B3B" />
          <path d="M84 153 L88 170 L92 153 Z" fill="#FFFDF5" />
          <path d="M108 153 L112 170 L116 153 Z" fill="#FFFDF5" />
          <path d="M87 182 L90 172 L93 183 Z" fill="#FFFDF5" />
          <path d="M107 183 L110 172 L113 182 Z" fill="#FFFDF5" />
        </g>
      ) : (
        <g stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M100 146 L100 156" />
          {mood === 'sad' ? (
            <>
              <path d="M100 156 Q92 162 82 166" />
              <path d="M100 156 Q108 162 118 166" />
            </>
          ) : (
            <>
              <path d="M100 156 Q90 162 80 160" />
              <path d="M100 156 Q110 162 120 160" />
            </>
          )}
        </g>
      )}
    </svg>
  )
}
