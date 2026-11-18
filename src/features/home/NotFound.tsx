import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Card } from '../../components/ui/Card'
import { JaguarFace } from '../../components/jaguar/JaguarFace'

export function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4">
        <Card className="w-full text-center">
          <JaguarFace mood="wow" className="mx-auto w-32" />
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
