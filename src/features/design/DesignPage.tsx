import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Flame, PartyPopper, Timer, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { AnswerButton } from '../../components/AnswerButton'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card, SolidCard } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'

const INSTITUTIONAL = [
  { name: 'Azul UAP', hex: '#1F3864', cls: 'bg-uap-blue' },
  { name: 'Rojo UAP', hex: '#8B1A1A', cls: 'bg-uap-red' },
  { name: 'Verde escudo', hex: '#1B7339', cls: 'bg-uap-green' },
  { name: 'Oro escudo', hex: '#C9A23A', cls: 'bg-uap-gold' },
  { name: 'Plomo', hex: '#4D4D4D', cls: 'bg-uap-gray' },
  { name: 'Plomo bajo', hex: '#767676', cls: 'bg-uap-gray-soft' },
]
const GAME = [
  { name: 'Coral', hex: '#FF3355', cls: 'bg-game-coral' },
  { name: 'Eléctrico', hex: '#2D7DFF', cls: 'bg-game-electric' },
  { name: 'Mango', hex: '#FFB800', cls: 'bg-game-mango' },
  { name: 'Selva', hex: '#1DBF73', cls: 'bg-game-selva' },
  { name: 'Violeta', hex: '#7C3AED', cls: 'bg-game-violet' },
  { name: 'Turquesa', hex: '#14B8A6', cls: 'bg-game-teal' },
]
const DEMO_OPTIONS = ['Cobija', 'Riberalta', 'Trinidad', 'Puerto Rico']

