import { motion } from 'framer-motion'
import { useId } from 'react'
import { cn } from '../../lib/cn'
import { rosetteParts } from './rosettes'

export type JaguarMood = 'neutral' | 'happy' | 'wow' | 'sad' | 'wink'

const INK = '#15100B'

type Pt = [number, number]
const poly = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L') + 'Z'
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [200 - x, y])

/** Facetas de la mitad izquierda (se reflejan): estilo emblema geométrico. */
const FACETS: { pts: Pt[]; fill: string }[] = [
  { pts: [[100, 30], [66, 34], [78, 68], [100, 76]], fill: '#E9B04B' }, // frente
  { pts: [[66, 34], [42, 54], [54, 84], [78, 68]], fill: '#DA982F' }, // sien
  { pts: [[42, 54], [28, 80], [22, 108], [48, 110], [54, 84]], fill: '#C9842A' }, // pómulo
  { pts: [[22, 108], [28, 134], [42, 156], [62, 140], [48, 110]], fill: '#B87424' }, // mejilla baja
  { pts: [[42, 156], [62, 174], [82, 186], [80, 160], [62, 140]], fill: '#A4651D' }, // quijada
  { pts: [[48, 110], [62, 140], [72, 128], [78, 108], [54, 84]], fill: '#D08C2C' }, // bajo el ojo
  { pts: [[78, 68], [54, 84], [78, 108], [90, 78]], fill: '#E2A43C' }, // entrecejo
  { pts: [[100, 76], [90, 78], [88, 116], [100, 116]], fill: '#EFBE5E' }, // puente nasal
]
const MUZZLE: { pts: Pt[]; fill: string }[] = [
  { pts: [[100, 114], [86, 116], [70, 130], [72, 150], [100, 150]], fill: '#F4E8CC' },
  { pts: [[72, 150], [82, 168], [100, 174], [100, 150]], fill: '#E6D3AC' },
  { pts: [[82, 186], [100, 190], [100, 174], [82, 168]], fill: '#D7C095' }, // mentón
]
const HEAD: Pt[] = [[100, 30], [66, 34], [42, 54], [28, 80], [22, 108], [28, 134], [42, 156], [62, 174], [82, 186], [100, 190], [118, 186], [138, 174], [158, 156], [172, 134], [178, 108], [172, 80], [158, 54], [134, 34]]
const EAR_OUT: Pt[] = [[30, 56], [32, 30], [50, 20], [66, 34], [46, 58]]
const EAR_IN: Pt[] = [[38, 50], [39, 32], [50, 27], [58, 37], [46, 52]]
const BROW: Pt[] = [[50, 86], [72, 76], [94, 92], [90, 96], [72, 84], [52, 90]]
const TEAR: Pt[] = [[86, 104], [92, 105], [86, 134], [79, 131]]
const NOSE: Pt[] = [[100, 116], [86, 118], [84, 124], [92, 134], [100, 140]]

/** Párpado (alto, desde arriba del ojo) según el ánimo. */
const LID: Record<JaguarMood, number> = { neutral: 9, wow: 2, happy: 12, sad: 13, wink: 9 }

const SPOTS: [number, number, number, number][] = [
  [60, 52, 8.5, 1], [140, 52, 8.5, 2], [38, 96, 9, 3], [162, 96, 9, 4], [38, 134, 8, 5], [162, 134, 8, 6],
  [56, 160, 6.5, 7], [144, 160, 6.5, 8],
]
const DOTS: [number, number, number][] = [
  [100, 42, 2.6], [90, 50, 2], [110, 50, 2], [100, 58, 2.2], [84, 62, 1.8], [116, 62, 1.8], [80, 44, 1.6], [120, 44, 1.6],
  [58, 120, 2], [142, 120, 2], [66, 112, 1.6], [134, 112, 1.6],
]

