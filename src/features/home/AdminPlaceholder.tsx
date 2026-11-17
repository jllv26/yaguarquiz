import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Card } from '../../components/ui/Card'

/** El login real del docente (Supabase Auth) se construye en la Fase 1. */
export function AdminPlaceholder() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4">
        <Card className="w-full text-center">
          <LockKeyhole className="mx-auto mb-3 size-12 text-uap-blue dark:text-game-electric" />
          <h1 className="font-display text-3xl font-extrabold">Panel docente</h1>
          <p className="mt-3 text-ink-soft">El inicio de sesión del docente se habilita en la Fase 1.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 font-semibold text-uap-green dark:text-game-selva">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Card>
      </main>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4">
        <Card className="w-full text-center">
          <p className="font-display text-7xl font-black text-uap-red dark:text-game-coral">404</p>
          <p className="mt-2 text-ink-soft">Esta página se perdió en la selva.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 font-semibold text-uap-green dark:text-game-selva">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Card>
      </main>
    </div>
  )
}
