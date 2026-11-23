import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ClipboardPaste, Eye, FileDown, Loader2, Plus, RefreshCw, Rocket, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Select, Skeleton, Textarea } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { fetchActivityItems, saveActivity } from '../../lib/api/activities'
import { fetchQuestions, qkq, useQuiz, useQuizzes, useSaveQuiz } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { ImageField } from '../editor/ImageField'
import { LaunchModal, launchHint } from '../sessions/LaunchModal'
import { ActivityGame } from './ActivityGame'
import { activityOf } from './ActivitiesPage'
import { buildCrossword, buildWordsearch } from './generators'
import { localActivity } from './localEngine'
import { speak } from './tts'
import { fmtTime, parseTime, youtubeId } from './games/VideoQuiz'
import { ACTIVITY_META, fillTextSource, gameLetters, MC_TYPES, parseFillText, type ActivityItem, type ActivitySettings, type ActivityType, type ItemExtra } from './types'

/** Quita líneas vacías de las listas (incorrectas, pistas, elementos de la fila) antes de guardar o probar */
function cleanItem(it: ActivityItem): ActivityItem {
  const list = (a?: string[]) => (a ?? []).map((x) => x.trim()).filter(Boolean)
  const extra = it.extra ? { ...it.extra, wrong: it.extra.wrong ? list(it.extra.wrong) : undefined, clues: it.extra.clues ? list(it.extra.clues) : undefined, alt: it.extra.alt ? list(it.extra.alt) : undefined } : undefined
  const term = it.term.includes('|') ? it.term.split('|').map((x) => x.trim()).filter(Boolean).join(' | ') : it.term
  return { ...it, term, extra }
}

const blank = (): ActivityItem => ({ term: '', prompt: '', image_url: null, group: '', contains: false })
const sig = (s: ActivitySettings, items: ActivityItem[]) => JSON.stringify([s.type, s.difficulty, items.map((i) => gameLetters(i.term))])

export function ActivityEditorPage() {
  const { id = '' } = useParams()
  const quiz = useQuiz(id)
  const loaded = useQuery({ queryKey: ['activity-items', id], queryFn: () => fetchActivityItems(id), staleTime: Infinity })
  if (quiz.isLoading || loaded.isLoading) return <Skeleton className="h-96" />
  if (!quiz.data) return <p className="text-center text-ink-soft">La actividad no existe.</p>
  const settings = (quiz.data.settings?.activity as ActivitySettings | undefined) ?? null
  if (!settings) return <p className="text-center text-ink-soft">Esta evaluación no es una actividad.</p>
  return <Editor key={id} quiz={quiz.data} initial={settings} initialItems={loaded.data ?? []} />
}

