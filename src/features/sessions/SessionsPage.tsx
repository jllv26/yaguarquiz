import { motion } from 'framer-motion'
import { BookOpenCheck, CalendarClock, Home, MonitorPlay, Radio, Rocket, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useSessions, type Phase, type SessionListRow } from '../../lib/api/live'
import { useQuizzes } from '../../lib/api/quizzes'
import { fmtDateTime } from '../../lib/dates'
import { LaunchModal } from './LaunchModal'

const PHASE: Record<Phase, string> = {
  lobby: 'Sala de espera',
  countdown: 'En juego',
  question: 'En juego',
  reveal: 'En juego',
  leaderboard: 'En juego',
  finished: 'Terminada',
}

/** Estado visible de una sesión (en examen/tarea depende de la hora de apertura y cierre). */
function stateOf(s: SessionListRow, now: number): { label: string; open: boolean; tone: 'green' | 'gold' | 'neutral' } {
  if (s.mode === 'live') return { label: PHASE[s.phase], open: s.status !== 'finished', tone: s.status !== 'finished' ? 'green' : 'neutral' }
  if (s.status === 'finished' || (s.scheduled_end && new Date(s.scheduled_end).getTime() <= now)) return { label: 'Cerrada', open: false, tone: 'neutral' }
  if (s.scheduled_start && new Date(s.scheduled_start).getTime() > now) return { label: 'Programada', open: true, tone: 'gold' }
  return { label: 'Abierta', open: true, tone: 'green' }
}
const MODE = {
  live: { label: 'En vivo', icon: MonitorPlay },
  exam: { label: 'Examen', icon: BookOpenCheck },
  homework: { label: 'Tarea', icon: Home },
} as const

export function SessionsPage() {
  const sessions = useSessions()
  const [pick, setPick] = useState(false)
  const [now] = useState(() => Date.now())
  const active = (sessions.data ?? []).filter((s) => stateOf(s, now).open)
  const done = (sessions.data ?? []).filter((s) => !stateOf(s, now).open)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Sesiones</h1>
          <p className="text-ink-soft">Partidas en vivo, exámenes programados y tareas.</p>
        </div>
        <Button variant="success" size="lg" onClick={() => setPick(true)}>
          <Rocket className="size-5" /> Nueva sesión
        </Button>
      </div>

      {sessions.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !sessions.data?.length ? (
        <SolidCard className="p-8">
          <EmptyState
            icon={<Radio className="size-8" />}
            title="Aún no lanzaste ninguna sesión"
            text="Publica una evaluación y presiona “Nueva sesión”. Tus estudiantes entran con el PIN desde su celular o la PC del laboratorio."
            action={
              <Button variant="success" onClick={() => setPick(true)}>
                <Rocket className="size-4" /> Nueva sesión
              </Button>
            }
          />
        </SolidCard>
      ) : (
        <>
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <span className="size-2.5 animate-pulse rounded-full bg-game-coral" /> Abiertas y programadas
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((s) => (
                  <SessionCard key={s.id} s={s} now={now} />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold">Terminadas y cerradas</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {done.map((s) => (
                  <SessionCard key={s.id} s={s} now={now} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <PickQuizModal open={pick} onClose={() => setPick(false)} />
    </div>
  )
}

function SessionCard({ s, now }: { s: SessionListRow; now: number }) {
  const n = s.participants[0]?.count ?? 0
  const st = stateOf(s, now)
  const open = st.open
  const live = s.mode === 'live'
  const M = MODE[(s.mode as keyof typeof MODE) ?? 'live'] ?? MODE.live
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SolidCard className="flex h-full flex-col gap-2 p-5" style={{ borderTop: `5px solid ${s.subjects?.theme_color ?? '#1B7339'}` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {s.subjects?.code} · Paralelo {s.subjects?.parallel}
          </span>
          <span className="flex items-center gap-1.5">
            <Badge tone="neutral">
              <M.icon className="mr-1 inline size-3.5" />
              {M.label}
            </Badge>
            <Badge tone={st.tone}>{st.label}</Badge>
          </span>
        </div>
        <h3 className="font-display text-lg font-bold leading-snug">{s.quizzes?.title ?? 'Evaluación eliminada'}</h3>
        <p className="flex items-center gap-3 text-sm text-ink-soft">
          <span className="flex items-center gap-1">
            <Users className="size-4" /> {n}
          </span>
          {live && <span>{fmtDateTime(s.created_at)}</span>}
          {open && <span className="font-display font-black tracking-widest text-ink">PIN {s.pin}</span>}
        </p>
        {!live && (
          <p className="flex items-center gap-1.5 text-sm text-ink-soft">
            <CalendarClock className="size-4 shrink-0" />
            {s.scheduled_start ? fmtDateTime(s.scheduled_start) : fmtDateTime(s.created_at)} → {s.scheduled_end ? fmtDateTime(s.scheduled_end) : 'sin cierre'}
          </p>
        )}
        <div className="mt-auto flex justify-end pt-2">
          <Link to={`/host/${s.id}`}>
            <Button size="sm" variant={open ? 'primary' : 'secondary'}>
              {open ? <MonitorPlay className="size-4" /> : <Trophy className="size-4" />}
              {open ? (live ? 'Abrir proyector' : 'Abrir monitor') : 'Ver resultados'}
            </Button>
          </Link>
        </div>
      </SolidCard>
    </motion.div>
  )
}

function PickQuizModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quizzes = useQuizzes()
  const published = (quizzes.data ?? []).filter((q) => q.status === 'published' && (q.questions[0]?.count ?? 0) > 0)
  const [id, setId] = useState('')
  const [launch, setLaunch] = useState(false)
  const quiz = published.find((q) => q.id === (id || published[0]?.id)) ?? null
  return (
    <>
      <Modal
        open={open && !launch}
        onClose={onClose}
        title="Nueva sesión"
        subtitle="Elige la evaluación (solo aparecen las publicadas)"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!quiz} onClick={() => setLaunch(true)}>
              Continuar
            </Button>
          </>
        }
      >
        {published.length ? (
          <Select label="Evaluación" value={quiz?.id ?? ''} onChange={(e) => setId(e.target.value)}>
            {published.map((q) => (
              <option key={q.id} value={q.id}>
                {q.subjects?.code} · {q.title} ({q.questions[0]?.count} preguntas)
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-ink-soft">
            No tienes evaluaciones publicadas. Ve a <Link className="font-semibold text-uap-blue underline dark:text-game-electric" to="/admin/evaluaciones">Evaluaciones</Link>, abre una y presiona “Publicar”.
          </p>
        )}
      </Modal>
      <LaunchModal
        open={launch}
        onClose={() => {
          setLaunch(false)
          onClose()
        }}
        quiz={quiz ? { id: quiz.id, title: quiz.title, subject_id: quiz.subject_id, questionCount: quiz.questions[0]?.count } : null}
      />
    </>
  )
}
