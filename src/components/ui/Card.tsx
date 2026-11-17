import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-3xl p-6', className)} {...rest} />
}

export function SolidCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-3xl border border-line bg-surface-2 p-6 shadow-[0_10px_30px_-18px_rgb(13_26_51/0.35)]', className)}
      {...rest}
    />
  )
}