/**
 * Mascota de YaguarQuiz: rostro de jaguar estilo emblema geométrico (dibujo propio).
 * Mirada seria con pupila felina; "happy" ruge mostrando los colmillos.
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
  const px = Math.max(-1, Math.min(1, look.x)) * 3.5
  const py = Math.max(-1, Math.min(1, look.y)) * 2
  const wide = mood === 'wow'
  const roar = mood === 'happy'

  // ojo angular: esquina interna baja, externa elevada
  const eyePts = (f: 1 | -1): Pt[] => {
    const p: Pt[] = [[88, 102], [76, 88], [56, 90], [50, 92], [62, 102], [78, 106]]
    return f === 1 ? p : mirror(p)
  }

  const eye = (f: 1 | -1, closed = false) => {
    const cx = f === 1 ? 70 : 130
    if (closed) return <path d={poly(f === 1 ? [[50, 94], [70, 102], [88, 102], [70, 106]] : mirror([[50, 94], [70, 102], [88, 102], [70, 106]]))} fill={INK} />
    return (
      <g>
        <clipPath id={`eye-${id}-${f}`}>
          <path d={poly(eyePts(f))} />
        </clipPath>
        <g clipPath={`url(#eye-${id}-${f})`}>
          <rect x={cx - 24} y="84" width="48" height="26" fill={`url(#iris-${id})`} />
          <motion.ellipse
            cx={cx + px}
            cy={97 + py}
            rx={wide ? 5 : 2.2}
            ry={wide ? 6.5 : 7.5}
            fill={INK}
            animate={{ cx: cx + px, cy: 97 + py, rx: wide ? 5 : 2.2, ry: wide ? 6.5 : 7.5 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          />
          <circle cx={cx + px + 3} cy={93 + py} r="1.3" fill="#fff" opacity="0.8" />
          <motion.rect
            x={cx - 24}
            y="80"
            width="48"
            fill={INK}
            initial={false}
            animate={
              mood === 'neutral'
                ? { height: [LID.neutral + 6, LID.neutral + 6, 30, LID.neutral + 6, LID.neutral + 6] }
                : { height: LID[mood] + 6 }
            }
            transition={mood === 'neutral' ? { duration: 6, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity } : { duration: 0.25 }}
          />
        </g>
        <path d={poly(eyePts(f))} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </g>
    )
  }

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label={title}>
      <defs>
        <radialGradient id={`iris-${id}`} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#FFE07A" />
          <stop offset="55%" stopColor="#E0A526" />
          <stop offset="100%" stopColor="#8A5A0E" />
        </radialGradient>
      </defs>

      {/* orejas */}
      {[1, -1].map((f) => (
        <motion.g
          key={f}
          style={{ transformOrigin: f === 1 ? '50px 56px' : '150px 56px' }}
          animate={{ rotate: mood === 'sad' ? -f * 18 : wide ? f * 4 : 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 16 }}
        >
          <path d={poly(f === 1 ? EAR_OUT : mirror(EAR_OUT))} fill="#9A5E1A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d={poly(f === 1 ? EAR_IN : mirror(EAR_IN))} fill={INK} />
          <path d={poly(f === 1 ? [[42, 50], [44, 40], [52, 44], [46, 52]] : mirror([[42, 50], [44, 40], [52, 44], [46, 52]]))} fill="#EAD9B6" opacity="0.85" />
        </motion.g>
      ))}

      {/* base y facetas de la cabeza */}
      <path d={poly(HEAD)} fill="#C9842A" />
      {FACETS.flatMap((fc, i) => [
        <path key={`l${i}`} d={poly(fc.pts)} fill={fc.fill} />,
        <path key={`r${i}`} d={poly(mirror(fc.pts))} fill={fc.fill} />,
      ])}

      {/* rosetas reales */}
      {SPOTS.flatMap(([x, y, r, s]) =>
        rosetteParts(x, y, r, s * 11).map((p, j) =>
          p.kind === 'arc' ? (
            <path key={`${s}-${j}`} d={p.d} stroke={INK} strokeWidth={p.w} strokeLinecap="round" fill="none" />
          ) : (
            <circle key={`${s}-${j}`} cx={p.cx} cy={p.cy} r={p.r} fill={INK} />
          ),
        ),
      )}
      {DOTS.map(([x, y, r]) => (
        <circle key={`d${x}-${y}`} cx={x} cy={y} r={r} fill={INK} />
      ))}

      {/* hocico */}
      {MUZZLE.flatMap((m, i) => [
        <path key={`ml${i}`} d={poly(m.pts)} fill={m.fill} />,
        <path key={`mr${i}`} d={poly(mirror(m.pts))} fill={m.fill} />,
      ])}
      {[
        [78, 138], [84, 146], [76, 148], [122, 138], [116, 146], [124, 148],
      ].map(([x, y]) => (
        <circle key={`w${x}${y}`} cx={x} cy={y} r="1.6" fill={INK} opacity="0.8" />
      ))}

      {/* contorno */}
      <path
        d={poly(HEAD)}
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* ceño, ojos y líneas de lágrima */}
      <motion.g animate={{ y: wide ? -4 : mood === 'sad' ? 2 : 0 }} transition={{ duration: 0.25 }}>
        <path d={poly(BROW)} fill={INK} />
        <path d={poly(mirror(BROW))} fill={INK} />
      </motion.g>
      {eye(1, mood === 'wink')}
      {eye(-1)}
      <path d={poly(TEAR)} fill={INK} />
      <path d={poly(mirror(TEAR))} fill={INK} />

      {/* nariz */}
      <path d={poly([...NOSE, ...mirror(NOSE).reverse().slice(1, -1)])} fill="#3E2219" />
      <path d="M92 120 L100 118 L108 120" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* bigotes */}
      <g stroke="#FBF5E8" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" fill="none">
        <path d="M74 144 L14 138" />
        <path d="M74 150 L16 156" />
        <path d="M126 144 L186 138" />
        <path d="M126 150 L184 156" />
      </g>

      {/* boca */}
      {roar ? (
        <g>
          <path d={poly([[100, 140], [80, 150], [76, 164], [86, 182], [100, 186], [114, 182], [124, 164], [120, 150]])} fill="#240B07" stroke={INK} strokeWidth="2" />
          <path d={poly([[88, 176], [100, 170], [112, 176], [100, 182]])} fill="#8E3434" />
          <path d={poly([[82, 152], [88, 152], [86, 170]])} fill="#FFFBF0" />
          <path d={poly([[112, 152], [118, 152], [114, 170]])} fill="#FFFBF0" />
          <path d={poly([[86, 182], [90, 170], [93, 183]])} fill="#FFFBF0" />
          <path d={poly([[107, 183], [110, 170], [114, 182]])} fill="#FFFBF0" />
        </g>
      ) : (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M100 140 L100 152" />
          {mood === 'sad' ? <path d="M80 164 L100 152 L120 164" /> : <path d="M80 158 L100 152 L120 158" />}
        </g>
      )}
    </svg>
  )
}
