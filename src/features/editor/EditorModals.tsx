import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Database, Eye, FileArchive, FileSpreadsheet, Loader2, RotateCcw, Search, Upload, XCircle } from 'lucide-react'
import JSZip from 'jszip'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge, EmptyState } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useBank, useQuizzes } from '../../lib/api/quizzes'
import { cn } from '../../lib/cn'
import { readTable } from '../../lib/excel'
import { compressImage, uploadImage } from '../../lib/images'
import { gamePoints, grade, type StudentResponse } from '../../lib/scoring'
import { normalizeText } from '../../lib/text'
import { QuestionView, type RevealInfo } from '../play/QuestionView'
import { toStudentQuestion } from '../play/studentQuestion'
import { parseQuestionMatrix, ZIP_PREFIX, zipKey, type QuestionParseResult } from '../quizzes/questionImport'
import { QUESTION_TYPES, type EditorQuestion } from '../quizzes/questionModel'
import { downloadQuestionTemplate } from '../quizzes/questionTemplate'
import { TYPE_ICONS } from './typeIcons'

// =====================================================================
// Vista previa como estudiante
// =====================================================================
export function PreviewModal({
  open,
  onClose,
  questions,
  startIndex = 0,
}: {
  open: boolean
  onClose: () => void
  questions: EditorQuestion[]
  startIndex?: number
}) {
  const [i, setI] = useState(startIndex)
  const [round, setRound] = useState(0)
  const [response, setResponse] = useState<StudentResponse | null>(null)
  const [reveal, setReveal] = useState<RevealInfo | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [startAt, setStartAt] = useState(0)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const q = questions[i]
  const sq = useMemo(() => (q ? toStudentQuestion(q) : null), [q, round]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = open ? `${startIndex}` : null
  if (key !== lastKey) {
    setLastKey(key)
    setI(startIndex)
  }

  // Reinicia al cambiar de pregunta
  useEffect(() => {
    if (!open || !q) return
    setResponse(null)
    setReveal(null)
    setLeft(q.time_limit_sec)
    setStartAt(performance.now())
  }, [open, i, round, q])

  // Cronómetro
  useEffect(() => {
    if (!open || reveal || left === null) return
    if (left <= 0) {
      finish(null)
      return
    }
    const t = window.setTimeout(() => setLeft((l) => (l ?? 1) - 1), 1000)
    return () => window.clearTimeout(t)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  function finish(r: StudentResponse | null) {
    if (!q || reveal) return
    const g = grade(q, r)
    const ms = performance.now() - startAt
    setResponse(r)
    setReveal({
      correct: g.correct,
      partial: g.partial,
      points: gamePoints(q.base_points, ms, q.time_limit_sec, g.partial),
      correctKeys: q.options.filter((o) => o.is_correct).map((o) => o.key),
      correctOrder: q.type === 'ordering' ? q.options.map((o) => o.key) : undefined,
      acceptedAnswers: q.accepted_answers,
      explanation: q.explanation || null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Vista previa como estudiante" subtitle="Responde para ver cómo se califica. Nada se guarda.">
      {!q || !sq ? (
        <EmptyState icon={<Eye className="size-8" />} title="No hay preguntas" />
      ) : (
        <div className="flex flex-col gap-6">
          <QuestionView
            key={`${q.key}-${round}`}
            q={sq}
            index={i}
            total={questions.length}
            secondsLeft={reveal ? undefined : (left ?? undefined)}
            onSubmit={finish}
            submitted={!!response}
            reveal={reveal}
            response={response}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRound((r) => r + 1)}>
              <RotateCcw className="size-4" /> Repetir
            </Button>
            <Button variant="primary" size="sm" onClick={() => setI((x) => Math.min(questions.length - 1, x + 1))} disabled={i === questions.length - 1}>
              Siguiente <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// =====================================================================
// Banco de preguntas (copiar desde otras evaluaciones de la asignatura)
// =====================================================================
export function BankModal({
  open,
  onClose,
  subjectId,
  currentQuizId,
  onCopy,
}: {
  open: boolean
  onClose: () => void
  subjectId?: string
  currentQuizId: string
  onCopy: (ids: string[]) => Promise<void>
}) {
  const bank = useBank(subjectId, open)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const items = useMemo(() => (bank.data ?? []).filter((b) => b.quizId !== currentQuizId), [bank.data, currentQuizId])
  const tags = useMemo(() => [...new Set(items.flatMap((b) => b.question.tags))].sort(), [items])
  const list = useMemo(() => {
    const nq = normalizeText(q)
    return items.filter(
      (b) => (!tag || b.question.tags.includes(tag)) && (!nq || normalizeText(`${b.question.prompt} ${b.quizTitle} ${b.question.tags.join(' ')}`).includes(nq)),
    )
  }, [items, q, tag])

  async function copy() {
    setBusy(true)
    await onCopy(sel)
    setBusy(false)
    setSel([])
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Banco de preguntas"
      subtitle="Preguntas de tus otras evaluaciones de esta asignatura. Se copian (el original no cambia)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={() => void copy()} disabled={!sel.length || busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Database className="size-5" />}
            Agregar {sel.length || ''} pregunta{sel.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por texto, evaluación o etiqueta"
            className="h-11 w-full rounded-2xl border-2 border-line bg-surface-2 pl-10 pr-4 outline-none focus:border-uap-blue"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={cn('rounded-full px-2.5 py-1 text-xs font-bold', tag === t ? 'bg-uap-blue text-white' : 'bg-uap-blue/10 text-uap-blue dark:text-game-electric')}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        {bank.isLoading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-uap-green" />
        ) : !list.length ? (
          <EmptyState icon={<Database className="size-8" />} title="No hay preguntas para mostrar" text="Las preguntas de otras evaluaciones de esta asignatura aparecerán aquí." />
        ) : (
          <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
            {list.map((b) => {
              const on = sel.includes(b.question.id!)
              const Icon = TYPE_ICONS[b.question.type]
              return (
                <li key={b.question.id}>
                  <button
                    onClick={() => setSel((s) => (on ? s.filter((x) => x !== b.question.id) : [...s, b.question.id!]))}
                    className={cn('flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left', on ? 'border-uap-green bg-uap-green/8' : 'border-line hover:border-uap-green/40')}
                  >
                    <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2', on ? 'border-uap-green bg-uap-green text-white' : 'border-line')}>
                      {on && <Check className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{b.question.prompt || '(sin enunciado)'}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                        <Icon className="size-3.5" /> {QUESTION_TYPES[b.question.type].label} · {b.quizTitle}
                        {b.question.tags.map((t) => (
                          <span key={t} className="font-bold text-uap-blue dark:text-game-electric">
                            #{t}
                          </span>
                        ))}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// =====================================================================
// Mover pregunta a otra evaluación
// =====================================================================
export function MoveModal({
  open,
  onClose,
  currentQuizId,
  onMove,
}: {
  open: boolean
  onClose: () => void
  currentQuizId: string
  onMove: (targetId: string, title: string) => Promise<void>
}) {
  const quizzes = useQuizzes()
  const [busy, setBusy] = useState<string | null>(null)
  const list = (quizzes.data ?? []).filter((z) => z.id !== currentQuizId && z.status !== 'archived')
  return (
    <Modal open={open} onClose={onClose} title="Mover pregunta a…" subtitle="La pregunta se quita de esta evaluación y se agrega al final de la otra." size="sm">
      {!list.length ? (
        <p className="text-ink-soft">No tienes otras evaluaciones.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((z) => (
            <li key={z.id}>
              <button
                disabled={!!busy}
                onClick={async () => {
                  setBusy(z.id)
                  await onMove(z.id, z.title)
                  setBusy(null)
                  onClose()
                }}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-line p-3 text-left hover:border-uap-blue"
              >
                <span>
                  <span className="block font-semibold">{z.title}</span>
                  <span className="text-xs text-ink-soft">
                    {z.subjects?.code} · {z.subjects?.parallel}
                  </span>
                </span>
                {busy === z.id ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5 text-ink-soft" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// =====================================================================
// Importar preguntas desde Excel (+ ZIP de imágenes)
// =====================================================================
export function ImportQuestionsModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (qs: EditorQuestion[]) => Promise<void>
}) {
  const toast = useToast()
  const xlsxRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const [excel, setExcel] = useState<File | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [zipFiles, setZipFiles] = useState<Map<string, JSZip.JSZipObject>>(new Map())
  const [parsed, setParsed] = useState<QuestionParseResult | null>(null)
  const [onlyValid, setOnlyValid] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function reset() {
    setExcel(null)
    setZipFile(null)
    setZipFiles(new Map())
    setParsed(null)
    setOnlyValid(false)
    setBusy(null)
  }

  async function analyze(xf: File | null, zf: File | null) {
    if (!xf) return
    setBusy('Leyendo…')
    try {
      const files = new Map<string, JSZip.JSZipObject>()
      if (zf) {
        const zip = await JSZip.loadAsync(zf)
        zip.forEach((path, entry) => {
          if (!entry.dir && /\.(png|jpe?g|gif|webp|bmp)$/i.test(path) && !path.startsWith('__MACOSX')) files.set(zipKey(path), entry)
        })
      }
      setZipFiles(files)
      const res = parseQuestionMatrix(await readTable(xf), new Set(files.keys()))
      setParsed(res)
      if (res.fatal) toast.error('No se pudo leer el Excel', res.fatal)
    } catch (e) {
      toast.error('No se pudo abrir el archivo', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const valid = parsed?.rows.filter((r) => !r.errors.length && r.question) ?? []
  const hasErrors = (parsed?.stats.errors ?? 0) > 0
  const canImport = !!valid.length && (!hasErrors || onlyValid)

  async function doImport() {
    try {
      // 1. Subir imágenes del ZIP (comprimidas) y reemplazar los nombres por URLs
      const needed = [...new Set(valid.flatMap((r) => r.zipImages))]
      const urls = new Map<string, string>()
      for (let k = 0; k < needed.length; k++) {
        setBusy(`Subiendo imágenes ${k + 1}/${needed.length}…`)
        const entry = zipFiles.get(needed[k])!
        const raw = await entry.async('blob')
        const ext = needed[k].split('.').pop()?.toLowerCase()
        const typed = new Blob([raw], { type: ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg' })
        urls.set(needed[k], await uploadImage(await compressImage(typed)))
      }
      const fix = (u: string | null) => (u && u.startsWith(ZIP_PREFIX) ? (urls.get(u.slice(ZIP_PREFIX.length)) ?? null) : u)
      const qs = valid.map((r) => ({
        ...r.question!,
        image_url: fix(r.question!.image_url),
        options: r.question!.options.map((o) => ({ ...o, image_url: fix(o.image_url) })),
      }))
      setBusy(`Guardando ${qs.length} preguntas…`)
      await onImport(qs)
      reset()
      onClose()
    } catch (e) {
      toast.error('No se pudo importar', (e as Error).message)
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      size={parsed && !parsed.fatal ? 'xl' : 'md'}
      title="Importar preguntas desde Excel"
      subtitle={excel ? `${excel.name}${zipFile ? ` + ${zipFile.name}` : ''}` : 'Usa la plantilla de preguntas. Las imágenes pueden venir en un ZIP.'}
      footer={
        parsed && !parsed.fatal ? (
          <>
            <Button variant="secondary" onClick={reset} disabled={!!busy}>
              <ArrowLeft className="size-4" /> Otro archivo
            </Button>
            <Button variant="success" onClick={() => void doImport()} disabled={!canImport || !!busy}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              {busy ?? `Importar ${valid.length} pregunta${valid.length === 1 ? '' : 's'}`}
            </Button>
          </>
        ) : undefined
      }
    >
      {!parsed || parsed.fatal ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PickCard
              icon={<FileSpreadsheet className="size-10 text-uap-green" />}
              title={excel ? excel.name : '1. Excel de preguntas'}
              hint=".xlsx o .csv (obligatorio)"
              done={!!excel}
              onClick={() => xlsxRef.current?.click()}
            />
            <PickCard
              icon={<FileArchive className="size-10 text-game-violet" />}
              title={zipFile ? zipFile.name : '2. ZIP de imágenes'}
              hint="opcional: si la columna imagen usa nombres de archivo"
              done={!!zipFile}
              onClick={() => zipRef.current?.click()}
            />
          </div>
          <input ref={xlsxRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => setExcel(e.target.files?.[0] ?? null)} />
          <input ref={zipRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => setZipFile(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" size="sm" onClick={() => void downloadQuestionTemplate()}>
              <FileSpreadsheet className="size-4" /> Descargar plantilla
            </Button>
            <Button variant="success" onClick={() => void analyze(excel, zipFile)} disabled={!excel || !!busy}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Eye className="size-5" />} Revisar preguntas
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge>{parsed.stats.total} filas</Badge>
            {Object.entries(parsed.stats.byType).map(([t, n]) => (
              <Badge key={t} tone="blue">
                {n} {QUESTION_TYPES[t as keyof typeof QUESTION_TYPES].short}
              </Badge>
            ))}
            {zipFiles.size > 0 && <Badge tone="violet">{zipFiles.size} imágenes en el ZIP</Badge>}
            <Badge tone={hasErrors ? 'red' : 'green'}>{hasErrors ? `${parsed.stats.errors} con errores` : 'Sin errores'}</Badge>
          </div>
          {hasErrors && (
            <div className="rounded-2xl border border-uap-red/30 bg-uap-red/8 p-4">
              <p className="font-semibold text-uap-red dark:text-game-coral">Corrige estas filas en tu Excel y vuelve a subirlo, o importa solo las válidas.</p>
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5 accent-uap-green" checked={onlyValid} onChange={(e) => setOnlyValid(e.target.checked)} />
                Importar solo las {valid.length} filas válidas
              </label>
            </div>
          )}
          <div className="max-h-[52dvh] overflow-auto rounded-2xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-uap-blue text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Fila</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Pregunta</th>
                  <th className="px-3 py-2 text-left">Respuestas</th>
                  <th className="px-3 py-2 text-left">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.rowNumber} className={cn('border-t border-line align-top', r.errors.length && 'bg-uap-red/8')}>
                    <td className="px-3 py-2 font-mono text-ink-soft">{r.rowNumber}</td>
                    <td className="px-3 py-2">
                      {r.question ? <Badge tone="blue">{QUESTION_TYPES[r.question.type].short}</Badge> : <Badge tone="red">?</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{r.question?.prompt || '—'}</p>
                      {r.errors.map((m) => (
                        <p key={m} className="mt-1 flex items-start gap-1 text-xs font-semibold text-uap-red dark:text-game-coral">
                          <XCircle className="mt-px size-3.5 shrink-0" /> {m}
                        </p>
                      ))}
                      {r.warnings.map((m) => (
                        <p key={m} className="mt-1 text-xs font-semibold text-[#8f6c12] dark:text-uap-gold-300">
                          ⚠ {m}
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.question?.type === 'short_text'
                        ? r.question.accepted_answers.join(' | ')
                        : r.question?.options.map((o, k) => (
                            <span key={o.key} className={cn('mr-1 inline-block rounded px-1.5 py-0.5', o.is_correct && r.question?.type !== 'ordering' ? 'bg-uap-green text-white' : 'bg-ink/8')}>
                              {r.question?.type === 'ordering' ? `${k + 1}. ` : ''}
                              {o.text || (o.image_url ? '🖼' : '—')}
                            </span>
                          ))}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{r.question?.time_limit_sec}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

function PickCard({ icon, title, hint, done, onClick }: { icon: ReactNode; title: string; hint: string; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition-colors',
        done ? 'border-uap-green bg-uap-green/8' : 'border-line hover:border-uap-green/60',
      )}
    >
      {icon}
      <span className="font-display font-bold">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  )
}
