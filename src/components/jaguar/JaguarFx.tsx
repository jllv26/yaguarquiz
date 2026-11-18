import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/cn'

const DARK = '#2B1A0C'

/**
 * Zarpazo: tres garras que rasgan la pantalla (al decir "¡Ya!" o al acertar).
 * Cambie `playKey` para repetir la animación.
 */
export function ClawSwipe({ playKey, label, tone = 'gold' }: { playKey: string | number | null; label?: string; tone?: 'gold' | 'green' }) {
  const stroke = tone === 'green' ? ['#1DBF73', '#C9A23A'] : ['#FFD34D', '#FF3355']
  return (
    <AnimatePresence>
      {playKey !== null && (
        <motion.div
          key={playKey}
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 1, 0] }}
          transition={{ duration: 1.5, times: [0, 0.7, 1] }}
          aria-hidden
        >
          <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id={`claw-${tone}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={stroke[0]} />
                <stop offset="100%" stopColor={stroke[1]} />
              </linearGradient>
              <filter id="claw-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {[0, 1, 2].map((i) => {
              // rasguño afinado en las puntas: dos curvas que se separan al centro
              const p0 = [262 + i * 34, 36 + i * 8]
              const p2 = [122 + i * 34, 266 - i * 8]
              const c = [212 + i * 30, 150]
              const sliver = (w: number) =>
                `M${p0[0]} ${p0[1]} Q${c[0] + w} ${c[1] + w * 0.55} ${p2[0]} ${p2[1]} Q${c[0] - w} ${c[1] - w * 0.55} ${p0[0]} ${p0[1]}Z`
              return (
                <g key={i}>
                  <mask id={`claw-m-${tone}-${i}`}>
                    <motion.path
                      d={`M${p0[0]} ${p0[1]} Q${c[0]} ${c[1]} ${p2[0]} ${p2[1]}`}
                      stroke="#fff"
                      strokeWidth="40"
                      strokeLinecap="round"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.26, delay: i * 0.07, ease: [0.2, 0.9, 0.3, 1] }}
                    />
                  </mask>
                  <g mask={`url(#claw-m-${tone}-${i})`}>
                    <path d={sliver(15 - i * 2)} fill={`url(#claw-${tone})`} filter="url(#claw-glow)" />
                    <path d={sliver(4.5 - i * 0.6)} fill="#2B1A0C" opacity="0.55" />
                  </g>
                </g>
              )
            })}
          </svg>
          {label && (
            <motion.span
              initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 14 }}
              className="relative rounded-3xl bg-uap-blue-900/85 px-6 py-3 font-display text-4xl font-black text-uap-gold shadow-2xl sm:text-6xl"
            >
              {label}
            </motion.span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Ojo de jaguar vigilante: mira de un lado a otro y parpadea (modo anti-copia). */
export function JaguarEye({ className, watching = true }: { className?: string; watching?: boolean }) {
  return (
    <svg viewBox="0 0 120 64" className={cn('select-none', className)} role="img" aria-label="Ojo de jaguar vigilando">
      <defs>
        <radialGradient id="eye-iris" cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FFE680" />
          <stop offset="55%" stopColor="#F2B01E" />
          <stop offset="100%" stopColor="#A85F08" />
        </radialGradient>
        <clipPath id="eye-shape">
          <path d="M6 34 Q60 -6 114 30 Q62 70 6 34Z" />
        </clipPath>
      </defs>
      <motion.g
        style={{ transformOrigin: '60px 32px' }}
        animate={{ scaleY: [1, 1, 0.06, 1, 1] }}
        transition={{ duration: 3.6, times: [0, 0.86, 0.9, 0.94, 1], repeat: Infinity }}
      >
        <path d="M2 34 Q60 -12 118 30 Q62 76 2 34Z" fill={DARK} />
        <g clipPath="url(#eye-shape)">
          <rect x="0" y="0" width="120" height="64" fill="url(#eye-iris)" />
          {/* vetas del iris */}
          {[...Array(14)].map((_, i) => (
            <line key={i} x1="60" y1="32" x2={60 + Math.cos((i / 14) * Math.PI * 2) * 40} y2={32 + Math.sin((i / 14) * Math.PI * 2) * 40} stroke="#B9700E" strokeOpacity="0.35" strokeWidth="1.2" />
          ))}
          <motion.g animate={watching ? { x: [-16, 16, 16, -16, -16] } : { x: 0 }} transition={{ duration: 5, times: [0, 0.3, 0.5, 0.8, 1], repeat: Infinity, ease: 'easeInOut' }}>
            <circle cx="60" cy="32" r="13" fill={DARK} />
            <circle cx="65" cy="26" r="3.6" fill="#fff" opacity="0.9" />
          </motion.g>
        </g>
      </motion.g>
    </svg>
  )
}

/** Huella de jaguar (4 dedos + almohadilla). */
export function Paw({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} fill="currentColor" aria-hidden>
      <path d="M32 30c-9 0-17 8-18 15-1 6 4 10 10 9 3-1 5-2 8-2s5 1 8 2c6 1 11-3 10-9-1-7-9-15-18-15z" />
      <ellipse cx="14" cy="24" rx="6" ry="7.5" transform="rotate(-20 14 24)" />
      <ellipse cx="25" cy="13" rx="6" ry="8" transform="rotate(-6 25 13)" />
      <ellipse cx="40" cy="13" rx="6" ry="8" transform="rotate(6 40 13)" />
      <ellipse cx="51" cy="24" rx="6" ry="7.5" transform="rotate(20 51 24)" />
    </svg>
  )
}

/** Rastro de huellas que camina (sala de espera, cargas). */
export function PawTrail({ count = 7, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex items-end gap-3', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className={cn('text-uap-gold', i % 2 ? 'translate-y-2' : '-translate-y-1')}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.9, 0.9, 0], scale: [0.6, 1, 1, 0.9] }}
          transition={{ duration: count * 0.35 + 1.2, delay: i * 0.35, repeat: Infinity, repeatDelay: 0.4, times: [0, 0.12, 0.7, 1] }}
        >
          <Paw className="size-7" style={{ transform: `rotate(${i % 2 ? 100 : 80}deg)` }} />
        </motion.span>
      ))}
    </div>
  )
}
