import { Reorder } from 'framer-motion'
import { Check, GripVertical, Plus, X } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Shape } from '../../components/Shape'
import { ANSWER_STYLES } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { newOption, QUESTION_TYPES, type EditorOption, type EditorQuestion } from '../quizzes/questionModel'
import { ImageField } from './ImageField'

/** Lienzo central: se edita la pregunta tal como la verá el estudiante. */
export function QuestionCanvas({ q, onChange }: { q: EditorQuestion; onChange: (q: EditorQuestion) => void }) {
  const meta = QUESTION_TYPES[q.type]
  const setOpt = (key: string, patch: Partial<EditorOption>) =>
    onChange({ ...q, options: q.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) })
  const markCorrect = (key: string) => {
    if (q.type === 'multiple') setOpt(key, { is_correct: !q.options.find((o) => o.key === key)?.is_correct })
    else onChange({ ...q, options: q.options.map((o) => ({ ...o, is_correct: o.key === key })) })
  }
  const removeOpt = (key: string) => onChange({ ...q, options: q.options.filter((o) => o.key !== key) })
  const addOpt = () => onChange({ ...q, options: [...q.options, newOption({ is_correct: q.type === 'ordering' })] })
  const canAdd = q.options.length < meta.maxOptions
  const canRemove = q.options.length > meta.minOptions

  return (
    <div className="flex flex-col gap-5">
      <textarea
        value={q.prompt}
        onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        placeholder="Escribe aquí tu pregunta…"
        rows={2}
        className="w-full resize-none rounded-3xl border-2 border-transparent bg-surface-2 px-6 py-5 text-center font-display text-2xl font-extrabold leading-tight shadow-sm outline-none placeholder:text-ink-soft/50 focus:border-uap-blue sm:text-3xl"
        aria-label="Enunciado de la pregunta"
      />

      <ImageField value={q.image_url} onChange={(url) => onChange({ ...q, image_url: url })} label="Imagen de la pregunta (opcional)" className="mx-auto w-full max-w-xl" />

      {/* Opción única / varias / V-F */}
      {(q.type === 'single' || q.type === 'multiple' || q.type === 'true_false') && (
        <>
          <p className="text-center text-sm font-semibold text-ink-soft">
            {q.type === 'multiple' ? 'Marca ✓ todas las respuestas correctas' : 'Marca ✓ la respuesta correcta'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const s = ANSWER_STYLES[q.type === 'true_false' ? (i === 0 ? 1 : 0) : i % 4]
              return (
                <div
                  key={o.key}
                  className={cn('flex min-h-20 items-center gap-2 rounded-3xl p-3 shadow-md', s.bg, s.text)}
                  style={{ boxShadow: `0 5px 0 0 ${s.edge}` } as CSSProperties}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/15">
                    <Shape shape={s.shape} className="size-5" />
                  </span>
                  {q.type === 'true_false' ? (
                    <span className="flex-1 font-display text-xl font-bold">{o.text}</span>
                  ) : (
                    <textarea
                      value={o.text}
                      rows={1}
                      onChange={(e) => setOpt(o.key, { text: e.target.value.replace(/\n/g, ' ') })}
                      placeholder={`Respuesta ${i + 1}`}
                      className="min-w-0 flex-1 resize-none bg-transparent font-display text-base font-bold leading-snug outline-none [field-sizing:content] placeholder:text-current placeholder:opacity-60 sm:text-lg"
                      aria-label={`Respuesta ${i + 1}`}
                    />
                  )}
                  <CorrectToggle on={o.is_correct} onClick={() => markCorrect(o.key)} round={q.type !== 'multiple'} />
                  {q.type !== 'true_false' && canRemove && (
                    <button onClick={() => removeOpt(o.key)} className="rounded-lg p-1 opacity-70 hover:bg-black/10 hover:opacity-100" aria-label="Quitar opción">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {q.type !== 'true_false' && canAdd && <AddButton onClick={addOpt} />}
        </>
      )}

      {/* Elegir imagen */}
      {q.type === 'image_choice' && (
        <>
          <p className="text-center text-sm font-semibold text-ink-soft">Sube una imagen por opción y marca ✓ la correcta</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {q.options.map((o, i) => {
              const s = ANSWER_STYLES[i % 4]
              return (
                <div key={o.key} className={cn('relative rounded-3xl p-2', s.bg)} style={{ boxShadow: `0 5px 0 0 ${s.edge}` }}>
                  <ImageField value={o.image_url} onChange={(url) => setOpt(o.key, { image_url: url })} compact label={`Imagen ${i + 1}`} className="bg-white/90" />
                  <div className={cn('mt-2 flex items-center justify-between px-1', s.text)}>
                    <Shape shape={s.shape} className="size-5" />
                    <div className="flex items-center gap-1">
                      <CorrectToggle on={o.is_correct} onClick={() => markCorrect(o.key)} round />
                      {canRemove && (
                        <button onClick={() => removeOpt(o.key)} className="rounded-lg p-1 hover:bg-black/10" aria-label="Quitar opción">
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {canAdd && <AddButton onClick={addOpt} />}
        </>
      )}

      {/* Respuesta corta */}
      {q.type === 'short_text' && <AcceptedAnswers q={q} onChange={onChange} />}

      {/* Ordenar */}
      {q.type === 'ordering' && (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <p className="text-center text-sm font-semibold text-ink-soft">Escribe los elementos en el ORDEN CORRECTO (arrástralos para cambiarlo). Al estudiante le aparecerán mezclados.</p>
          <Reorder.Group axis="y" values={q.options} onReorder={(opts) => onChange({ ...q, options: opts })} className="flex flex-col gap-3">
            {q.options.map((o, i) => {
              const s = ANSWER_STYLES[i % 4]
              return (
                <Reorder.Item
                  key={o.key}
                  value={o}
                  className={cn('flex items-center gap-3 rounded-3xl p-3', s.bg, s.text)}
                  style={{ boxShadow: `0 5px 0 0 ${s.edge}` }}
                >
                  <GripVertical className="size-6 shrink-0 cursor-grab opacity-70 active:cursor-grabbing" />
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/15 font-display font-black">{i + 1}</span>
                  <input
                    value={o.text}
                    onChange={(e) => setOpt(o.key, { text: e.target.value })}
                    placeholder={`Elemento ${i + 1}`}
                    className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold outline-none placeholder:text-current placeholder:opacity-60"
                    aria-label={`Elemento ${i + 1}`}
                  />
                  {canRemove && (
                    <button onClick={() => removeOpt(o.key)} className="rounded-lg p-1 hover:bg-black/10" aria-label="Quitar elemento">
                      <X className="size-4" />
                    </button>
                  )}
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
          {canAdd && <AddButton onClick={addOpt} label="Agregar elemento" />}
        </div>
      )}
    </div>
  )
}

function CorrectToggle({ on, onClick, round }: { on: boolean; onClick: () => void; round?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'grid size-9 shrink-0 place-items-center border-[3px] border-white transition-transform hover:scale-110',
        round ? 'rounded-full' : 'rounded-lg',
        on ? 'bg-white text-uap-green' : 'bg-black/10 text-transparent',
      )}
      aria-pressed={on}
      aria-label={on ? 'Respuesta correcta' : 'Marcar como correcta'}
      title={on ? 'Respuesta correcta' : 'Marcar como correcta'}
    >
      <Check className="size-5" strokeWidth={3.5} />
    </button>
  )
}

function AddButton({ onClick, label = 'Agregar respuesta' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="mx-auto flex items-center gap-2 rounded-2xl border-2 border-dashed border-line px-5 py-2.5 font-semibold text-ink-soft hover:border-uap-green hover:text-uap-green">
      <Plus className="size-5" /> {label}
    </button>
  )
}

function AcceptedAnswers({ q, onChange }: { q: EditorQuestion; onChange: (q: EditorQuestion) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!q.accepted_answers.some((a) => a.toLowerCase() === v.toLowerCase())) onChange({ ...q, accepted_answers: [...q.accepted_answers, v] })
    setDraft('')
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-3xl bg-surface-2 p-5 shadow-sm">
      <p className="font-display font-bold">Respuestas aceptadas</p>
      <p className="text-sm text-ink-soft">Se ignoran mayúsculas, tildes y espacios de más. Agrega variantes válidas (sinónimos, abreviaturas).</p>
      <div className="flex flex-wrap gap-2">
        {q.accepted_answers.map((a) => (
          <span key={a} className="flex items-center gap-1 rounded-full bg-uap-green px-3 py-1.5 font-semibold text-white">
            {a}
            <button onClick={() => onChange({ ...q, accepted_answers: q.accepted_answers.filter((x) => x !== a) })} aria-label={`Quitar ${a}`}>
              <X className="size-4" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Escribe una respuesta y presiona Enter"
          className="h-12 flex-1 rounded-2xl border-2 border-line bg-surface px-4 outline-none focus:border-uap-blue"
        />
        <button onClick={add} className="rounded-2xl bg-uap-green px-4 font-semibold text-white">
          Agregar
        </button>
      </div>
    </div>
  )
}