export function DesignPage() {
  const toast = useToast()
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 4 && !(e.target instanceof HTMLInputElement)) setSelected(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const celebrate = () => {
    const colors = ['#1B7339', '#C9A23A', '#1F3864', '#FF3355', '#2D7DFF', '#FFB800']
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, colors })
    window.setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors }), 200)
    window.setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors }), 350)
  }

  return (
    <div className="relative min-h-dvh pb-16">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto mt-8 flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-uap-green dark:text-game-selva">Fase 0</p>
          <h1 className="font-display text-4xl font-black text-uap-blue sm:text-5xl dark:text-white">Sistema de diseño</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Identidad UAP + energía de juego. Esta página sirve para revisar colores, tipografía y componentes antes de
            construir el resto del sistema.
          </p>
        </header>

        {/* Paletas */}
        <section className="grid gap-6 md:grid-cols-2">
          <Palette title="Institucional UAP" subtitle="Panel docente, reportes, PDF y botones principales" colors={INSTITUTIONAL} />
          <Palette title="Paleta de juego" subtitle="Respuestas, celebraciones y acentos" colors={GAME} />
        </section>

        {/* Tipografía + botones (bento) */}
        <section className="grid gap-6 lg:grid-cols-3">
          <SolidCard className="lg:col-span-1">
            <h2 className="mb-4 font-display text-xl font-bold">Tipografía</h2>
            <p className="font-display text-5xl font-black leading-none text-uap-blue dark:text-white">Outfit</p>
            <p className="mt-1 text-sm text-ink-soft">Títulos — gruesa y amigable</p>
            <p className="mt-5 text-2xl">Inter</p>
            <p className="text-sm text-ink-soft">Textos — muy legible en pantallas</p>
            <p className="mt-5 font-display text-7xl font-black tabular-nums text-uap-green dark:text-game-selva">874</p>
            <p className="text-sm text-ink-soft">Cifras grandes para el proyector</p>
          </SolidCard>

          <SolidCard className="lg:col-span-2">
            <h2 className="mb-4 font-display text-xl font-bold">Botones 3D (se hunden al presionar)</h2>
            <div className="flex flex-wrap gap-4">
              <Button onClick={() => toast.info('Botón principal', 'Azul institucional UAP')}>Principal</Button>
              <Button variant="success" onClick={() => toast.success('¡Guardado ✓!', 'Así se ven los avisos de éxito')}>
                Guardar
              </Button>
              <Button variant="danger" onClick={() => toast.error('Algo salió mal', 'Así se ven los avisos de error')}>
                Eliminar
              </Button>
              <Button variant="gold" onClick={celebrate}>
                <PartyPopper className="size-5" /> Celebrar
              </Button>
              <Button variant="secondary">Secundario</Button>
              <Button variant="ghost">Fantasma</Button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Input label="Código universitario (RU)" placeholder="Ej. 2021-0453" hint="Lo usarás para identificarte" />
              <Input label="Carnet de identidad (CI)" placeholder="Ej. 1234567" error="Este CI no está inscrito en la asignatura" />
            </div>
          </SolidCard>
        </section>

        {/* Vista de pregunta */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">Vista previa: pregunta del estudiante</h2>
          <Card className="p-5 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <span className="rounded-full bg-uap-blue px-4 py-1.5 font-display text-sm font-bold text-white">
                Pregunta 3 de 10
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 rounded-full bg-game-mango/20 px-3 py-1.5 text-sm font-bold text-[#7a5200] dark:text-game-mango">
                  <Flame className="size-4" /> Racha 3
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-uap-green/15 px-3 py-1.5 text-sm font-bold text-uap-green dark:text-game-selva">
                  <Trophy className="size-4" /> 2.340 pts
                </span>
                <CountdownRing seconds={20} />
              </div>
            </div>
            <h3 className="mb-6 text-center font-display text-2xl font-extrabold sm:text-3xl">
              ¿Cuál es la capital del departamento de Pando?
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {DEMO_OPTIONS.map((t, i) => (
                <AnswerButton
                  key={t}
                  index={i}
                  text={t}
                  selected={selected === i}
                  dimmed={selected !== null && selected !== i}
                  onClick={() => setSelected(i)}
                />
              ))}
            </div>
            <p className="mt-5 text-center text-sm text-ink-soft">
              Prueba también con las teclas <kbd className="rounded bg-ink/10 px-1.5">1</kbd>–
              <kbd className="rounded bg-ink/10 px-1.5">4</kbd>. Cada opción tiene color <em>y</em> forma (apto para
              daltonismo).
            </p>
            {selected !== null && (
              <div className="mt-4 text-center">
                <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
                  Reiniciar
                </Button>
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  )
}

function Palette({ title, subtitle, colors }: { title: string; subtitle: string; colors: typeof GAME }) {
  return (
    <SolidCard>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="mb-4 text-sm text-ink-soft">{subtitle}</p>
      <div className="grid grid-cols-3 gap-3">
        {colors.map((c, i) => (
          <motion.div
            key={c.hex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="overflow-hidden rounded-2xl border border-line"
          >
            <div className={`${c.cls} h-16`} />
            <div className="bg-surface-2 px-3 py-2">
              <p className="text-sm font-semibold">{c.name}</p>
              <p className="font-mono text-xs text-ink-soft">{c.hex}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </SolidCard>
  )
}

/** Cronómetro circular de demostración (en la Fase 4 usará la hora del servidor). */
function CountdownRing({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => (l <= 0 ? seconds : l - 1)), 1000)
    return () => window.clearInterval(id)
  }, [seconds])
  const r = 20
  const c = 2 * Math.PI * r
  const pct = left / seconds
  const urgent = left <= 5
  return (
    <div className="relative grid size-14 place-items-center" aria-label={`Quedan ${left} segundos`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} className="fill-none stroke-ink/10" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          className={`fill-none transition-[stroke-dashoffset] duration-1000 ease-linear ${urgent ? 'stroke-game-coral' : 'stroke-uap-green dark:stroke-game-selva'}`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className={`flex items-center font-display text-lg font-black tabular-nums ${urgent ? 'text-game-coral' : ''}`}>
        {left}
      </span>
      <Timer className="sr-only" />
    </div>
  )
}
