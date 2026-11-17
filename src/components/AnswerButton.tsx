import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { ANSWER_STYLES } from '../lib/brand'
import { cn } from '../lib/cn'
import { Shape } from './Shape'

interface Props {
  index: number
  text: string
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  disabled?: boolean
}

/** Botón grande de respuesta: color + forma + tecla (1-4). */
export function AnswerButton({ index, text, selected, dimmed, onClick, disabled }: Props) {
  const s = ANSWER_STYLES[index % ANSWER_STYLES.length]
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: dimmed ? 0.35 : 1, y: 0, scale: selected ? 1.02 : 1 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 380, damping: 26 }}
      aria-keyshortcuts={s.key}
      aria-label={`${s.label}: ${text}`}
      className={cn(
        'btn-3d group flex min-h-24 w-full items-center gap-4 rounded-3xl p-4 text-left sm:min-h-28 sm:p-5',
        s.bg,
        s.text,
        selected && 'ring-4 ring-white/80 ring-offset-2 ring-offset-transparent',
      )}
      style={{ '--btn-edge': s.edge } as CSSProperties}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/15 sm:size-14">
        <Shape shape={s.shape} className="size-7 drop-shadow sm:size-8" />
      </span>
      <span className="flex-1 font-display text-lg font-bold leading-snug sm:text-xl">{text}</span>
      <kbd className="hidden rounded-lg bg-black/15 px-2 py-1 font-display text-sm font-bold sm:block">{s.key}</kbd>
    </motion.button>
  )
}
