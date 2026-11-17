import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-ink-soft">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        className={cn(
          'h-12 w-full rounded-2xl border-2 border-line bg-surface-2 px-4 text-base text-ink',
          'placeholder:text-ink-soft/60 transition-colors outline-none',
          'focus:border-uap-blue dark:focus:border-game-electric',
          error && 'border-uap-red focus:border-uap-red',
          className,
        )}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${inputId}-msg`} className={cn('text-sm', error ? 'text-uap-red dark:text-game-coral' : 'text-ink-soft')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})
