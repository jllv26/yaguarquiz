import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'gold' | 'ghost'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const VARIANTS: Record<Variant, { cls: string; edge?: string }> = {
  primary: { cls: 'bg-uap-blue text-white', edge: '#0d1a33' },
  secondary: { cls: 'bg-surface-2 text-ink border border-line', edge: 'rgb(20 33 61 / 0.18)' },
  success: { cls: 'bg-uap-green text-white', edge: '#0f4a24' },
  danger: { cls: 'bg-uap-red text-white', edge: '#5a0f0f' },
  gold: { cls: 'bg-uap-gold text-uap-blue-900', edge: '#8f7020' },
  ghost: { cls: 'bg-transparent text-ink hover:bg-ink/5 !shadow-none' },
}

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm rounded-xl',
  md: 'h-12 px-6 text-base rounded-2xl',
  lg: 'h-14 px-8 text-lg rounded-2xl',
  xl: 'h-16 px-10 text-xl rounded-3xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, className, style, children, ...rest },
  ref,
) {
  const v = VARIANTS[variant]
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-display font-bold tracking-tight',
        variant !== 'ghost' && 'btn-3d',
        v.cls,
        SIZES[size],
        block && 'w-full',
        className,
      )}
      style={{ ...(v.edge ? ({ '--btn-edge': v.edge } as CSSProperties) : {}), ...style }}
      {...rest}
    >
      {children}
    </button>
  )
})
