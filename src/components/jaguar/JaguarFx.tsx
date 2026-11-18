import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { cn } from '../../lib/cn'
import { JAGUAR, preloadImages } from './assets'

let fxPreloaded = false
function usePreloadFx() {
  useEffect(() => {
    if (fxPreloaded) return
    fxPreloaded = true
    preloadImages([JAGUAR.rayo, JAGUAR.zarpazo, JAGUAR.salto])
  }, [])
}

/** Chispas doradas que salen disparadas desde el centro. */
function Sparks({ n = 22, seed = 1 }: { n?: number; seed?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const r = (k: number) => ((Math.sin((i + 1) * 12.9898 * (k + seed)) * 43758.5453) % 1 + 1) % 1
        const ang = r(1) * Math.PI * 2
        const dist = 18 + r(2) * 32
        return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, s: 3 + r(3) * 6, d: r(4) * 0.15, shard: r(5) > 0.55 }
      }),
    [n, seed],
  )
  return (
    <>
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className={cn('absolute left-1/2 top-1/2 block', p.shard ? 'bg-[#E9A43A]' : 'rounded-full bg-[#FFE27A] shadow-[0_0_10px_3px_rgba(255,214,90,.8)]')}
          style={{ width: p.s, height: p.shard ? p.s * 1.6 : p.s, clipPath: p.shard ? 'polygon(50% 0,100% 100%,0 70%)' : undefined }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
          animate={{ x: `${p.x}vmin`, y: `${p.y}vmin`, opacity: [0, 1, 0], rotate: p.shard ? 220 : 0 }}
          transition={{ duration: 0.9, delay: 0.12 + p.d, ease: 'easeOut' }}
        />
      ))}
    </>
  )
}

/**
 * Efectos eléctricos del jaguar (pantalla completa, ~1,4 s):
 *  - "dash"  (por defecto, "¡Ya!"): el jaguar con rayos cruza la pantalla.
 *  - "claw"  (tone green, acierto): tres zarpazos eléctricos rasgan la pantalla.
 *  - "leap"  (ranking): el jaguar salta de lado a lado.
 * Cambie `playKey` para repetir. Las imágenes tienen fondo negro y se mezclan en modo "screen".
 */
export function ClawSwipe({
  playKey,
  label,
  tone = 'gold',
  kind,
}: {
  playKey: string | number | null
  label?: string
  tone?: 'gold' | 'green'
  kind?: 'dash' | 'claw' | 'leap'
}) {
  usePreloadFx()
  const k = kind ?? (tone === 'green' ? 'claw' : 'dash')
  return (
    <AnimatePresence>
      {playKey !== null && (
        <motion.div
          key={playKey}
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 1, 0] }}
          transition={{ duration: 1.6, times: [0, 0.72, 1] }}
          aria-hidden
        >
          {/* oscurece el fondo un instante (flash) */}
          <motion.div
            className="absolute inset-0 bg-[#05070d]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.78, 0.7] }}
            transition={{ duration: 0.35 }}
          />
          <motion.div
            className="absolute inset-0 bg-white mix-blend-overlay"
            initial={{ opacity: 0.0 }}
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{ duration: 0.3, delay: k === 'claw' ? 0.18 : 0.28 }}
          />

          {k === 'claw' && (
            <motion.img
              src={JAGUAR.zarpazo}
              alt=""
              className="absolute w-[min(130vw,1500px)] max-w-none mix-blend-screen"
              initial={{ clipPath: 'inset(0 0 100% 100%)', scale: 1.15, rotate: -2 }}
              animate={{ clipPath: 'inset(0 0 0% 0%)', scale: 1, rotate: 0, x: [0, -8, 6, -3, 0] }}
              transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1], x: { delay: 0.3, duration: 0.3 } }}
            />
          )}
          {k === 'dash' && (
            <motion.img
              src={JAGUAR.rayo}
              alt=""
              className="absolute w-[min(120vw,1400px)] max-w-none mix-blend-screen"
              initial={{ x: '-75vw', filter: 'blur(14px)', scale: 0.92 }}
              animate={{ x: ['-75vw', '0vw', '6vw', '85vw'], filter: ['blur(14px)', 'blur(0px)', 'blur(0px)', 'blur(12px)'], scale: [0.92, 1, 1.02, 1] }}
              transition={{ duration: 1.45, times: [0, 0.22, 0.7, 1], ease: 'easeInOut' }}
            />
          )}
          {k === 'leap' && (
            <motion.img
              src={JAGUAR.salto}
              alt=""
              className="absolute w-[min(110vw,1300px)] max-w-none mix-blend-screen"
              initial={{ x: '-90vw', y: '12vh', rotate: -6 }}
              animate={{ x: ['-90vw', '0vw', '95vw'], y: ['12vh', '-6vh', '10vh'], rotate: [-6, 0, 6] }}
              transition={{ duration: 1.4, times: [0, 0.5, 1], ease: 'easeInOut' }}
            />
          )}

          <Sparks seed={typeof playKey === 'number' ? playKey % 7 : 1} />

          {label && (
            <motion.span
              initial={{ scale: 0.3, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              transition={{ delay: k === 'claw' ? 0.32 : 0.3, type: 'spring', stiffness: 320, damping: 13 }}
              className="relative rounded-3xl border border-uap-gold/60 bg-black/55 px-7 py-3 font-display text-5xl font-black tracking-tight text-[#FFD34D] shadow-[0_0_40px_rgba(255,200,60,.45)] backdrop-blur-sm sm:text-7xl"
              style={{ textShadow: '0 0 18px rgba(255,190,40,.8)' }}
            >
              {label}
            </motion.span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Ojo de jaguar en acuarela (modo enfoque del examen). `watching`: se mueve lento, como si vigilara.
 * En tamaño muy pequeño (íconos) muestra solo el ojo recortado en un círculo.
 */
export function JaguarEye({ className, watching = true, icon = false }: { className?: string; watching?: boolean; icon?: boolean }) {
  if (icon)
    return (
      <span className={cn('inline-block aspect-square overflow-hidden rounded-full bg-[#fff8ec] ring-1 ring-uap-gold/50', className)} aria-hidden>
        <img src={JAGUAR.ojo} alt="" className="h-full w-full scale-[2.4] object-cover" style={{ objectPosition: '62% 50%' }} />
      </span>
    )
  return (
    <motion.img
      src={JAGUAR.ojo}
      alt="Ojo de jaguar vigilando"
      className={cn('select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]', className)}
      draggable={false}
      animate={watching ? { x: [-6, 6, 6, -6, -6], scale: [1, 1.03, 1.03, 1, 1] } : undefined}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

/** Huella de jaguar real (barro). */
export function Paw({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <img src={JAGUAR.huella} alt="" aria-hidden draggable={false} className={cn('select-none', className)} style={style} />
}

/** Rastro de huellas que camina (sala de espera, cargas). */
export function PawTrail({ count = 7, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex items-end gap-3', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className={cn(i % 2 ? 'translate-y-2' : '-translate-y-1')}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.85, 0.85, 0], scale: [0.6, 1, 1, 0.9] }}
          transition={{ duration: count * 0.35 + 1.2, delay: i * 0.35, repeat: Infinity, repeatDelay: 0.4, times: [0, 0.12, 0.7, 1] }}
        >
          <Paw className="size-8 dark:brightness-[1.8]" style={{ transform: `rotate(${i % 2 ? 100 : 80}deg)` }} />
        </motion.span>
      ))}
    </div>
  )
}
