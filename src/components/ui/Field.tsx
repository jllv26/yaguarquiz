import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const base =
  'w-full rounded-2xl border-2 border-line bg-surface-2 px-4 text-base text-ink outline-none transition-colors focus:border-uap-blue dark:focus:border-game-electric'

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; children: ReactNode }
>(function Select({ label, hint, className, id, children, ...rest }, ref) {
  const auto = useId()
  const sid = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={sid} className="text-sm font-semibold text-ink-soft">
          {label}
        </label>
      )}
      <select ref={ref} id={sid} className={cn(base, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(
  function Textarea({ label, className, id, ...rest }, ref) {
    const auto = useId()
    const tid = id ?? auto
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={tid} className="text-sm font-semibold text-ink-soft">
            {label}
          </label>
        )}
        <textarea ref={ref} id={tid} className={cn(base, 'min-h-24 py-3', className)} {...rest} />
      </div>
    )
  },
)

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'red' | 'gold' | 'blue' | 'violet'
  className?: string
}) {
  const tones = {
    neutral: 'bg-ink/8 text-ink-soft',
    green: 'bg-uap-green/12 text-uap-green dark:text-game-selva',
    red: 'bg-uap-red/12 text-uap-red dark:text-game-coral',
    gold: 'bg-uap-gold/18 text-[#7a5e12] dark:text-uap-gold-300',
    blue: 'bg-uap-blue/10 text-uap-blue dark:text-game-electric',
    violet: 'bg-game-violet/12 text-game-violet',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone], className)}>
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line px-6 py-12 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-uap-gold/15 text-uap-gold">{icon}</div>
      <p className="font-display text-xl font-bold">{title}</p>
      {text && <p className="max-w-md text-ink-soft">{text}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-ink/8', className)} />
}
