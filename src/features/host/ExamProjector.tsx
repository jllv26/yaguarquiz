import { AnimatePresence, motion } from 'framer-motion'
import { Maximize, Minimize, Music, VolumeX, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JaguarFace } from '../../components/jaguar/JaguarFace'
import type { MonitorState } from '../../lib/api/exam'
import { playUrl } from '../../lib/api/live'
import { BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { setMusic, setTension, sfx } from '../../lib/sound'
import { celebrate, fmtLeft } from '../live/clock'

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

/**
 * Pantalla para el proyector durante un examen: reloj gigante, cuántos están respondiendo y cuántos entregaron
 * (sin nombres) y música de suspenso que se acelera en los últimos 5 minutos. Suena solo en el proyector.
 */
export function ExamProjector({ st, now, pending = 0, onClose }: { st: MonitorState; now: number; pending?: number; onClose: () => void }) {
  const s = st.session
  const [music, setMusicOn] = useState(true)
  const [full, setFull] = useState(!!document.fullscreenElement)
  const opensMs = s.opens_at ? new Date(s.opens_at).getTime() : null
  const closesMs = s.closes_at ? new Date(s.closes_at).getTime() : null

  const data = useMemo(() => {
    const present = st.rows.filter((r) => r.participant_id && !r.kicked)
    const enrolled = st.rows.filter((r) => r.student_id || r.participant_id).length
    const progress = present.filter((r) => r.current)
    const done = present.filter((r) => !r.current && r.attempts_used > 0).length
    // tiempo que le queda a la mayoría: la mediana de los plazos de quienes están respondiendo
    const deadlines = progress
      .map((r) => (r.current?.deadline ? new Date(r.current.deadline).getTime() : closesMs))
      .filter((x): x is number => x !== null)
      .map((d) => (closesMs ? Math.min(d, closesMs) : d))
      .sort((a, b) => a - b)
    const median = deadlines.length ? deadlines[Math.floor((deadlines.length - 1) / 2)] : null
    const answered = progress.reduce((a, r) => a + (r.current?.answered ?? 0), 0)
    const total = progress.reduce((a, r) => a + (r.current?.total ?? 0), 0)
    return { enrolled, present: present.length, progress: progress.length, done, median, pct: total ? answered / total : 0 }
  }, [st.rows, closesMs])

  const phase: 'before' | 'waiting' | 'running' | 'over' =
    s.status === 'finished' || (closesMs !== null && now >= closesMs) || (data.done > 0 && data.progress === 0 && data.done >= data.present && data.present > 0)
      ? 'over'
      : opensMs !== null && now < opensMs
        ? 'before'
        : data.progress > 0
          ? 'running'
          : 'waiting'
  const left = phase === 'before' ? opensMs! - now : phase === 'running' ? Math.max(0, (data.median ?? closesMs ?? now) - now) : phase === 'waiting' && closesMs ? closesMs - now : 0
  const finalStretch = phase === 'running' && left <= 5 * 60_000
  const tension = phase === 'running' ? (left <= 5 * 60_000 ? 0.4 + 0.6 * (1 - left / 300_000) : left <= 15 * 60_000 ? 0.2 : 0) : 0

  // música de suspenso solo mientras responden (o esperan); al terminar, redoble y fanfarria
  useEffect(() => {
    setTension(tension)
  }, [tension])
  useEffect(() => {
    setMusic(music && (phase === 'running' || phase === 'waiting') ? 'suspense' : null)
  }, [music, phase])
  useEffect(() => () => setMusic(null), [])
  const prevPhase = useRef(phase)
  useEffect(() => {
    if (prevPhase.current !== 'over' && phase === 'over') {
      sfx.drumroll(1.6)
      setTimeout(() => {
        sfx.fanfare()
        celebrate(true)
      }, 1700)
    }
    if (prevPhase.current === 'before' && phase !== 'before') sfx.go()
    prevPhase.current = phase
  }, [phase])
  // aviso sonoro al entrar en los últimos 5 minutos y en el último minuto
  const warned = useRef<{ five?: boolean; one?: boolean }>({})
  useEffect(() => {
    if (phase !== 'running') return
    if (left <= 5 * 60_000 && !warned.current.five) {
      warned.current.five = true
      sfx.warning()
    }
    if (left <= 60_000 && !warned.current.one) {
      warned.current.one = true
      sfx.warning()
    }
  }, [left, phase])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && onClose()
    const f = () => setFull(!!document.fullscreenElement)
    window.addEventListener('keydown', k)
    document.addEventListener('fullscreenchange', f)
    return () => {
      window.removeEventListener('keydown', k)
      document.removeEventListener('fullscreenchange', f)
    }
  }, [onClose])
  const toggleFull = () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => null))

  const pctDone = data.present ? data.done / data.present : 0
  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col overflow-hidden text-white transition-colors duration-1000',
        finalStretch ? 'bg-[radial-gradient(ellipse_at_center,#5c0a0a_0%,#1a0505_70%)]' : 'bg-[radial-gradient(ellipse_at_center,#14325c_0%,#071226_70%)]',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Pantalla del examen para el proyector"
    >
      {/* luz que late con el reloj */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: finalStretch ? [0.15, 0.45, 0.15] : [0.05, 0.15, 0.05] }}
        transition={{ duration: finalStretch ? 0.9 : 3, repeat: Infinity }}
        style={{ background: `radial-gradient(circle at 50% 45%, ${finalStretch ? '#ff6b6b' : '#4dabf7'}55, transparent 60%)` }}
        aria-hidden
      />
      <header className="relative flex items-center gap-4 px-8 pt-6">
        <img src={BRAND.logoColor} alt="" className="size-14 rounded-2xl bg-white object-contain p-1" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">
            Examen · {s.subject?.code} · Paralelo {s.subject?.parallel}
          </p>
          <p className="truncate font-display text-3xl font-black">{s.quiz_title}</p>
        </div>
        <button type="button" onClick={() => setMusicOn((m) => !m)} className="grid size-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label={music ? 'Silenciar música' : 'Activar música'}>
          {music ? <Music className="size-6" /> : <VolumeX className="size-6" />}
        </button>
        <button type="button" onClick={toggleFull} className="grid size-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="Pantalla completa">
          {full ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
        </button>
        <button type="button" onClick={onClose} className="grid size-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="Cerrar la pantalla del proyector">
          <X className="size-6" />
        </button>
      </header>

      <AnimatePresence>
        {pending > 0 && (
          <motion.button
            type="button"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="relative mx-auto mt-3 rounded-full bg-[#ffd43b] px-5 py-2 font-bold text-[#14213d] shadow-xl"
          >
            🔁 {pending === 1 ? '1 estudiante pide' : `${pending} estudiantes piden`} cambiar de equipo · toque aquí para autorizar
          </motion.button>
        )}
      </AnimatePresence>
      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <AnimatePresence mode="wait">
          {phase === 'over' ? (
            <motion.div key="over" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4">
              <JaguarFace mood="happy" className="w-48 drop-shadow-2xl" />
              <p className="font-display text-[7rem] font-black leading-none">¡Tiempo!</p>
              <p className="text-3xl font-bold text-white/80">
                Entregaron {data.done} de {data.present} · ¡Gracias por su esfuerzo! 🐆
              </p>
            </motion.div>
          ) : (
            <motion.div key="clock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2">
              <p className="text-2xl font-bold uppercase tracking-[0.25em] text-white/70">
                {phase === 'before' ? 'El examen empieza en' : phase === 'waiting' ? '¡Ya pueden empezar!' : finalStretch ? '⚠️ Últimos minutos' : 'Tiempo que les queda'}
              </p>
              {phase !== 'waiting' && (
                <motion.p
                  key={finalStretch ? 'red' : 'blue'}
                  animate={finalStretch ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                  transition={finalStretch ? { duration: 1, repeat: Infinity } : undefined}
                  className={cn('font-display text-[min(22vw,16rem)] font-black leading-none tabular-nums drop-shadow-[0_8px_30px_rgba(0,0,0,.5)]', finalStretch && 'text-[#ff8787]')}
                  aria-live="off"
                >
                  {fmtLeft(left)}
                </motion.p>
              )}
              {phase === 'waiting' && (
                <div className="mt-2 flex items-center gap-8 rounded-[2rem] bg-white/10 p-6">
                  <div className="rounded-2xl bg-white p-3">
                    <QRCodeSVG value={playUrl(s.pin)} size={200} level="M" fgColor="#14213D" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold text-white/70">Entra a «Mi aula» o con el PIN</p>
                    <p className="font-display text-8xl font-black tracking-[0.12em]">{s.pin}</p>
                    <p className="text-lg text-white/60">{playUrl().replace(/^https?:\/\//, '')}</p>
                  </div>
                </div>
              )}
              {phase === 'running' && s.time_limit_sec && (
                <p className="text-xl text-white/60">
                  Cada uno tiene {Math.round(s.time_limit_sec / 60)} minutos desde que empezó{closesMs ? ` · la sala cierra a las ${hhmm(closesMs)}` : ''}
                </p>
              )}
              {phase === 'before' && opensMs && <p className="text-2xl text-white/70">Se abre a las {hhmm(opensMs)}. Tengan su RU y los 3 últimos dígitos de su CI a mano.</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* contadores, sin nombres */}
        {phase !== 'before' && (
          <div className="grid w-full max-w-5xl grid-cols-3 gap-4">
            <Counter label="Respondiendo" value={data.progress} color="#4dabf7" />
            <Counter label="Entregaron" value={data.done} color="#69db7c" />
            <Counter label="Aún no entran" value={Math.max(0, data.enrolled - data.present)} color="#ffd43b" />
          </div>
        )}
        {phase === 'running' && (
          <div className="w-full max-w-5xl">
            <div className="mb-1 flex justify-between text-lg font-bold text-white/70">
              <span>Avance del curso</span>
              <span>{Math.round(data.pct * 100)} % de las preguntas respondidas</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full bg-white/15">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#69db7c] via-[#ffd43b] to-[#ff922b]" animate={{ width: `${data.pct * 100}%` }} transition={{ duration: 1 }} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Entregaron ${Math.round(pctDone * 100)} %`}>
              <motion.div className="h-full rounded-full bg-[#69db7c]" animate={{ width: `${pctDone * 100}%` }} transition={{ duration: 1 }} />
            </div>
          </div>
        )}
      </main>
      <p className="relative pb-5 text-center text-sm text-white/40">YaguarQuiz UAP · ¡Demuestra tu garra! · Salir de la ventana queda registrado</p>
    </div>,
    document.body,
  )
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-3xl bg-white/10 px-4 py-5 ring-1 ring-white/10">
      <motion.p key={value} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="font-display text-7xl font-black tabular-nums" style={{ color }}>
        {value}
      </motion.p>
      <p className="text-xl font-bold text-white/70">{label}</p>
    </div>
  )
}