function Editor({
  quiz,
  initial,
  initialItems,
}: {
  quiz: NonNullable<ReturnType<typeof useQuiz>['data']>
  initial: ActivitySettings
  initialItems: ActivityItem[]
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const saveQuiz = useSaveQuiz()
  const type = initial.type
  const meta = ACTIVITY_META[type]
  // tableros con versiones (uno distinto por estudiante): sus posiciones no deben moverse desde aquí
  const lockedVariants = !!initial.variants?.length && type !== 'research'
  const [title, setTitle] = useState(quiz.title)
  const [s, setS] = useState<ActivitySettings>(initial)
  const [items, setItems] = useState<ActivityItem[]>(initialItems.length ? initialItems : type === 'fill_text' ? [] : [blank(), blank(), blank()])
  const [fillSrc, setFillSrc] = useState(() => (type === 'fill_text' ? fillTextSource(initial.text ?? '', initialItems.map((i) => i.term)) : ''))
  const [boardSig, setBoardSig] = useState(() => sig(initial, initialItems))
  const [unplaced, setUnplaced] = useState<number[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(0)
  const [paste, setPaste] = useState(false)
  const [bank, setBank] = useState(false)
  const [launch, setLaunch] = useState(false)
  const [mapPick, setMapPick] = useState(0)

  // aviso al cerrar o recargar la pestaña con cambios sin guardar
  useEffect(() => {
    if (!dirty) return
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  // completar texto: las palabras salen de los [corchetes]
  const effItems = useMemo<ActivityItem[]>(() => {
    if (type !== 'fill_text') return items.filter((i) => i.term.trim() || i.prompt.trim() || i.image_url).map(cleanItem)
    return parseFillText(fillSrc).words.map((w, k) => ({ id: initialItems[k]?.id, term: w, prompt: '' }))
  }, [type, items, fillSrc, initialItems])
  const effSettings = useMemo<ActivitySettings>(() => (type === 'fill_text' ? { ...s, text: parseFillText(fillSrc).text } : s), [type, s, fillSrc])

  const problems = useMemo(() => validate(type, effItems, effSettings), [type, effItems, effSettings])
  const needsBoard = (type === 'crossword' || type === 'wordsearch') && sig(effSettings, effItems) !== boardSig

  function update(i: number, patch: Partial<ActivityItem>) {
    setItems((x) => x.map((it, k) => (k === i ? { ...it, ...patch } : it)))
    setDirty(true)
  }
  function regenerate(base = effSettings, list = effItems): ActivitySettings {
    let next = base
    if (type === 'crossword') {
      const r = buildCrossword(list.map((i) => i.term), Date.now())
      next = { ...base, layout: r.layout }
      setUnplaced(r.unplaced)
    } else if (type === 'wordsearch') {
      const r = buildWordsearch(list.map((i) => i.term), base.difficulty ?? 'media', Date.now())
      next = { ...base, grid: { letters: r.letters, placements: r.placements } }
      setUnplaced(r.unplaced)
    }
    setS((x) => ({ ...x, layout: next.layout, grid: next.grid }))
    setBoardSig(sig(next, list))
    setDirty(true)
    return next
  }

  async function save(): Promise<boolean> {
    if (problems.errors.length) {
      toast.error('Revise la actividad', problems.errors[0])
      return false
    }
    setBusy(true)
    try {
      let st = effSettings
      if (needsBoard || ((type === 'crossword' && !st.layout) || (type === 'wordsearch' && !st.grid?.letters.length))) st = regenerate(st, effItems)
      if (type === 'crossword' && st.layout && st.layout.words.length < effItems.length) {
        toast.info('Algunas palabras no se cruzaron', 'Pruebe “Generar otro tablero” o cambie esas palabras; las que no se cruzan no aparecen.')
      }
      if (title.trim() !== quiz.title) await saveQuiz.mutateAsync({ id: quiz.id, subject_id: quiz.subject_id, topic_id: quiz.topic_id, title: title.trim() || quiz.title, status: quiz.status, visual_theme: quiz.visual_theme, description: quiz.description })
      await saveActivity(quiz.id, st, effItems)
      const fresh = await fetchActivityItems(quiz.id)
      qc.setQueryData(['activity-items', quiz.id], fresh)
      if (type !== 'fill_text') setItems(fresh)
      void qc.invalidateQueries({ queryKey: qkq.quizzes })
      void qc.invalidateQueries({ queryKey: qkq.quiz(quiz.id) })
      setDirty(false)
      toast.success('Actividad guardada')
      return true
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const previewData = useMemo(() => {
    if (!preview) return null
    let st = effSettings
    if (type === 'crossword' && (needsBoard || !st.layout)) st = { ...st, layout: buildCrossword(effItems.map((i) => i.term)).layout }
    if (type === 'wordsearch' && (needsBoard || !st.grid?.letters.length)) st = { ...st, grid: buildWordsearch(effItems.map((i) => i.term), st.difficulty ?? 'media') }
    return localActivity(st, effItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  const showImage = !['fill_text', 'sentence', 'wordsearch', 'classify', 'map', 'video', 'rows'].includes(type)
  const isMc = MC_TYPES.includes(type)
  // donde el estudiante escribe, se pueden aceptar otras respuestas (sinónimos, plural, sigla)
  const typed = type === 'riddle' || type === 'rosco' || (type === 'dictation' && (s.listen ?? 'term') === 'prompt') || (type === 'map' && s.map_mode === 'write')
  const setExtra = (i: number, patch: Partial<ItemExtra>) => update(i, { extra: { ...items[i].extra, ...patch } })
  const groups = [...new Set(effItems.map((i) => i.group?.trim()).filter(Boolean))]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/admin/actividades" className="rounded-xl p-2 hover:bg-ink/5" aria-label="Volver a actividades">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: meta.color }}>
          <meta.icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {meta.label} · {quiz.subjects?.code} ({quiz.subjects?.parallel})
          </p>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDirty(true)
            }}
            aria-label="Título de la actividad"
            className="w-full bg-transparent font-display text-2xl font-black outline-none focus:underline sm:text-3xl"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPreview(Date.now())} disabled={effItems.length < 1}>
            <Eye className="size-5" /> Probar
          </Button>
          <Button variant="success" onClick={() => void save()} disabled={busy || lockedVariants}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />} Guardar
          </Button>
          <Button
            variant="gold"
            disabled={busy || !!problems.errors.length}
            onClick={() =>
              void (async () => {
                if (!dirty || (await save())) setLaunch(true)
              })()
            }
          >
            <Rocket className="size-5" /> Lanzar
          </Button>
        </div>
      </header>
      {lockedVariants && (
        <p className="rounded-2xl border-2 border-uap-gold/60 bg-uap-gold/10 px-4 py-3 text-sm">
          🔀 Esta actividad tiene <b>{initial.variants!.length} versiones</b>: a cada estudiante le toca un tablero distinto (así no sirve copiar la foto del compañero).
          Aquí puede verla, probarla y lanzarla; para cambiar sus palabras pídalo y se generan de nuevo todas las versiones.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          {type === 'fill_text' ? (
            <SolidCard className="flex flex-col gap-3 p-5">
              <Textarea
                label="Texto (ponga entre [corchetes] las palabras que el estudiante debe completar)"
                value={fillSrc}
                rows={9}
                onChange={(e) => {
                  setFillSrc(e.target.value)
                  setDirty(true)
                }}
                placeholder="La capital del departamento de Pando es [Cobija] y su producto más exportado es la [castaña]."
              />
              <p className="text-sm text-ink-soft">
                Espacios: <strong>{effItems.length}</strong>
                {effItems.length > 0 && ` — ${effItems.map((i) => i.term).join(', ')}`}
              </p>
            </SolidCard>
          ) : (
            <SolidCard className="p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
                <h2 className="mr-auto font-display text-lg font-black">
                  {type === 'memory' || type === 'matching' ? 'Parejas' : type === 'sentence' ? 'Frases' : 'Palabras'} ({effItems.length}/{meta.max})
                </h2>
                <Button size="sm" variant="secondary" onClick={() => setPaste(true)}>
                  <ClipboardPaste className="size-4" /> Pegar desde Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setBank(true)}>
                  <FileDown className="size-4" /> Traer de una evaluación
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                      <th className="w-8 px-3 py-2">#</th>
                      <th className="px-2 py-2">{meta.termLabel}</th>
                      {type !== 'classify' && meta.promptLabel && <th className="px-2 py-2">{meta.promptLabel}</th>}
                      {type === 'classify' && <th className="w-48 px-2 py-2">Grupo</th>}
                      {type === 'rosco' && <th className="w-28 px-2 py-2">Letra</th>}
                      {isMc && <th className="w-48 px-2 py-2">Incorrectas (una por línea)</th>}
                      {type === 'video' && <th className="w-24 px-2 py-2">Minuto</th>}
                      {type === 'riddle' && <th className="px-2 py-2">Pistas (una por línea, de difícil a fácil)</th>}
                      {type === 'yesno' && <th className="w-28 px-2 py-2">Respuesta</th>}
                      {type === 'map' && <th className="w-32 px-2 py-2">Punto</th>}
                      {typed && <th className="w-44 px-2 py-2">También vale (una por línea)</th>}
                      {showImage && <th className="w-16 px-2 py-2">Imagen</th>}
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id ?? `n${i}`} className="border-t border-line align-top">
                        <td className="px-3 py-2.5 font-display font-black text-ink-soft">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          {type === 'rows' ? (
                            <textarea
                              value={it.term.split(/\s*\|\s*/).join('\n')}
                              onChange={(e) => update(i, { term: e.target.value.split('\n').map((x) => x.replace(/\|/g, '/')).join(' | ').replace(/( \| )+$/, ' | ') })}
                              rows={4}
                              className="min-h-24 w-full resize-y rounded-xl border-2 border-line bg-surface-2 px-3 py-2 font-semibold outline-none focus:border-uap-blue"
                              aria-label={`${meta.termLabel} ${i + 1}`}
                              placeholder={'Atención\nInterés\nDeseo\nAcción'}
                            />
                          ) : (
                            <input
                              value={it.term}
                              onChange={(e) => update(i, { term: e.target.value })}
                              className="h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-3 font-semibold outline-none focus:border-uap-blue"
                              aria-label={`${meta.termLabel} ${i + 1}`}
                              placeholder={type === 'sentence' ? 'El jaguar es el felino más grande de América' : ''}
                            />
                          )}
                          {type === 'dictation' && (it.term || it.prompt) && (
                            <button
                              type="button"
                              onClick={() => speak((s.listen ?? 'term') === 'prompt' ? it.prompt : it.term)}
                              className="ml-1 mt-1 text-xs font-bold text-uap-blue hover:underline"
                            >
                              🔊 Escuchar cómo suena
                            </button>
                          )}
                          {(type === 'crossword' || type === 'wordsearch') && it.term && (
                            <span className="ml-1 text-xs text-ink-soft">
                              {gameLetters(it.term).length} letras{unplaced.includes(i) && type === 'crossword' ? ' · no se cruzó' : ''}
                            </span>
                          )}
                        </td>
                        {type !== 'classify' && meta.promptLabel && (
                          <td className="px-2 py-1.5">
                            <textarea
                              value={it.prompt}
                              onChange={(e) => update(i, { prompt: e.target.value })}
                              rows={2}
                              className="min-h-10 w-full resize-y rounded-xl border-2 border-line bg-surface-2 px-3 py-2 outline-none focus:border-uap-blue"
                              aria-label={`${meta.promptLabel} ${i + 1}`}
                            />
                          </td>
                        )}
                        {isMc && (
                          <td className="px-2 py-1.5">
                            <textarea
                              value={(it.extra?.wrong ?? []).join('\n')}
                              onChange={(e) => setExtra(i, { wrong: e.target.value.split('\n') })}
                              rows={3}
                              placeholder={'Incorrecta 1\nIncorrecta 2'}
                              className="min-h-16 w-full resize-y rounded-xl border-2 border-uap-red/30 bg-surface-2 px-3 py-2 outline-none focus:border-uap-red"
                              aria-label={`Respuestas incorrectas ${i + 1}`}
                            />
                          </td>
                        )}
                        {type === 'video' && (
                          <td className="px-2 py-1.5">
                            <input
                              defaultValue={it.extra?.t !== undefined ? fmtTime(it.extra.t) : ''}
                              onBlur={(e) => {
                                const t = parseTime(e.target.value)
                                setExtra(i, { t: t ?? undefined })
                                if (t !== null) e.target.value = fmtTime(t)
                              }}
                              placeholder="1:30"
                              className="h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-2 text-center font-display font-bold outline-none focus:border-uap-blue"
                              aria-label={`Minuto de la pregunta ${i + 1}`}
                            />
                          </td>
                        )}
                        {type === 'riddle' && (
                          <td className="px-2 py-1.5">
                            <textarea
                              value={(it.extra?.clues ?? []).join('\n')}
                              onChange={(e) => setExtra(i, { clues: e.target.value.split('\n') })}
                              rows={3}
                              placeholder={'Pista difícil\nPista media\nPista fácil'}
                              className="min-h-16 w-full resize-y rounded-xl border-2 border-[#f08c00]/40 bg-surface-2 px-3 py-2 outline-none focus:border-[#f08c00]"
                              aria-label={`Pistas ${i + 1}`}
                            />
                          </td>
                        )}
                        {type === 'yesno' && (
                          <td className="px-2 py-1.5">
                            <select
                              value={it.group === 'No' ? 'No' : it.group === 'Sí' ? 'Sí' : ''}
                              onChange={(e) => update(i, { group: e.target.value })}
                              className="h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-2 font-bold outline-none focus:border-uap-blue"
                              aria-label={`Respuesta ${i + 1}`}
                            >
                              <option value="">—</option>
                              <option value="Sí">✓ Sí</option>
                              <option value="No">✗ No</option>
                            </select>
                          </td>
                        )}
                        {type === 'map' && (
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => setMapPick(i)}
                              className={cn('h-10 w-full rounded-xl border-2 px-2 text-xs font-bold', mapPick === i ? 'border-[#0b7285] bg-[#0b7285] text-white' : it.extra?.x !== undefined ? 'border-uap-green/50 text-uap-green' : 'border-dashed border-uap-red/50 text-uap-red')}
                            >
                              {it.extra?.x !== undefined ? `✓ ${Math.round(it.extra.x)} %, ${Math.round(it.extra.y ?? 0)} %` : 'Ubicar'}
                            </button>
                          </td>
                        )}
                        {typed && (
                          <td className="px-2 py-1.5">
                            <textarea
                              value={(it.extra?.alt ?? []).join('\n')}
                              onChange={(e) => setExtra(i, { alt: e.target.value.split('\n') })}
                              rows={2}
                              placeholder={'Sinónimo\nPlural'}
                              className="min-h-10 w-full resize-y rounded-xl border-2 border-uap-green/30 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-uap-green"
                              aria-label={`Otras respuestas válidas ${i + 1}`}
                            />
                          </td>
                        )}
                        {type === 'classify' && (
                          <td className="px-2 py-1.5">
                            <input
                              value={it.group ?? ''}
                              list="act-groups"
                              onChange={(e) => update(i, { group: e.target.value, prompt: e.target.value })}
                              className="h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-3 outline-none focus:border-uap-blue"
                              aria-label={`Grupo ${i + 1}`}
                            />
                          </td>
                        )}
                        {type === 'rosco' && (
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                value={it.group || gameLetters(it.term)[0] || ''}
                                maxLength={1}
                                onChange={(e) => update(i, { group: e.target.value.toUpperCase() })}
                                className="h-10 w-10 rounded-xl border-2 border-line bg-surface-2 text-center font-display font-black uppercase outline-none focus:border-uap-blue"
                                aria-label={`Letra ${i + 1}`}
                              />
                              <label className="flex items-center gap-1 text-xs">
                                <input type="checkbox" checked={!!it.contains} onChange={(e) => update(i, { contains: e.target.checked })} /> contiene
                              </label>
                            </div>
                          </td>
                        )}
                        {showImage && (
                          <td className="px-2 py-1.5">
                            <ImageField compact value={it.image_url ?? null} onChange={(url) => update(i, { image_url: url })} label="Imagen" />
                          </td>
                        )}
                        <td className="py-1.5 pr-2">
                          <button
                            onClick={() => {
                              setItems((x) => x.filter((_, k) => k !== i))
                              setDirty(true)
                            }}
                            className="rounded-xl p-2 text-ink-soft hover:bg-uap-red/10 hover:text-uap-red"
                            aria-label={`Quitar fila ${i + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="act-groups">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div className="border-t border-line p-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setItems((x) => [...x, blank()])
                    setDirty(true)
                  }}
                  disabled={items.length >= meta.max}
                >
                  <Plus className="size-4" /> Agregar fila
                </Button>
              </div>
            </SolidCard>
          )}

          {type === 'map' && (
            <SolidCard className="flex flex-col gap-3 p-4">
              <h2 className="font-display text-lg font-black">Ubicar los puntos</h2>
              {s.image_url ? (
                <>
                  <p className="text-sm text-ink-soft">
                    Fila <b>{mapPick + 1}</b>
                    {items[mapPick]?.term ? ` · «${items[mapPick].term}»` : ''}: toque la imagen donde va su punto.
                  </p>
                  <div
                    className="relative cursor-crosshair overflow-hidden rounded-2xl ring-1 ring-line"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10
                      const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10
                      if (!items[mapPick]) return
                      setExtra(mapPick, { x, y })
                      const nxt = items.findIndex((it, k) => k > mapPick && it.extra?.x === undefined)
                      if (nxt >= 0) setMapPick(nxt)
                    }}
                  >
                    <img src={s.image_url} alt="" className="block w-full select-none" draggable={false} />
                    {items.map((it, k) =>
                      it.extra?.x !== undefined ? (
                        <span
                          key={k}
                          className={cn('pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-black text-white shadow', k === mapPick ? 'bg-uap-gold text-ink' : 'bg-[#0b7285]')}
                          style={{ left: `${it.extra.x}%`, top: `${it.extra.y}%` }}
                        >
                          {k + 1}
                        </span>
                      ) : null,
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-soft">Primero suba la imagen en «Opciones».</p>
              )}
            </SolidCard>
          )}

          {(type === 'crossword' || type === 'wordsearch') && effItems.length >= 2 && (
            <SolidCard className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-display text-lg font-black">Tablero</h2>
                <Button size="sm" variant="secondary" onClick={() => regenerate()}>
                  <RefreshCw className="size-4" /> Generar otro tablero
                </Button>
              </div>
              {needsBoard || (type === 'crossword' ? !s.layout : !s.grid?.letters.length) ? (
                <p className="text-sm text-ink-soft">El tablero se arma al guardar (o presione “Generar otro tablero” para verlo ahora).</p>
              ) : (
                <BoardPreview type={type} s={s} items={effItems} />
              )}
              {unplaced.length > 0 && (
                <p className="flex items-start gap-2 rounded-2xl bg-uap-gold/15 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> No entraron: {unplaced.map((i) => effItems[i]?.term).join(', ')}. Genere otro tablero o cambie esas palabras.
                </p>
              )}
            </SolidCard>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <SolidCard className="flex flex-col gap-3 p-4">
            <h2 className="font-display text-lg font-black">Opciones</h2>
            <Textarea
              label="Instrucciones para el estudiante (opcional)"
              rows={2}
              value={s.instructions ?? ''}
              onChange={(e) => {
                setS({ ...s, instructions: e.target.value })
                setDirty(true)
              }}
            />
            {meta.usesTries && (
              <Select
                label="Intentos por palabra"
                hint="1.er intento 100 %, 2.º 60 %, 3.º o más 30 %."
                value={String(s.tries ?? (type === 'rosco' ? 1 : type === 'crossword' ? 3 : 2))}
                onChange={(e) => {
                  setS({ ...s, tries: Number(e.target.value) })
                  setDirty(true)
                }}
              >
                {[1, 2, 3, 4, 5].map((k) => (
                  <option key={k} value={k}>
                    {k} {k === 1 ? 'intento' : 'intentos'}
                  </option>
                ))}
              </Select>
            )}
            {type === 'wordsearch' && (
              <>
                <Select
                  label="Dificultad"
                  value={s.difficulty ?? 'media'}
                  onChange={(e) => {
                    setS({ ...s, difficulty: e.target.value as ActivitySettings['difficulty'] })
                    setDirty(true)
                  }}
                >
                  <option value="facil">Fácil (horizontal y vertical)</option>
                  <option value="media">Media (+ diagonales)</option>
                  <option value="dificil">Difícil (+ al revés)</option>
                </Select>
                <Select
                  label="El estudiante ve…"
                  value={s.show_words === false ? 'def' : 'words'}
                  onChange={(e) => {
                    setS({ ...s, show_words: e.target.value === 'words' })
                    setDirty(true)
                  }}
                >
                  <option value="words">Las palabras a buscar</option>
                  <option value="def">Solo las definiciones (más difícil)</option>
                </Select>
              </>
            )}
            {type === 'yesno' && (
              <Input
                label="Pregunta para todas las tarjetas"
                value={s.question ?? ''}
                onChange={(e) => {
                  setS({ ...s, question: e.target.value })
                  setDirty(true)
                }}
                placeholder="¿Es un objetivo SMART?"
              />
            )}
            {(type === 'map' || type === 'puzzle') && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold">{type === 'map' ? 'Imagen del mapa' : 'Imagen escondida'}</span>
                <ImageField
                  value={s.image_url ?? null}
                  onChange={(url) => {
                    setS({ ...s, image_url: url })
                    setDirty(true)
                  }}
                  label={type === 'map' ? 'Imagen del mapa' : 'Imagen del puzzle'}
                />
              </div>
            )}
            {type === 'map' && (
              <Select
                label="El estudiante…"
                value={s.map_mode ?? 'tap'}
                onChange={(e) => {
                  setS({ ...s, map_mode: e.target.value as 'tap' | 'write' })
                  setDirty(true)
                }}
              >
                <option value="tap">Lee el nombre y toca el punto</option>
                <option value="write">Ve el punto y escribe su nombre (más difícil)</option>
              </Select>
            )}
            {type === 'video' && (
              <>
                <Input
                  label="Enlace del video de YouTube"
                  value={s.video_url ?? ''}
                  onChange={(e) => {
                    setS({ ...s, video_url: e.target.value.trim() })
                    setDirty(true)
                  }}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                {youtubeId(s.video_url) && (
                  <iframe
                    title="Vista previa del video"
                    src={`https://www.youtube.com/embed/${youtubeId(s.video_url)}`}
                    className="aspect-video w-full rounded-xl"
                    allow="encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </>
            )}
            {type === 'asterquiz' && (
              <Select
                label="Segundos por pregunta"
                value={String(s.seconds ?? 30)}
                onChange={(e) => {
                  setS({ ...s, seconds: Number(e.target.value) })
                  setDirty(true)
                }}
              >
                {[15, 20, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} segundos
                  </option>
                ))}
              </Select>
            )}
            {type === 'dialogue' && (
              <>
                <Textarea
                  label="Diálogo (una línea por intervención: Nombre: lo que dice)"
                  rows={8}
                  defaultValue={(s.dialogue ?? []).map((l) => `${l.who}: ${l.text}`).join('\n')}
                  onChange={(e) => {
                    const dialogue = e.target.value
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .map((l) => {
                        const m = l.match(/^([^:]{1,30}):\s*(.+)$/)
                        return m ? { who: m[1].trim(), text: m[2].trim() } : { who: '—', text: l }
                      })
                    setS({ ...s, dialogue })
                    setDirty(true)
                  }}
                  placeholder={'Cliente: Hola, ¿hacen envíos a Porvenir?\nTienda: Sí, los martes.'}
                />
                <Select
                  label="El texto del diálogo…"
                  value={s.dialogue_text ?? 'show'}
                  onChange={(e) => {
                    setS({ ...s, dialogue_text: e.target.value as 'show' | 'hide' })
                    setDirty(true)
                  }}
                >
                  <option value="show">Se ve y se escucha</option>
                  <option value="hide">Solo se escucha (se puede ver al terminar de oírlo)</option>
                </Select>
              </>
            )}
            {type === 'dictation' && (
              <>
                <Select
                  label="¿Qué escucha el estudiante?"
                  value={s.listen ?? 'term'}
                  onChange={(e) => {
                    const listen = e.target.value as 'term' | 'prompt'
                    setS({ ...s, listen, accents: listen === 'term' })
                    setDirty(true)
                  }}
                >
                  <option value="term">La palabra o frase, y la escribe igual (ortografía)</option>
                  <option value="prompt">La definición, y escribe el término</option>
                </Select>
                <Select
                  label="Tildes"
                  value={(s.accents ?? (s.listen ?? 'term') === 'term') ? 'yes' : 'no'}
                  onChange={(e) => {
                    setS({ ...s, accents: e.target.value === 'yes' })
                    setDirty(true)
                  }}
                >
                  <option value="yes">Cuentan: sin la tilde correcta es error</option>
                  <option value="no">No cuentan</option>
                </Select>
              </>
            )}
            {type === 'fill_text' && (
              <>
                <Select
                  label="Forma de completar"
                  value={s.word_bank === false ? 'write' : 'bank'}
                  onChange={(e) => {
                    setS({ ...s, word_bank: e.target.value === 'bank' })
                    setDirty(true)
                  }}
                >
                  <option value="bank">Elegir de un banco de palabras</option>
                  <option value="write">Escribir la palabra (más difícil)</option>
                </Select>
                {s.word_bank !== false && (
                  <Input
                    label="Palabras distractoras (separadas por coma)"
                    value={(s.distractors ?? []).join(', ')}
                    onChange={(e) => {
                      setS({ ...s, distractors: e.target.value.split(',').map((x) => x.trim()) })
                      setDirty(true)
                    }}
                    placeholder="Trinidad, Sucre"
                  />
                )}
              </>
            )}
          </SolidCard>
          <SolidCard className="flex flex-col gap-2 p-4 text-sm">
            <p className="font-display font-black">Cómo se califica</p>
            <p className="text-ink-soft">
              {type === 'slides'
                ? 'Nota = diapositivas vistas ÷ total × 100.'
                : `Nota = puntos obtenidos ÷ puntos posibles × 100. ${type === 'riddle' ? 'Cada pista extra y cada intento fallido restan 20 % (mínimo 20 %).' : meta.usesTries ? 'Si acierta en el 2.º intento vale 60 %; en el 3.º, 30 %.' : type === 'memory' ? 'Las parejas encontradas con muchos errores valen menos (mínimo 50 %).' : type === 'hangman' ? 'Cada letra equivocada resta 10 % a esa palabra (mínimo 40 %).' : 'Cada palabra encontrada vale lo mismo.'}`}
            </p>
            <p className="text-ink-soft">La respuesta nunca llega al navegador del estudiante: cada jugada se corrige en el servidor.</p>
            <p className="rounded-xl bg-uap-gold/10 p-2">💡 {meta.tip}</p>
          </SolidCard>
          {(problems.errors.length > 0 || problems.warnings.length > 0) && (
            <SolidCard className="flex flex-col gap-1.5 p-4 text-sm" role="status">
              {problems.errors.map((p) => (
                <p key={p} className="flex gap-2 text-uap-red dark:text-game-coral">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p}
                </p>
              ))}
              {problems.warnings.map((p) => (
                <p key={p} className="flex gap-2 text-[#8a6416] dark:text-uap-gold">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p}
                </p>
              ))}
            </SolidCard>
          )}
        </aside>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(0)} size="xl" title="Vista previa (como estudiante)" subtitle="Aquí se corrige en su navegador; los estudiantes juegan contra el servidor.">
        {previewData && <ActivityGame key={preview} board={previewData.board} engine={previewData.engine} onAllDone={() => toast.success('¡Actividad completada!', 'Así termina para el estudiante: se entrega sola.')} />}
      </Modal>
      <PasteModal
        open={paste}
        onClose={() => setPaste(false)}
        type={type}
        onAdd={(rows) => {
          setItems((x) => [...x.filter((i) => i.term.trim() || i.prompt.trim()), ...rows].slice(0, meta.max))
          setDirty(true)
        }}
      />
      <BankModal
        mc={isMc}
        open={bank}
        onClose={() => setBank(false)}
        subjectId={quiz.subject_id}
        onAdd={(rows) => {
          setItems((x) => [...x.filter((i) => i.term.trim() || i.prompt.trim()), ...rows].slice(0, meta.max))
          setDirty(true)
        }}
      />
      <LaunchModal open={launch} onClose={() => setLaunch(false)} quiz={launch ? { id: quiz.id, title, subject_id: quiz.subject_id, questionCount: effItems.length, activity: type, launch: launchHint(quiz.settings) } : null} />
    </div>
  )
}

