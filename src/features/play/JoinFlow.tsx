import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, LogIn, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { joinSession, lookupStudent, PLAY_ERRORS, deviceId, type Avatar } from '../../lib/api/live'
import { ANIMALS, AVATAR_COLORS, randomAvatar } from '../../lib/avatars'
import { cn } from '../../lib/cn'
import { AvatarBubble } from '../live/LiveBits'

interface Info {
  identification: 'roster' | 'nickname'
  require_ci: boolean
  quiz_title: string
  subject: string
}

type Step = 'code' | 'confirm' | 'nickname' | 'avatar'

/** Pasos para entrar a la sesión: RU → "¿Eres…?" (+CI) → avatar, o apodo → avatar. */
export function JoinFlow({ pin, info, onJoined }: { pin: string; info: Info; onJoined: (token: string) => void }) {
  const roster = info.identification === 'roster'
  const [step, setStep] = useState<Step>(roster ? 'code' : 'nickname')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [ci, setCi] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState<Avatar>(() => randomAvatar())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message || 'Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const lookup = () =>
    run(async () => {
      const r = await lookupStudent(pin, code)
      if (!r.ok) return setError(PLAY_ERRORS[r.error] ?? 'No se pudo verificar el RU.')
      setName(r.name)
      setStep('confirm')
    })

  const join = () =>
    run(async () => {
      const r = await joinSession({ pin, code: roster ? code : undefined, ci: roster ? ci : undefined, nickname: roster ? undefined : nickname, avatar, device: deviceId() })
      if (!r.ok) {
        setError(PLAY_ERRORS[r.error] ?? 'No se pudo entrar.')
        if (r.error === 'ci') setStep('confirm')
        if (r.error.startsWith('nickname')) setStep('nickname')
        return
      }
      onJoined(r.token)
    })

  return (
    <Card className="w-full max-w-md">
      <p className="text-center text-xs font-bold uppercase tracking-wider text-ink-soft">{info.subject}</p>
      <h1 className="mb-5 text-center font-display text-2xl font-black leading-tight">{info.quiz_title}</h1>

      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
        {step === 'code' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) void lookup()
            }}
          >
            <Input label="Tu RU (registro universitario)" value={code} onChange={(e) => setCode(e.target.value)} inputMode="text" autoComplete="off" autoFocus placeholder="Ej.: 202312345" />
            <Button size="lg" type="submit" disabled={!code.trim() || busy}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />} Continuar
            </Button>
          </form>
        )}

        {step === 'confirm' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setStep('avatar')
            }}
          >
            <div className="rounded-2xl bg-uap-green/10 p-4 text-center">
              <p className="text-sm text-ink-soft">¿Eres tú?</p>
              <p className="font-display text-xl font-extrabold">{name}</p>
            </div>
            {info.require_ci && (
              <Input
                label="Últimos 3 dígitos de tu CI"
                value={ci}
                onChange={(e) => setCi(e.target.value.replace(/\D/g, '').slice(0, 3))}
                inputMode="numeric"
                autoFocus
                placeholder="• • •"
                className="text-center font-display text-2xl tracking-[0.5em]"
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep('code')
                  setCi('')
                }}
              >
                <ArrowLeft className="size-4" /> No soy yo
              </Button>
              <Button type="submit" className="flex-1" disabled={info.require_ci && ci.length !== 3}>
                Sí, soy yo <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        )}

        {step === 'nickname' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (nickname.trim().length >= 2) setStep('avatar')
            }}
          >
            <Input label="Tu apodo" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 20))} autoFocus autoComplete="off" placeholder="Ej.: Yaguar Veloz" />
            <Button size="lg" type="submit" disabled={nickname.trim().length < 2}>
              Continuar <ArrowRight className="size-5" />
            </Button>
          </form>
        )}

        {step === 'avatar' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-3">
              <AvatarBubble avatar={avatar} size="lg" />
              <Button variant="secondary" size="sm" onClick={() => setAvatar(randomAvatar())} aria-label="Avatar al azar">
                <Shuffle className="size-4" /> Al azar
              </Button>
            </div>
            <p className="text-center text-sm font-semibold text-ink-soft">Elige tu animal y color</p>
            <div className="grid grid-cols-8 gap-1.5">
              {ANIMALS.map((a) => (
                <button
                  key={a.emoji}
                  type="button"
                  title={a.name}
                  aria-label={a.name}
                  onClick={() => setAvatar({ ...avatar, animal: a.emoji })}
                  className={cn('grid aspect-square place-items-center rounded-xl text-2xl transition', avatar.animal === a.emoji ? 'bg-uap-gold/40 ring-2 ring-uap-gold' : 'hover:bg-ink/5')}
                >
                  {a.emoji}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setAvatar({ ...avatar, color: c })}
                  className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface transition', avatar.color === c && 'ring-2 ring-ink')}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(roster ? 'confirm' : 'nickname')}>
                <ArrowLeft className="size-4" />
              </Button>
              <Button size="lg" variant="success" className="flex-1" onClick={() => void join()} disabled={busy}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />} ¡Entrar al juego!
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-uap-red/10 px-4 py-3 text-center font-semibold text-uap-red dark:text-game-coral">
            {error}
          </p>
        )}
      </motion.div>
    </Card>
  )
}
