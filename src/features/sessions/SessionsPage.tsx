import { motion } from 'framer-motion'
import { MonitorPlay, Radio, Rocket, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Badge, EmptyState, Select, Skeleton } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useSessions, type Phase } from '../../lib/api/live'
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

export function SessionsPage() {
  const sessions = useSessions()
  const [pick, setPick] = useState(false)
  const active = (sessions.data ?? []).filter((s) => s.status !== 'finished')
  const done = (sessions.data ?? []).filter((s) => s.status === 'finished')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Sesiones en vivo</h1>
          <p className="text-ink-soft">Lanza una evaluación publicada y proyéctala en el aula.</p>
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
                <span className="size-2.5 animate-pulse rounded-full bg-game-coral" /> Abiertas ahora
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((s) => (
                  <SessionCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold">Terminadas</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {done.map((s) => (
                  <SessionCard key={s.id} s={s} />
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

function SessionCard({ s }: { s: NonNullable<ReturnType<typeof useSessions>['data']>[number] }) {
  const n = s.participants[0]?.count ?? 0
  const open = s.status !== 'finished'
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SolidCard className="flex h-full flex-col gap-2 p-5" style={{ borderTop: `5px solid ${s.subjects?.theme_color ?? '#1B7339'}` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {s.subjects?.code} · Paralelo {s.subjects?.parallel}
          </span>
          <Badge tone={open ? 'green' : 'neutral'}>{PHASE[s.phase]}</Badge>
        </div>
        <h3 className="font-display text-lg font-bold leading-snug">{s.quizzes?.title ?? 'Evaluación eliminada'}</h3>
        <p className="flex items-center gap-3 text-sm text-ink-soft">
          <span className="flex items-center gap-1">
            <Users className="size-4" /> {n}
          </span>
          <span>{fmtDateTime(s.created_at)}</span>
          {open && <span className="font-display font-black tracking-widest text-ink">PIN {s.pin}</span>}
        </p>
        <div className="mt-auto flex justify-end pt-2">
          <Link to={`/host/${s.id}`}>
            <Button size="sm" variant={open ? 'primary' : 'secondary'}>
              {open ? <MonitorPlay className="size-4" /> : <Trophy className="size-4" />}
              {open ? 'Abrir proyector' : 'Ver resultados'}
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
        quiz={quiz ? { id: quiz.id, title: quiz.title, subject_id: quiz.subject_id } : null}
      />
    </>
  )
}
