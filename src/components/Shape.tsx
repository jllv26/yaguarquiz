import type { AnswerShape } from '../lib/brand'

/** Formas de las respuestas (triángulo, rombo, círculo, cuadrado). */
export function Shape({ shape, className }: { shape: AnswerShape; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden fill="currentColor">
      {shape === 'triangle' && <path d="M20 5 L36 33 H4 Z" />}
      {shape === 'diamond' && <path d="M20 3 L37 20 L20 37 L3 20 Z" />}
      {shape === 'circle' && <circle cx="20" cy="20" r="16" />}
      {shape === 'square' && <rect x="6" y="6" width="28" height="28" rx="3" />}
    </svg>
  )
}
