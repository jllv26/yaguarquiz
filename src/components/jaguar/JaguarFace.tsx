import { motion } from 'framer-motion'
import { useId } from 'react'
import { cn } from '../../lib/cn'

export type JaguarMood = 'neutral' | 'happy' | 'wow' | 'sad' | 'wink'

const DARK = '#2B1A0C'
const ROSETTE = (x: number, y: number, s = 1, rot = 0) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <circle r="4.5" fill="#C27416" />
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx={Math.cos((a * Math.PI) / 180) * 7} cy={Math.sin((a * Math.PI) / 180) * 7} rx="3.1" ry="2.2" transform={`rotate(${a + 90} ${Math.cos((a * Math.PI) / 180) * 7} ${Math.sin((a * Math.PI) / 180) * 7})`} fill={DARK} />
    ))}
  </g>
)

/**
 * Mascota de YaguarQuiz: rostro de jaguar (dibujo propio).
 * look: hacia dónde mira (-1..1). Parpadea solo cuando está tranquilo.
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
  const px = Math.max(-1, Math.min(1, look.x)) * 4.5
  const py = Math.max(-1, Math.min(1, look.y)) * 3.5
  const pupil = mood === 'wow' ? 8.5 : 6.5

  const openEye = (cx: number, flip: 1 | -1) => (
    <g>
      {/* almendra felina con delineado oscuro (esquina interna más baja) */}
      <path d={`M${cx - 19 * flip} ${104} Q${cx - 2 * flip} ${80} ${cx + 18 * flip} ${95} Q${cx + 4 * flip} ${118} ${cx - 19 * flip} ${104}Z`} fill={DARK} />
      <path d={`M${cx - 15.5 * flip} ${103} Q${cx - 2 * flip} ${85} ${cx + 14.5 * flip} ${95.5} Q${cx + 3 * flip} ${113.5} ${cx - 15.5 * flip} ${103}Z`} fill={`url(#iris-${id})`} />
      <motion.circle cx={cx + px} cy={99 + py} r={pupil} fill={DARK} animate={{ cx: cx + px, cy: 99 + py, r: pupil }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} />
      <circle cx={cx + px + 3} cy={95.5 + py} r="2.3" fill="#fff" opacity="0.95" />
    </g>
  )
  const smileEye = (cx: number) => <path d={`M${cx - 15} 103 Q${cx} 87 ${cx + 15} 103`} stroke={DARK} strokeWidth="5" strokeLinecap="round" fill="none" />

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label={title}>
      <defs>
        <radialGradient id={`fur-${id}`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#F8C45A" />
          <stop offset="70%" stopColor="#E59A2A" />
          <stop offset="100%" stopColor="#C97A17" />
        </radialGradient>
        <radialGradient id={`iris-${id}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FFE27A" />
          <stop offset="60%" stopColor="#F2B01E" />
          <stop offset="100%" stopColor="#B86E0B" />
        </radialGradient>
        <linearGradient id={`muzzle-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF8EA" />
          <stop offset="100%" stopColor="#F2DEB8" />
        </linearGradient>
      </defs>

      {/* orejas */}
      {[52, 148].map((x) => (
        <g key={x}>
          <circle cx={x} cy="54" r="21" fill="#D88A22" />
          <circle cx={x} cy="56" r="12.5" fill={DARK} />
          <circle cx={x} cy="60" r="6.5" fill="#F7E3C0" opacity="0.9" />
        </g>
      ))}

      {/* cabeza */}
      <ellipse cx="100" cy="110" rx="80" ry="72" fill={`url(#fur-${id})`} />
      {/* mejillas claras */}
      <ellipse cx="44" cy="140" rx="26" ry="20" fill="#F7D28A" opacity="0.8" />
      <ellipse cx="156" cy="140" rx="26" ry="20" fill="#F7D28A" opacity="0.8" />

      {/* rosetas */}
      {ROSETTE(100, 60, 1.05, 10)}
      {ROSETTE(74, 70, 0.8, -20)}
      {ROSETTE(126, 70, 0.8, 30)}
      {ROSETTE(42, 104, 0.85, 15)}
      {ROSETTE(158, 104, 0.85, -15)}
      {ROSETTE(36, 140, 0.7, 40)}
      {ROSETTE(164, 140, 0.7, -40)}
      {[
        [88, 46],
        [112, 46],
        [100, 80],
        [60, 84],
        [140, 84],
        [56, 160],
        [144, 160],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={DARK} />
      ))}

      {/* cejas según el ánimo */}
      {mood === 'sad' && (
        <g stroke={DARK} strokeWidth="4" strokeLinecap="round">
          <path d="M54 88 L80 80" />
          <path d="M146 88 L120 80" />
        </g>
      )}
      {mood === 'wow' && (
        <g stroke={DARK} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M58 82 Q70 74 84 80" />
          <path d="M142 82 Q130 74 116 80" />
        </g>
      )}

      {/* ojos */}
      {mood === 'happy' ? (
        <>
          {smileEye(70)}
          {smileEye(130)}
        </>
      ) : (
        <motion.g
          style={{ transformOrigin: '100px 99px' }}
          animate={mood === 'neutral' ? { scaleY: [1, 1, 0.08, 1, 1] } : { scaleY: mood === 'sad' ? 0.7 : 1 }}
          transition={mood === 'neutral' ? { duration: 4.2, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity } : { duration: 0.2 }}
        >
          {mood === 'wink' ? smileEye(70) : openEye(70, 1)}
          {openEye(130, -1)}
        </motion.g>
      )}

      {/* líneas de lágrima típicas del jaguar */}
      <path d="M84 108 Q88 120 90 128" stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M116 108 Q112 120 110 128" stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />

      {/* hocico */}
      <ellipse cx="84" cy="142" rx="22" ry="17" fill={`url(#muzzle-${id})`} />
      <ellipse cx="116" cy="142" rx="22" ry="17" fill={`url(#muzzle-${id})`} />
      <ellipse cx="100" cy="160" rx="18" ry="12" fill={`url(#muzzle-${id})`} />
      {[
        [76, 140],
        [84, 146],
        [72, 148],
        [124, 140],
        [116, 146],
        [128, 148],
      ].map(([x, y]) => (
        <circle key={`w${x}${y}`} cx={x} cy={y} r="1.6" fill={DARK} opacity="0.7" />
      ))}

      {/* nariz */}
      <path d="M86 124 Q100 116 114 124 Q108 138 100 140 Q92 138 86 124Z" fill="#8A4A35" />
      <path d="M92 124 Q100 120 106 124" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* boca */}
      {mood === 'happy' || mood === 'wink' ? (
        <g>
          <path d="M100 140 L100 146" stroke={DARK} strokeWidth="3" strokeLinecap="round" />
          <path d="M80 146 Q100 172 120 146 Z" fill={DARK} />
          <path d="M90 156 Q100 166 110 156 Q100 152 90 156Z" fill="#E8667A" />
        </g>
      ) : mood === 'wow' ? (
        <g>
          <path d="M100 140 L100 146" stroke={DARK} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="100" cy="156" rx="8" ry="9" fill={DARK} />
        </g>
      ) : mood === 'sad' ? (
        <g stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M100 140 L100 148" />
          <path d="M86 158 Q100 146 114 158" />
        </g>
      ) : (
        <g stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M100 140 L100 148" />
          <path d="M100 148 Q92 156 84 150" />
          <path d="M100 148 Q108 156 116 150" />
        </g>
      )}
    </svg>
  )
}