function validate(type: ActivityType, items: ActivityItem[], s: ActivitySettings) {
  const m = ACTIVITY_META[type]
  const errors: string[] = []
  const warnings: string[] = []
  if (items.length < m.min) errors.push(`Agregue al menos ${m.min} ${type === 'fill_text' ? 'espacios [entre corchetes]' : 'filas'}.`)
  if (items.length > m.max) errors.push(`Máximo ${m.max} filas en ${m.label.toLowerCase()}.`)
  items.forEach((it, i) => {
    if (!it.term.trim()) errors.push(`Fila ${i + 1}: falta “${m.termLabel.toLowerCase()}”.`)
    if (m.promptRequired && type !== 'classify' && !it.prompt.trim() && !it.image_url) errors.push(`Fila ${i + 1}: falta “${m.promptLabel.toLowerCase()}”.`)
    if (type === 'classify' && !it.group?.trim()) errors.push(`Fila ${i + 1}: falta el grupo.`)
    if ((type === 'crossword' || type === 'wordsearch' || type === 'hangman' || type === 'anagram') && gameLetters(it.term).length > 18) warnings.push(`Fila ${i + 1}: palabra muy larga (${gameLetters(it.term).length} letras).`)
    if (type === 'sentence' && it.term.trim().split(/\s+/).length < 3) warnings.push(`Fila ${i + 1}: la frase tiene muy pocas palabras.`)
  })
  if (type === 'classify') {
    const g = new Set(items.map((i) => i.group?.trim().toLowerCase()).filter(Boolean))
    if (g.size < 2) errors.push('Use al menos 2 grupos distintos.')
    if (g.size > 6) warnings.push('Más de 6 grupos se ve apretado en el celular.')
  }
  const dup = items.map((i) => gameLetters(i.term)).filter((t, i, a) => t && a.indexOf(t) !== i)
  if (dup.length && type !== 'classify') errors.push(`Palabras repetidas: ${[...new Set(dup)].join(', ')}.`)
  if (MC_TYPES.includes(type)) items.forEach((it, i) => !(it.extra?.wrong ?? []).some((w) => w.trim() && w.trim() !== it.term.trim()) && errors.push(`Fila ${i + 1}: escriba al menos una respuesta incorrecta.`))
  if (type === 'video') {
    if (!youtubeId(s.video_url)) errors.push('Pegue el enlace de YouTube del video.')
    items.forEach((it, i) => it.extra?.t === undefined && errors.push(`Fila ${i + 1}: escriba en qué minuto aparece (por ejemplo 1:30).`))
  }
  if (type === 'riddle') items.forEach((it, i) => !(it.extra?.clues ?? []).some((c) => c.trim()) && errors.push(`Fila ${i + 1}: escriba al menos una pista.`))
  if (type === 'yesno') items.forEach((it, i) => !['Sí', 'No'].includes(it.group ?? '') && errors.push(`Fila ${i + 1}: elija si la respuesta es Sí o No.`))
  if (type === 'rows') items.forEach((it, i) => it.term.split('|').filter((x) => x.trim()).length < 2 && errors.push(`Fila ${i + 1}: escriba al menos 2 elementos (uno por línea).`))
  if (type === 'map') {
    if (!s.image_url) errors.push('Suba la imagen del mapa.')
    items.forEach((it, i) => it.extra?.x === undefined && errors.push(`Fila ${i + 1}: ubique su punto en la imagen.`))
  }
  if (type === 'puzzle' && !s.image_url) errors.push('Suba la imagen que se descubre en el puzzle.')
  if (type === 'dialogue' && (s.dialogue ?? []).length < 2) errors.push('Escriba el diálogo (al menos 2 líneas) en Opciones.')
  if (type === 'dictation' && (s.listen ?? 'term') === 'prompt') items.forEach((it, i) => !it.prompt.trim() && errors.push(`Fila ${i + 1}: escriba la definición que se va a dictar.`))
  if (type === 'fill_text' && !s.text?.trim()) errors.push('Escriba el texto.')
  return { errors: [...new Set(errors)].slice(0, 6), warnings: [...new Set(warnings)].slice(0, 4) }
}

