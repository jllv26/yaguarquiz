import { IdCard, Rocket, Smile, Trophy, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useGradingPlan } from '../../lib/api/academic'
import { createSession, type SessionSettings } from '../../lib/api/live'
import { useSubjectsLite } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { TERM_LABEL } from '../academic/gradingDefaults'

interface Props {
  open: boolean
  onClose: () => void
  quiz: { id: string; title: string; subject_id: string; questionCount?: number } | null
}

/** Configura y lanza una sesión en vivo; abre el proyector. */
export function LaunchModal({ open, onClose, quiz }: Props) {
  if (!quiz) return null
  return <LaunchModalInner key={quiz.id} open={open} onClose={onClose} quiz={quiz} />
}

function LaunchModalInner({ open, onClose, quiz }: Props & { quiz: NonNullable<Props['quiz']> }) {
  const navigate = useNavigate()
  const toast = useToast()
  const subjects = useSubjectsLite()
  const [subjectId, setSubjectId] = useState(quiz.subject_id)
  const plan = useGradingPlan(subjectId)
  const [s, setS] = useState<SessionSettings>({ identification: 'roster', require_ci: false, show_ranking: true, allow_late_join: true, grading_item_id: null })
  const [busy, setBusy] = useState(false)
  const items = (plan.data?.grading_items ?? []).filter((i) => i.source === 'yaguarquiz').sort((a, b) => a.term - b.term || (a.sort_order ?? 0) - (b.sort_order ?? 0))

  async function launch() {
    setBusy(true)
    try {
      const r = await createSession(quiz.id, subjectId, s)
      onClose()
      navigate(`/host/${r.id}`)
    } catch (e) {
      toast.error('No se pudo lanzar la sesión', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lanzar en vivo"
      subtitle={quiz.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" size="lg" onClick={() => void launch()} disabled={busy}>
            <Rocket className="size-5" /> {busy ? 'Lanzando…' : 'Abrir sala'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Select label="Asignatura y paralelo" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {(subjects.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} · Paralelo {x.parallel} — {x.name}
              {x.periods ? ` (${x.periods.name})` : ''}
            </option>
          ))}
        </Select>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink-soft">¿Cómo entran los estudiantes?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              on={s.identification === 'roster'}
              onClick={() => setS({ ...s, identification: 'roster' })}
              icon={<UserCheck className="size-6" />}
              title="Con su RU (lista oficial)"
              text="Solo entran los inscritos. La nota queda en su registro."
            />
            <Choice
              on={s.identification === 'nickname'}
              onClick={() => setS({ ...s, identification: 'nickname', require_ci: false, grading_item_id: null })}
              icon={<Smile className="size-6" />}
              title="Con apodo libre"
              text="Para repasos o invitados. No cuenta para la nota."
            />
          </div>
        </div>

        {s.identification === 'roster' && (
          <Toggle
            on={s.require_ci}
            onChange={(v) => setS({ ...s, require_ci: v })}
            icon={<IdCard className="size-5" />}
            title="Pedir los últimos 3 dígitos del CI"
            text="Evita que alguien entre con el RU de un compañero."
          />
        )}
        <Toggle
          on={s.show_ranking}
          onChange={(v) => setS({ ...s, show_ranking: v })}
          icon={<Trophy className="size-5" />}
          title="Mostrar ranking entre preguntas"
          text="Si lo apagas, se pasa directo a la siguiente pregunta."
        />
        <Toggle
          on={s.allow_late_join}
          onChange={(v) => setS({ ...s, allow_late_join: v })}
          title="Permitir que entren tarde"
          text="Quien llegue tarde juega desde la pregunta actual."
        />

        {s.identification === 'roster' && items.length > 0 && (
          <Select
            label="¿A qué nota corresponde? (opcional)"
            hint="Lo usaremos en Reportes para pasar las notas a tu registro."
            value={s.grading_item_id ?? ''}
            onChange={(e) => setS({ ...s, grading_item_id: e.target.value || null })}
          >
            <option value="">— Solo práctica, sin nota —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {TERM_LABEL(i.term)} · {i.category} ({i.weight} pts)
              </option>
            ))}
          </Select>
        )}
      </div>
    </Modal>
  )
}

function Choice({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-2xl border-2 p-4 text-left transition-colors',
        on ? 'border-uap-green bg-uap-green/10' : 'border-line hover:border-uap-green/40',
      )}
      aria-pressed={on}
    >
      <span className={cn('flex items-center gap-2 font-display font-bold', on && 'text-uap-green dark:text-game-selva')}>
        {icon} {title}
      </span>
      <span className="text-sm text-ink-soft">{text}</span>
    </button>
  )
}

function Toggle({ on, onChange, icon, title, text }: { on: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-line p-3">
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold">
          {icon} {title}
        </span>
        <span className="block text-sm text-ink-soft">{text}</span>
      </span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-uap-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-uap-blue" />
    </label>
  )
}
