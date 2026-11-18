import { motion } from 'framer-motion'
import { ArrowRight, GraduationCap, PawPrint, QrCode } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { TopBar } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import { useLook } from '../../components/jaguar/useLook'
import { JaguarIntro } from '../../components/jaguar/JaguarIntro'

const INTRO_KEY = 'yq-intro-seen'
function introPending() {
  try {
    return !sessionStorage.getItem(INTRO_KEY)
  } catch {
    return false
  }
}

const PIN_LENGTH = 6
const YEAR = new Date().getFullYear()

export function HomePage() {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [shake, setShake] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const navigate = useNavigate()
  const toast = useToast()
  const { ref: mascotRef, look } = useLook<HTMLDivElement>()
  const [intro, setIntro] = useState(introPending)
  const [roar, setRoar] = useState(false)
  const endIntro = () => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
    setIntro(false)
  }
  const onLanded = () => {
    setRoar(true)
    window.setTimeout(() => setRoar(false), 1600)
  }

  const pin = digits.join('')
  const complete = pin.length === PIN_LENGTH

  const setAt = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = d
      return next
    })
    if (d && i < PIN_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < PIN_LENGTH - 1) refs.current[i + 1]?.focus()
    if (e.key === 'Enter') submit()
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (!text) return
    e.preventDefault()
    const next = Array(PIN_LENGTH).fill('')
    text.split('').forEach((c, i) => (next[i] = c))
    setDigits(next)
    refs.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus()
  }

  function submit() {
    if (!complete) {
      setShake(true)
      window.setTimeout(() => setShake(false), 500)
      toast.error('PIN incompleto', 'El PIN tiene 6 dígitos. Míralo en la pantalla del proyector.')
      return
    }
    navigate(`/play/${pin}`)
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground />
      {intro && <JaguarIntro onDone={endIntro} onLanded={onLanded} />}
      <TopBar
        right={
          <Link
            to="/admin"
            className="glass hidden h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] sm:flex"
          >
            <GraduationCap className="size-4" /> Soy docente
          </Link>
        }
      />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        {/* Columna de marca */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center lg:text-left"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-uap-gold/40 bg-uap-gold/15 px-4 py-1.5 text-sm font-semibold text-[#7a5e12] dark:text-uap-gold-300">
            <PawPrint className="size-4" /> {BRAND.slogan}
          </div>

          <h1 className="font-display text-5xl font-black leading-[0.95] text-uap-blue sm:text-6xl lg:text-7xl dark:text-white">
            Aprende,
            <br />
            <span className="bg-gradient-to-r from-uap-green via-game-teal to-game-electric bg-clip-text text-transparent">
              compite
            </span>{' '}
            y <span className="text-uap-red dark:text-game-coral">brilla.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-lg text-ink-soft lg:mx-0">
            La plataforma de evaluaciones gamificadas de la{' '}
            <strong className="text-ink">{BRAND.institution}</strong>. Escribe el PIN que ves en el proyector y demuestra lo
            que sabes.
          </p>

          <div className="mt-8 hidden items-center gap-4 lg:flex">
            <motion.img
              src={BRAND.logoColor}
              alt="Escudo de la Universidad Amazónica de Pando"
              className="w-24 drop-shadow-xl"
              initial={{ rotate: -8, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 10, delay: 0.3 }}
            />
            <div className="text-sm leading-relaxed text-ink-soft">
              <p className="font-display text-base font-bold text-ink">{BRAND.institution}</p>
              <p>{BRAND.city}</p>
            </div>
          </div>
        </motion.section>

        {/* Tarjeta de ingreso */}
        <motion.section
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        >
          {/* Yaguar asoma por encima de la tarjeta y sigue el cursor con la mirada */}
          <div ref={mascotRef} className="relative z-10 -mb-12 flex justify-center">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 160, damping: 12 }}
              whileHover={{ rotate: [0, -6, 6, 0], transition: { duration: 0.5 } }}
            >
              <JaguarFace mood={shake ? 'sad' : complete || roar ? 'happy' : pin.length > 0 ? 'wow' : 'neutral'} look={look} className="w-28 drop-shadow-xl sm:w-32" />
            </motion.div>
          </div>
          <Card className="relative overflow-hidden p-6 pt-14 sm:p-8 sm:pt-16">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-uap-blue via-uap-green to-uap-gold" />
            <h2 className="text-center font-display text-2xl font-extrabold text-ink sm:text-3xl">Únete a la partida</h2>
            <p className="mt-1 text-center text-ink-soft">Ingresa el PIN de 6 dígitos</p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className="mt-7"
            >
              <motion.div
                animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.45 }}
                className="flex justify-center gap-2 sm:gap-3"
                role="group"
                aria-label="PIN de la sesión"
              >
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      refs.current[i] = el
                    }}
                    value={d}
                    onChange={(e) => setAt(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onPaste={onPaste}
                    onFocus={(e) => e.target.select()}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    autoFocus={i === 0}
                    aria-label={`Dígito ${i + 1} del PIN`}
                    className={cn(
                      'h-14 w-11 rounded-2xl border-2 bg-surface-2 text-center font-display text-3xl font-extrabold text-ink outline-none transition-all sm:h-16 sm:w-13',
                      'focus:-translate-y-0.5 focus:border-uap-green focus:shadow-[0_8px_20px_-8px_rgb(27_115_57/0.6)]',
                      d ? 'border-uap-blue/40 dark:border-game-electric/50' : 'border-line',
                    )}
                  />
                ))}
              </motion.div>

              <Button type="submit" variant="success" size="xl" block className="mt-7" disabled={!complete}>
                Entrar <ArrowRight className="size-6" />
              </Button>
            </form>

            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-uap-blue/5 p-3 text-sm text-ink-soft dark:bg-white/5">
              <QrCode className="size-8 shrink-0 text-uap-blue dark:text-game-electric" />
              <p>
                ¿Tienes celular? <strong className="text-ink">Escanea el código QR</strong> del proyector y entrarás
                directo.
              </p>
            </div>

            <Link
              to="/admin"
              className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink sm:hidden"
            >
              <GraduationCap className="size-4" /> Soy docente
            </Link>
          </Card>
        </motion.section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs text-ink-soft sm:px-6">
        © {YEAR} {BRAND.institution} · {BRAND.teacher} ·{' '}
        <Link to="/diseno" className="underline-offset-2 hover:underline">
          Sistema de diseño
        </Link>
      </footer>
    </div>
  )
}
