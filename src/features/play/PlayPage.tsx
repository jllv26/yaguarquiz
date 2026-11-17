import { ArrowLeft, Hourglass } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Card } from '../../components/ui/Card'

/** Marcador de posición: la conexión real con la sesión llega en la Fase 4. */
export function PlayPage() {
  const { pin } = useParams()
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground />
      <TopBar />
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4">
        <Card className="w-full text-center">
          <Hourglass className="mx-auto mb-3 size-12 text-uap-gold" />
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-soft">PIN</p>
          <p className="font-display text-5xl font-black tracking-[0.2em] text-uap-blue dark:text-white">{pin}</p>
          <p className="mt-4 text-ink-soft">
            Las partidas en vivo estarán disponibles muy pronto. Aquí elegirás tu nombre de la lista y tu avatar.
          </p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 font-semibold text-uap-green dark:text-game-selva">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Card>
      </main>
    </div>
  )
}
