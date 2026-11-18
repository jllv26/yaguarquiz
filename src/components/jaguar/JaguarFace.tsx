import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { cn } from '../../lib/cn'
import { JAGUAR, preloadImages } from './assets'

export type JaguarMood = 'neutral' | 'happy' | 'wow' | 'sad' | 'wink'

const SRC: Record<JaguarMood, string> = {
  neutral: JAGUAR.seria,
  happy: JAGUAR.rugido,
  wow: JAGUAR.alerta,
  sad: JAGUAR.triste,
  wink: JAGUAR.guino,
}

let preloaded = false

/**
 * Mascota de YaguarQuiz: rostro de jaguar en estilo marcador geométrico.
 * Cada ánimo es una imagen: serio (normal), "happy" = ruge, "wow" = alerta, "sad" = decepcionado, guiño.
 * look (-1..1) inclina un poco la cabeza hacia donde está el cursor.
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
  useEffect(() => {
    if (preloaded) return
    preloaded = true
    preloadImages(Object.values(SRC))
  }, [])

  const rx = Math.max(-1, Math.min(1, look.y)) * -8
  const ry = Math.max(-1, Math.min(1, look.x)) * 10

  return (
    <div className={cn('relative aspect-square select-none [perspective:600px]', className)} role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      <motion.div className="absolute inset-0" animate={{ rotateX: rx, rotateY: ry }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <AnimatePresence initial={false}>
          <motion.img
            key={mood}
            src={SRC[mood]}
            alt=""
            draggable={false}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
            initial={{ opacity: 0, scale: mood === 'happy' ? 0.9 : 0.97 }}
            animate={
              mood === 'happy'
                ? { opacity: 1, scale: [0.9, 1.08, 1], rotate: [0, -3, 3, 0] }
                : mood === 'sad'
                  ? { opacity: 1, scale: 1, y: [0, 4, 2] }
                  : { opacity: 1, scale: 1, y: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: mood === 'happy' ? 0.45 : 0.25 }}
          />
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