function BoardPreview({ type, s, items }: { type: 'crossword' | 'wordsearch'; s: ActivitySettings; items: ActivityItem[] }) {
  if (type === 'wordsearch') {
    const letters = s.grid?.letters ?? []
    const mark = new Set((s.grid?.placements ?? []).flatMap((p) => p.cells.map((c) => `${c[0]},${c[1]}`)))
    return (
      <div className="overflow-x-auto">
        <div className="mx-auto grid w-fit gap-[2px]" style={{ gridTemplateColumns: `repeat(${letters[0]?.length ?? 0}, 1.6rem)` }}>
          {letters.flatMap((row, y) =>
            [...row].map((c, x) => (
              <span key={`${y},${x}`} className={cn('grid size-[1.6rem] place-items-center rounded font-display text-sm font-black', mark.has(`${y},${x}`) ? 'bg-uap-green/20 text-uap-green dark:text-game-selva' : 'bg-ink/5 text-ink-soft')}>
                {c}
              </span>
            )),
          )}
        </div>
      </div>
    )
  }
  const L = s.layout
  if (!L) return null
  const cells = new Map<string, { ch: string; n?: number }>()
  for (const w of L.words) {
    const t = gameLetters(items[w.i]?.term ?? '')
    for (let k = 0; k < t.length; k++) {
      const key = w.dir === 'across' ? `${w.row},${w.col + k}` : `${w.row + k},${w.col}`
      cells.set(key, { ch: t[k], n: k === 0 ? w.n : cells.get(key)?.n })
    }
  }
  return (
    <div className="overflow-x-auto">
      <div className="mx-auto grid w-fit gap-[2px]" style={{ gridTemplateColumns: `repeat(${L.cols}, 1.6rem)` }}>
        {Array.from({ length: L.rows * L.cols }, (_, k) => {
          const key = `${Math.floor(k / L.cols)},${k % L.cols}`
          const c = cells.get(key)
          return c ? (
            <span key={key} className="relative grid size-[1.6rem] place-items-center rounded border border-uap-blue/30 bg-white font-display text-sm font-black text-uap-blue dark:bg-white/10 dark:text-white">
              {c.n && <span className="absolute left-0.5 top-0 text-[0.5rem] leading-none text-ink-soft">{c.n}</span>}
              {c.ch}
            </span>
          ) : (
            <span key={key} className="size-[1.6rem]" />
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">
        {L.words.length} de {items.length} palabras cruzadas · {L.rows}×{L.cols}
      </p>
    </div>
  )
}

/** Pegar filas copiadas de Excel/Word: columnas separadas por tabulador, “;” o “ - ”. */
function PasteModal({ open, onClose, type, onAdd }: { open: boolean; onClose: () => void; type: ActivityType; onAdd: (rows: ActivityItem[]) => void }) {
  const [txt, setTxt] = useState('')
  const rows = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = (l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : l.split(/\s+[-–:]\s+/)).map((x) => x.trim())
      const [term, prompt = '', third = '', ...rest] = parts
      if (type === 'classify') return { term, prompt: prompt, group: prompt }
      // opción múltiple: respuesta correcta · pregunta · incorrectas…
      if (MC_TYPES.includes(type)) return { term, prompt, extra: { wrong: [third, ...rest].filter(Boolean) } }
      if (type === 'riddle') return { term, prompt: '', extra: { clues: [prompt, third, ...rest].filter(Boolean) } }
      if (type === 'yesno') return { term, prompt: '', group: /^n/i.test(prompt) ? 'No' : 'Sí' }
      // filas: título · elementos en orden…
      if (type === 'rows') return { term: [prompt, third, ...rest].filter(Boolean).join(' | '), prompt: term }
      return { term, prompt, group: third }
    })
  const m = ACTIVITY_META[type]
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pegar desde Excel o Word"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="success"
            disabled={!rows.length}
            onClick={() => {
              onAdd(rows)
              setTxt('')
              onClose()
            }}
          >
            Agregar {rows.length} fila(s)
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-ink-soft">
        Una fila por línea: <strong>{m.termLabel}</strong>
        {(m.promptLabel || type === 'classify') && (
          <>
            {' '}
            y <strong>{type === 'classify' ? 'Grupo' : m.promptLabel}</strong>
          </>
        )}
        {MC_TYPES.includes(type) && (
          <>
            {' '}
            y luego las <strong>respuestas incorrectas</strong> (cada una en su columna)
          </>
        )}
        {type === 'riddle' && <> y luego las <strong>pistas</strong> (cada una en su columna)</>}
        {type === 'yesno' && <> y <strong>Sí</strong> o <strong>No</strong></>}
        {type === 'rows' && <> (primero el <strong>título</strong> y luego los elementos en orden, cada uno en su columna)</>}
        , separados por tabulador (copiado de Excel), punto y coma o guion.
      </p>
      <Textarea rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Cobija\tCapital del departamento de Pando\nRiberalta\tCiudad amazónica del Beni'} aria-label="Filas a pegar" />
    </Modal>
  )
}

/** Trae preguntas de una evaluación existente: respuesta corta y opción correcta → palabra + pista. */
function BankModal({ open, onClose, subjectId, onAdd, mc }: { open: boolean; onClose: () => void; subjectId: string; onAdd: (rows: ActivityItem[]) => void; mc?: boolean }) {
  const quizzes = useQuizzes()
  const toast = useToast()
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)
  const list = (quizzes.data ?? []).filter((z) => !activityOf(z)).sort((a, b) => Number(b.subject_id === subjectId) - Number(a.subject_id === subjectId))
  async function bring() {
    setBusy(true)
    try {
      const qs = await fetchQuestions(sel)
      const rows: ActivityItem[] = []
      for (const q of qs) {
        const term = q.type === 'short_text' ? q.accepted_answers[0] : ['single', 'image_choice'].includes(q.type) ? q.options.find((o) => o.is_correct)?.text : undefined
        // en los juegos de opción múltiple se traen también las opciones incorrectas
        const wrong = mc ? q.options.filter((o) => !o.is_correct && o.text?.trim()).map((o) => o.text.trim()) : []
        if (term?.trim() && (!mc || wrong.length)) rows.push({ term: term.trim(), prompt: q.prompt, image_url: q.image_url, extra: mc ? { wrong } : undefined })
      }
      if (!rows.length) toast.info('No se encontró nada para traer', 'Se usan las preguntas de respuesta corta y de opción única (con texto).')
      else {
        onAdd(rows)
        toast.success(`Se agregaron ${rows.length} filas`)
        onClose()
      }
    } catch (e) {
      toast.error('No se pudo leer la evaluación', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Traer palabras de una evaluación"
      subtitle="La respuesta correcta será la palabra y el enunciado, la pista."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={() => void bring()} disabled={!sel || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Traer
          </Button>
        </>
      }
    >
      <Select label="Evaluación" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">— Elija —</option>
        {list.map((z) => (
          <option key={z.id} value={z.id}>
            {z.title} · {z.subjects?.code} ({z.questions?.[0]?.count ?? 0} preguntas)
          </option>
        ))}
      </Select>
    </Modal>
  )
}
