import { ArrowDown, ArrowUp, BookMarked, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { EmptyState, Skeleton, Textarea } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useDeleteTopic, useReorderTopics, useSaveTopic, useTopics } from '../../lib/api/academic'
import type { Topic } from '../../types/db'

export function TopicsTab({ subjectId }: { subjectId: string }) {
  const topics = useTopics(subjectId)
  const reorder = useReorderTopics(subjectId)
  const del = useDeleteTopic(subjectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [modal, setModal] = useState<{ open: boolean; topic?: Topic }>({ open: false })
  const list = topics.data ?? []

  function move(i: number, dir: -1 | 1) {
    const next = [...list]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    reorder.mutate(next)
  }

  async function remove(t: Topic) {
    const ok = await confirm({
      title: `¿Eliminar el tema "${t.name}"?`,
      message: 'Las evaluaciones de este tema no se borran: quedan sin tema asignado.',
      confirmText: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(t.id)
      toast.success('Tema eliminado')
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message)
    }
  }

  return (
    <SolidCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Temas y unidades</h2>
          <p className="text-sm text-ink-soft">Organizan las evaluaciones y el banco de preguntas (Fase 3).</p>
        </div>
        <Button variant="success" onClick={() => setModal({ open: true })}>
          <Plus className="size-5" /> Nuevo tema
        </Button>
      </div>
      {topics.isLoading ? (
        <Skeleton className="h-32" />
      ) : !list.length ? (
        <EmptyState
          icon={<BookMarked className="size-8" />}
          title="Aún no hay temas"
          text="Por ejemplo: «Unidad 1 · Herramientas ofimáticas»."
          action={
            <Button variant="success" onClick={() => setModal({ open: true })}>
              <Plus className="size-5" /> Crear el primer tema
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {list.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-uap-blue/10 font-display font-black text-uap-blue dark:text-game-electric">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {t.unit && <span className="text-ink-soft">{t.unit} · </span>}
                  {t.name}
                </p>
                {t.description && <p className="truncate text-sm text-ink-soft">{t.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Bajar">
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModal({ open: true, topic: t })} aria-label="Editar">
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(t)} aria-label="Eliminar">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <TopicModal
        open={modal.open}
        topic={modal.topic}
        nextOrder={list.length + 1}
        subjectId={subjectId}
        onClose={() => setModal({ open: false })}
      />
    </SolidCard>
  )
}

function TopicModal({
  open,
  onClose,
  topic,
  subjectId,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  topic?: Topic
  subjectId: string
  nextOrder: number
}) {
  const save = useSaveTopic(subjectId)
  const toast = useToast()
  const [f, setF] = useState({ name: '', unit: '', description: '' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? (topic?.id ?? 'new') : null
  if (key !== lastKey) {
    setLastKey(key)
    setF({ name: topic?.name ?? '', unit: topic?.unit ?? `Unidad ${nextOrder}`, description: topic?.description ?? '' })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Escribe el nombre del tema')
    try {
      await save.mutateAsync({ id: topic?.id, ...f, sort_order: topic?.sort_order ?? nextOrder })
      toast.success(topic ? 'Tema actualizado' : 'Tema creado')
      onClose()
    } catch (err) {
      toast.error('No se pudo guardar', (err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={topic ? 'Editar tema' : 'Nuevo tema'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" type="submit" form="topic-form" disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="topic-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Unidad" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="Unidad 1" />
        <Input label="Nombre del tema" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <Textarea label="Descripción (opcional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </form>
    </Modal>
  )
}
