import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Flame, Medal } from 'lucide-react'
import type { Avatar, LeaderRow } from '../../lib/api/live'
import { cn } from '../../lib/cn'

export function AvatarBubble({ avatar, size = 'md', className }: { avatar?: Avatar; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sz = { sm: 'size-9 text-xl', md: 'size-12 text-2xl', lg: 'size-20 text-5xl', xl: 'size-28 text-7xl' }[size]
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full shadow-md ring-2 ring-white/70', sz, className)}
      style={{ background: avatar?.color ?? '#1B7339' }}
      aria-hidden
    >
      <span className="drop-shadow">{avatar?.animal ?? '🐆'}</span>
    </span>
  )
}

/** Cuenta regresiva grande 3‑2‑1. */
export function BigCountdown({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      {label && <p className="font-display text-2xl font-bold text-ink-soft">{label}</p>}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={value}
          initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="grid size-44 place-items-center rounded-full bg-uap-gold font-display text-8xl font-black text-uap-blue-900 shadow-2xl sm:size-56 sm:text-9xl"
        >
          {value > 0 ? value : '¡Ya!'}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Ranking animado (las filas se reacomodan solas). */
export function Leaderboard({ rows, highlight, big }: { rows: LeaderRow[]; highlight?: string; big?: boolean }) {
  return (
    <ol className="flex w-full flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {rows.map((r, i) => (
          <motion.li
            key={r.id}
            layout
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, delay: i * 0.05 }}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-4 shadow-md',
              big ? 'py-3' : 'py-2',
              r.id === highlight ? 'bg-uap-gold text-uap-blue-900' : i === 0 ? 'bg-uap-blue text-white' : 'bg-surface-2',
            )}
          >
            <span className={cn('w-8 text-center font-display font-black tabular-nums', big ? 'text-2xl' : 'text-lg')}>{r.rank}</span>
            <AvatarBubble avatar={r.avatar} size={big ? 'md' : 'sm'} />
            <span className={cn('min-w-0 flex-1 truncate font-display font-bold', big ? 'text-2xl' : 'text-lg')}>{r.nickname}</span>
            {r.streak >= 2 && (
              <span className="flex items-center gap-0.5 rounded-full bg-game-coral/90 px-2 py-0.5 text-sm font-bold text-white" title="Racha">
                <Flame className="size-4" /> {r.streak}
              </span>
            )}
            <span className={cn('font-display font-black tabular-nums', big ? 'text-2xl' : 'text-lg')}>{r.score.toLocaleString('es-BO')}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

/** Podio final con los 3 primeros. */
export function Podium({ rows }: { rows: LeaderRow[] }) {
  const top = [rows[1], rows[0], rows[2]]
  const h = ['h-40', 'h-56', 'h-28']
  const bg = ['bg-[#b8c2cc]', 'bg-uap-gold', 'bg-[#c98a4b]']
  const place = [2, 1, 3]
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {top.map((r, i) =>
        r ? (
          <motion.div
            key={r.id}
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: [1.2, 2.2, 0.4][i], type: 'spring', stiffness: 120, damping: 14 }}
            className="flex w-28 flex-col items-center gap-2 sm:w-44"
          >
            {place[i] === 1 && <Crown className="size-10 text-uap-gold drop-shadow" />}
            <AvatarBubble avatar={r.avatar} size={place[i] === 1 ? 'xl' : 'lg'} />
            <p className="w-full truncate text-center font-display text-lg font-extrabold sm:text-2xl">{r.nickname}</p>
            <p className="font-display font-bold tabular-nums text-ink-soft">{r.score.toLocaleString('es-BO')} pts</p>
            <div className={cn('flex w-full flex-col items-center justify-start rounded-t-3xl pt-3 shadow-xl', h[i], bg[i])}>
              <Medal className="size-8 text-white drop-shadow" />
              <span className="font-display text-5xl font-black text-white drop-shadow">{place[i]}</span>
            </div>
          </motion.div>
        ) : (
          <div key={i} className="w-28 sm:w-44" />
        ),
      )}
    </div>
  )
}
