import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, ClipboardPaste, ListOrdered, Loader2, MonitorPlay, Plus, Save, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { Select, Skeleton, Textarea } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { presentationHost, presentationRoster, savePresentation, type HostState } from '../../lib/api/presentations'
import { useSubjectsLite } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { normalizeCode } from '../../lib/text'
import { COPA_RUBRIC, DEFAULT_SETTINGS, TEMPLATES, type PresentationSettings, type Rubric } from './rubric'

interface Row {
  include: boolean
  group_no: string
  topic: string
  day: string
  sort_order: string
}

export function PresentationEditorPage() {
  const { id = 'nueva' } = useParams()
  const isNew = id === 'nueva'
  const host = useQuery({ queryKey: ['presentation-host', id], queryFn: () => presentationHost(id), enabled: !isNew })
  if (!isNew && host.isLoading) return <Skeleton className="h-96" />
  if (!isNew && !host.data) return <p className="text-center text-ink-soft">La exposición no existe.</p>
  return <Editor key={id} id={isNew ? null : id} initial={host.data ?? null} />
}

function Editor({ id, initial }: { id: string | null; initial: HostState | null }) {
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const subjects = useSubjectsLite()
  const [title, setTitle] = useState(initial?.presentation.title ?? '')
  const [subjectId, setSubjectId] = useState(initial?.presentation.subject.id ?? '')
  const [settings, setSettings] = useState<PresentationSettings>({ ...DEFAULT_SETTINGS, ...(initial?.presentation.settings ?? {}) })
  const [rubric, setRubric] = useState<Rubric>(initial?.presentation.rubric ?? COPA_RUBRIC)
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      (initial?.presenters ?? []).map((p) => [p.student_id, { include: true, group_no: p.group_no ? String(p.group_no) : '', topic: p.topic ?? '', day: String(p.day), sort_order: String(p.sort_order) }]),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState(false)
  const roster = useQuery({ queryKey: ['pres-roster', subjectId], queryFn: () => presentationRoster(subjectId), enabled: !!subjectId })
  const students = useMemo(() => roster.data ?? [], [roster.data])

  // asignatura por defecto: la primera
  useEffect(() => {
    if (!subjectId && subjects.data?.length) setSubjectId(subjects.data[0].id)
  }, [subjects.data, subjectId])

  const row = (sid: string): Row => rows[sid] ?? { include: false, group_no: '', topic: '', day: '1', sort_order: '' }
  const set = (sid: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [sid]: { ...row(sid), ...patch } }))
  const chosen = students.filter((s) => row(s.id).include)
  const groups = new Set(chosen.map((s) => row(s.id).group_no).filter(Boolean))
  const days = new Set(chosen.map((s) => row(s.id).day))

  function renumber() {
    const ordered = [...chosen].sort((a, b) => {
      const ra = row(a.id)
      const rb = row(b.id)
      return Number(ra.day) - Number(rb.day) || (Number(ra.group_no) || 99) - (Number(rb.group_no) || 99) || a.name.localeCompare(b.name)
    })
    setRows((r) => {
      const n = { ...r }
      ordered.forEach((s, i) => (n[s.id] = { ...row(s.id), sort_order: String(i + 1) }))
      return n
    })
  }

  async function save(goHost: boolean) {
    if (!title.trim()) return toast.error('Escriba el título de la exposición')
    if (!subjectId) return toast.error('Elija la asignatura')
    if (!rubric.criteria.every((c) => c.title.trim())) return toast.error('Cada criterio necesita un título')
    if (!rubric.levels.every((l) => l.label.trim())) return toast.error('Cada nivel necesita un nombre')
    if (!chosen.length) return toast.error('Elija al menos un expositor de la lista')
    setBusy(true)
    try {
      const presenters = chosen.map((s, i) => {
        const r = row(s.id)
        return { student_id: s.id, group_no: r.group_no ? Number(r.group_no) : null, topic: r.topic.trim() || null, day: Number(r.day) || 1, sort_order: Number(r.sort_order) || i + 1 }
      })
      const pid = await savePresentation({ id, subject_id: subjectId, title: title.trim(), rubric, settings, presenters })
      void qc.invalidateQueries({ queryKey: ['presentations'] })
      void qc.invalidateQueries({ queryKey: ['presentation-host', pid] })
      toast.success('Exposición guardada')
      if (goHost) navigate(`/expo-host/${pid}`)
      else if (!id) navigate(`/admin/exposiciones/${pid}`, { replace: true })
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const levels = [...rubric.levels].sort((a, b) => a.v - b.v)
  const maxV = Math.max(...rubric.levels.map((l) => l.v))

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/admin/exposiciones" className="rounded-xl p-2 hover:bg-ink/5" aria-label="Volver a exposiciones">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{id ? 'Exposición' : 'Nueva exposición'}</p>
          <h1 className="truncate font-display text-2xl font-black sm:text-3xl">{title || 'Sin título'}</h1>
        </div>
        <Button variant="success" onClick={() => void save(false)} disabled={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />} Guardar
        </Button>
        <Button variant="gold" onClick={() => void save(true)} disabled={busy}>
          <MonitorPlay className="size-5" /> Guardar e ir al control
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          <SolidCard className="grid gap-4 p-5 sm:grid-cols-2">
            <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Exposiciones del tercer parcial" />
            <Select label="Asignatura" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!!id}>
              <option value="">— Elija —</option>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({s.parallel}) · {s.name}
                </option>
              ))}
            </Select>
          </SolidCard>

          {/* expositores */}
          <SolidCard className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
              <h2 className="mr-auto font-display text-lg font-black">
                <Users className="mr-1 inline size-5" /> Expositores: {chosen.length} en {groups.size} grupo(s){days.size > 1 ? ` · ${days.size} días` : ''}
              </h2>
              <Button size="sm" variant="secondary" onClick={() => setRows((r) => ({ ...r, ...Object.fromEntries(students.map((s) => [s.id, { ...row(s.id), include: true }])) }))} disabled={!students.length}>
                Todos
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPaste(true)} disabled={!students.length}>
                <ClipboardPaste className="size-4" /> Pegar desde Excel
              </Button>
              <Button size="sm" variant="secondary" onClick={renumber} disabled={!chosen.length}>
                <ListOrdered className="size-4" /> Ordenar por grupo
              </Button>
            </div>
            {!subjectId ? (
              <p className="p-5 text-ink-soft">Elija la asignatura.</p>
            ) : roster.isLoading ? (
              <Skeleton className="m-4 h-40" />
            ) : !students.length ? (
              <p className="p-5 text-ink-soft">La asignatura no tiene estudiantes inscritos. Agréguelos en Asignaturas → Estudiantes.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                      <th className="w-10 px-3 py-2">
                        <span className="sr-only">Expone</span>
                      </th>
                      <th className="px-2 py-2">Estudiante</th>
                      <th className="w-20 px-2 py-2">Grupo</th>
                      <th className="px-2 py-2">Tema</th>
                      <th className="w-20 px-2 py-2">Día</th>
                      <th className="w-20 px-2 py-2">Orden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const r = row(s.id)
                      return (
                        <tr key={s.id} className={cn('border-t border-line', !r.include && 'bg-ink/[0.03]')}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" checked={r.include} onChange={(e) => set(s.id, { include: e.target.checked })} aria-label={`${s.name} expone`} className="size-5 accent-uap-green" />
                          </td>
                          <td className="px-2 py-1.5">
                            <p className="font-semibold">{s.name}</p>
                            <p className="text-xs text-ink-soft">{s.code}</p>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={1} value={r.group_no} onChange={(e) => set(s.id, { group_no: e.target.value, include: true })} aria-label={`Grupo de ${s.name}`} className="h-10 w-16 rounded-xl border-2 border-line bg-surface-2 text-center font-bold" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={r.topic} onChange={(e) => set(s.id, { topic: e.target.value, include: true })} aria-label={`Tema de ${s.name}`} className="h-10 w-full min-w-40 rounded-xl border-2 border-line bg-surface-2 px-3" />
                          </td>
                          <td className="px-2 py-1.5">
                            <select value={r.day} onChange={(e) => set(s.id, { day: e.target.value })} aria-label={`Día de ${s.name}`} className="h-10 w-16 rounded-xl border-2 border-line bg-surface-2 text-center">
                              {[1, 2, 3, 4, 5].map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={1} value={r.sort_order} onChange={(e) => set(s.id, { sort_order: e.target.value })} aria-label={`Orden de ${s.name}`} className="h-10 w-16 rounded-xl border-2 border-line bg-surface-2 text-center" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SolidCard>

          {/* rúbrica */}
          <SolidCard className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-display text-lg font-black">Rúbrica</h2>
              {TEMPLATES.map((t) => (
                <Button key={t.id} size="sm" variant="secondary" onClick={() => setRubric(JSON.parse(JSON.stringify(t.rubric)) as Rubric)}>
                  Usar: {t.name}
                </Button>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Niveles (de menor a mayor)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {levels.map((l) => (
                  <div key={l.v} className="flex items-center gap-2 rounded-2xl border border-line p-2">
                    <span className="w-14 shrink-0 text-center text-xs font-bold text-ink-soft">{l.v} pt</span>
                    <input value={l.emoji} onChange={(e) => setRubric({ ...rubric, levels: rubric.levels.map((x) => (x.v === l.v ? { ...x, emoji: e.target.value } : x)) })} aria-label={`Emoji del nivel ${l.v}`} className="h-10 w-12 rounded-xl border-2 border-line bg-surface-2 text-center text-xl" />
                    <input value={l.label} onChange={(e) => setRubric({ ...rubric, levels: rubric.levels.map((x) => (x.v === l.v ? { ...x, label: e.target.value } : x)) })} aria-label={`Nombre del nivel ${l.v}`} className="h-10 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface-2 px-2 font-semibold" />
                    <input value={l.hint} onChange={(e) => setRubric({ ...rubric, levels: rubric.levels.map((x) => (x.v === l.v ? { ...x, hint: e.target.value } : x)) })} aria-label={`Significado del nivel ${l.v}`} className="h-10 w-28 rounded-xl border-2 border-line bg-surface-2 px-2 text-sm" />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="ghost" disabled={rubric.levels.length >= 6} onClick={() => setRubric({ ...rubric, levels: [...rubric.levels, { v: maxV + 1, emoji: '⭐', label: 'Nuevo nivel', hint: '' }] })}>
                  <Plus className="size-4" /> Nivel
                </Button>
                <Button size="sm" variant="ghost" disabled={rubric.levels.length <= 2} onClick={() => setRubric({ ...rubric, levels: rubric.levels.filter((l) => l.v !== maxV) })}>
                  <Trash2 className="size-4" /> Quitar el más alto
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Criterios ({rubric.criteria.length})</p>
              {rubric.criteria.map((c, i) => {
                const upd = (patch: Partial<typeof c>) => setRubric({ ...rubric, criteria: rubric.criteria.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
                const move = (d: number) => {
                  const cs = [...rubric.criteria]
                  ;[cs[i], cs[i + d]] = [cs[i + d], cs[i]]
                  setRubric({ ...rubric, criteria: cs })
                }
                return (
                  <div key={i} className="rounded-2xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-black text-ink-soft">{i + 1}</span>
                      <input value={c.icon} onChange={(e) => upd({ icon: e.target.value })} aria-label={`Ícono del criterio ${i + 1}`} className="h-10 w-12 rounded-xl border-2 border-line bg-surface-2 text-center text-xl" />
                      <input value={c.title} onChange={(e) => upd({ title: e.target.value })} aria-label={`Título del criterio ${i + 1}`} placeholder="Título" className="h-10 min-w-40 flex-1 rounded-xl border-2 border-line bg-surface-2 px-3 font-semibold" />
                      <Button size="sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(-1)}>
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Bajar" disabled={i === rubric.criteria.length - 1} onClick={() => move(1)}>
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Quitar criterio ${i + 1}`} disabled={rubric.criteria.length <= 1} onClick={() => setRubric({ ...rubric, criteria: rubric.criteria.filter((_, k) => k !== i) })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <input value={c.question} onChange={(e) => upd({ question: e.target.value })} aria-label={`Pregunta guía del criterio ${i + 1}`} placeholder="Pregunta guía (¿qué deben observar?)" className="mt-2 h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-3 text-sm" />
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {levels.map((l) => (
                        <label key={l.v} className="text-xs">
                          <span className="font-semibold">
                            {l.emoji} {l.label}
                          </span>
                          <textarea value={c.levels?.[String(l.v)] ?? ''} onChange={(e) => upd({ levels: { ...c.levels, [String(l.v)]: e.target.value } })} rows={2} className="mt-1 w-full rounded-xl border-2 border-line bg-surface-2 p-2 text-sm" />
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              <Button size="sm" variant="ghost" className="self-start" disabled={rubric.criteria.length >= 10} onClick={() => setRubric({ ...rubric, criteria: [...rubric.criteria, { icon: '⭐', title: '', question: '', levels: {} }] })}>
                <Plus className="size-4" /> Agregar criterio
              </Button>
            </div>
          </SolidCard>
        </div>

        <aside className="flex flex-col gap-4">
          <SolidCard className="flex flex-col gap-4 p-5">
            <h2 className="font-display text-lg font-black">Cómo se califica</h2>
            <label className="text-sm">
              <span className="font-semibold">Peso de su nota</span>
              <input type="range" min={0} max={100} step={10} value={settings.teacher_weight} onChange={(e) => setSettings({ ...settings, teacher_weight: Number(e.target.value) })} className="mt-2 w-full accent-uap-green" aria-label="Peso de la nota del docente" />
              <span className="mt-1 flex justify-between font-display font-black">
                <span>Usted {settings.teacher_weight} %</span>
                <span>Compañeros {100 - settings.teacher_weight} %</span>
              </span>
            </label>
            <p className="rounded-2xl bg-ink/5 p-3 text-xs text-ink-soft">
              Nota de cada calificación = suma de los criterios ÷ ({rubric.criteria.length} × {maxV}) × 100. Si usted no califica a alguien, cuenta solo el promedio de los compañeros (y al revés). Ausente = 0.
            </p>
            <Toggle on={settings.block_own_group} onChange={(v) => setSettings({ ...settings, block_own_group: v })} title="No calificar a su propio grupo" />
            <Toggle on={settings.require_ci} onChange={(v) => setSettings({ ...settings, require_ci: v })} title="Pedir los últimos 3 dígitos del CI al entrar" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" label="«¿Por qué?» mínimo" value={String(settings.min_why)} onChange={(e) => setSettings({ ...settings, min_why: Math.max(0, Number(e.target.value)) })} />
              <Input type="number" label="«¿Qué entendió?» mínimo" value={String(settings.min_understood)} onChange={(e) => setSettings({ ...settings, min_understood: Math.max(0, Number(e.target.value)) })} />
            </div>
            <p className="text-xs text-ink-soft">Caracteres mínimos de cada comentario (0 = opcional).</p>
          </SolidCard>
        </aside>
      </div>

      <PasteModal
        open={paste}
        onClose={() => setPaste(false)}
        onApply={(lines) => {
          const byCode = new Map(students.map((s) => [normalizeCode(s.code), s.id]))
          let ok = 0
          const missing: string[] = []
          const next = { ...rows }
          for (const l of lines) {
            const sid = byCode.get(normalizeCode(l[0]))
            if (!sid) {
              if (l[0]) missing.push(l[0])
              continue
            }
            next[sid] = { ...row(sid), include: true, group_no: l[1] ?? row(sid).group_no, topic: l[2] ?? row(sid).topic, day: l[3] && /^\d+$/.test(l[3]) ? l[3] : row(sid).day }
            ok++
          }
          setRows(next)
          if (missing.length) toast.info(`${ok} filas aplicadas`, `Estos RU no están en la asignatura: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`)
          else toast.success(`${ok} expositores listos`)
        }}
      />
    </div>
  )
}

function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-uap-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-uap-blue" />
      {title}
    </label>
  )
}

function PasteModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (lines: string[][]) => void }) {
  const [txt, setTxt] = useState('')
  const lines = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes('\t') ? l.split('\t') : l.split(';')).map((x) => x.trim()))
    .filter((l) => !/^ru$/i.test(l[0]))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pegar grupos desde Excel"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="success"
            disabled={!lines.length}
            onClick={() => {
              onApply(lines)
              setTxt('')
              onClose()
            }}
          >
            Aplicar {lines.length} fila(s)
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-ink-soft">
        Copie de Excel cuatro columnas: <b>RU</b>, <b>Grupo</b>, <b>Tema</b> y <b>Día</b> (el día es opcional). Una fila por estudiante.
      </p>
      <Textarea rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'202312345\t1\tRedes sociales para negocios\t1\n202312346\t1\tEl community manager\t1'} aria-label="Filas a pegar" />
    </Modal>
  )
}
