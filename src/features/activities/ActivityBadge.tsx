import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { ACTIVITY_META, type ActivityType } from './types'

/**
 * Imágenes ilustradas de cada tipo de actividad (public/arte/actividades/<tipo>.webp).
 * Se agregan aquí cuando el docente entrega las imágenes; mientras tanto se usa el ícono de color.
 */
export const ACTIVITY_ART: Partial<Record<ActivityType, string>> = {}

const SIZES = {
  sm: { box: 'size-9 rounded-xl', icon: 'size-5' },
  md: { box: 'size-12 rounded-2xl', icon: 'size-6' },
  lg: { box: 'size-16 rounded-2xl', icon: 'size-8' },
}

/** Insignia del tipo de actividad: imagen ilustrada si existe, si no el ícono sobre su color. Se mueve al pasar o tocar. */
export function ActivityBadge({ type, size = 'md', className, playful = true }: { type: ActivityType; size?: keyof typeof SIZES; className?: string; playful?: boolean }) {
  const m = ACTIVITY_META[type]
  const sz = SIZES[size]
  const art = ACTIVITY_ART[type]
  const motionProps = playful ? { whileHover: { rotate: [0, -8, 6, 0], scale: 1.08 }, whileTap: { scale: 0.9 }, transition: { duration: 0.45 } } : {}
  if (art)
    return (
      <motion.img
        {...motionProps}
        src={`${import.meta.env.BASE_URL}${art}`}
        alt=""
        draggable={false}
        className={cn('shrink-0 bg-white object-cover shadow-md ring-1 ring-black/5', sz.box, className)}
      />
    )
  const Icon = m.icon
  return (
    <motion.span {...motionProps} className={cn('relative grid shrink-0 place-items-center overflow-hidden text-white shadow-md', sz.box, className)} style={{ background: `linear-gradient(145deg, ${m.color}, color-mix(in srgb, ${m.color} 70%, #000))` }}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/15" aria-hidden />
      <Icon className={cn('relative drop-shadow', sz.icon)} />
    </motion.span>
  )
}
