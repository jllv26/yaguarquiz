import { AlertTriangle, ArrowRightLeft, Copy, Trash2, X } from 'lucide-react'
import { TYPE_ICONS } from './typeIcons'
import { useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import { convertType, POINTS, QUESTION_TYPES, TIME_PRESETS, type EditorQuestion, type QuestionType } from '../quizzes/questionModel'


export function SettingsPanel({
  q,
  issues,
  onChange,
  onDuplicate,
  onMove,
  onDelete,
}: {
  q: EditorQuestion
  issues: string[]
  onChange: (q: EditorQuestion) => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const [customTime, setCustomTime] = useState('')
  const [tag, setTag] = useState('')
  const isCustom = !TIME_PRESETS.includes(q.time_limit_sec)

  return (
    <div className="flex flex-col gap-5">
      {issues.length > 0 && (
        <div className="rounded-2xl border border-uap-gold/40 bg-uap-gold/12 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-[#7a5e12] dark:text-uap-gold-300">
            <AlertTriangle className="size-4" /> Falta completar
          </p>
          <ul className="list-inside list-disc text-ink-soft">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Tipo de pregunta">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => {
            const Icon = TYPE_ICONS[t]
            return (
              <button
                key={t}
                onClick={() => t !== q.type && onChange(convertType(q, t))}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-semibold transition-colors',
                  q.type === t ? 'border-uap-blue bg-uap-blue text-white dark:border-game-electric dark:bg-game-electric' : 'border-line hover:border-uap-blue/40',
                )}
                title={QUESTION_TYPES[t].description}
              >
                <Icon className="size-4 shrink-0" /> {QUESTION_TYPES[t].label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Tiempo">
        <div className="flex flex-wrap gap-1.5">
          {TIME_PRESETS.map((t) => (
            <Chip key={t} on={q.time_limit_sec === t} onClick={() => onChange({ ...q, time_limit_sec: t })}>
              {t < 60 ? `${t} s` : `${t / 60} min`}
            </Chip>
          ))}
          <div className={cn('flex items-center gap-1 rounded-xl border-2 px-2', isCustom ? 'border-uap-blue' : 'border-line')}>
            <input
              inputMode="numeric"
              value={isCustom ? String(q.time_limit_sec) : customTime}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                setCustomTime(v)
                const n = Number(v)
                if (n >= 5 && n <= 600) onChange({ ...q, time_limit_sec: n })
              }}
              placeholder="otro"
              className="h-8 w-12 bg-transparent text-center text-sm font-semibold outline-none"
              aria-label="Tiempo personalizado en segundos"
            />
            <span className="text-xs text-ink-soft">s</span>
          </div>
        </div>
      </Section>

      <Section title="Puntos">
        <div className="grid grid-cols-3 gap-1.5">
          {POINTS.map((p) => (
            <button
              key={p.value}
              onClick={() => onChange({ ...q, base_points: p.value })}
              className={cn(
                'rounded-2xl border-2 px-2 py-2 text-center transition-colors',
                q.base_points === p.value ? 'border-uap-gold bg-uap-gold/15' : 'border-line hover:border-uap-gold/50',
              )}
            >
              <span className="block text-sm font-bold">{p.label}</span>
              <span className="block text-[11px] text-ink-soft">{p.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Dificultad">
        <div className="flex gap-1.5">
          {(
            [
              ['facil', 'Fácil'],
              ['media', 'Media'],
              ['dificil', 'Difícil'],
            ] as const
          ).map(([v, label]) => (
            <Chip key={v} on={q.difficulty === v} onClick={() => onChange({ ...q, difficulty: q.difficulty === v ? null : v })}>
              {label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Explicación (se muestra al revelar)">
        <textarea
          value={q.explanation}
          onChange={(e) => onChange({ ...q, explanation: e.target.value })}
          rows={3}
          placeholder="¿Por qué esa es la respuesta correcta?"
          className="w-full rounded-2xl border-2 border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-uap-blue"
        />
      </Section>

      <Section title="Etiquetas (para el banco de preguntas)">
        <div className="flex flex-wrap gap-1.5">
          {q.tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-uap-blue/10 px-2.5 py-1 text-xs font-bold text-uap-blue dark:text-game-electric">
              #{t}
              <button onClick={() => onChange({ ...q, tags: q.tags.filter((x) => x !== t) })} aria-label={`Quitar ${t}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && tag.trim()) {
                e.preventDefault()
                const t = tag.trim().toLowerCase().replace(/^#/, '')
                if (!q.tags.includes(t)) onChange({ ...q, tags: [...q.tags, t] })
                setTag('')
              }
            }}
            placeholder="+ etiqueta"
            className="h-7 w-24 rounded-full border border-line bg-transparent px-2.5 text-xs outline-none focus:border-uap-blue"
          />
        </div>
      </Section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" variant="secondary" onClick={onDuplicate}>
          <Copy className="size-4" /> Duplicar
        </Button>
        <Button size="sm" variant="secondary" onClick={onMove}>
          <ArrowRightLeft className="size-4" /> Mover
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-uap-red dark:text-game-coral">
          <Trash2 className="size-4" /> Eliminar
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">{title}</h3>
      {children}
    </section>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 px-2.5 py-1.5 text-sm font-semibold transition-colors',
        on ? 'border-uap-green bg-uap-green text-white' : 'border-line hover:border-uap-green/50',
      )}
    >
      {children}
    </button>
  )
}
