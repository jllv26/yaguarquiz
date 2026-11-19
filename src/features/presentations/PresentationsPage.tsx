import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MonitorPlay, Pencil, Plus, Presentation, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { Badge, EmptyState, Skeleton } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { deletePresentation, presentationList } from '../../lib/api/presentations'
import { fmtDateTime } from '../../lib/dates'

export const PRES_STATUS = {
  draft: { label: 'Preparada', tone: 'gold' as const },
  open: { label: 'Abierta', tone: 'green' as const },
  closed: { label: 'Cerrada', tone: 'neutral' as const },
}

/** Exposiciones con evaluación entre pares (antes "Copa Salvando el Semestre"). */
export function PresentationsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['presentations'], queryFn: presentationList })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">Exposiciones</h1>
          <p className="max-w-2xl text-ink-soft">
            Los estudiantes salen al frente por grupos y sus compañeros los califican desde el celular o la PC con una rúbrica; usted también
            califica. La nota es individual y pasa a la libreta.
          </p>
        </div>
        <Button variant="success" onClick={() => navigate('/admin/exposiciones/nueva')}>
          <Plus className="size-5" /> Nueva exposición
        </Button>
      </header>

      {list.isLoading ? (
        <Skeleton className="h-48" />
      ) : !list.data?.length ? (
        <EmptyState
          icon={<Presentation className="size-8" />}
          title="Aún no tiene exposiciones"
          text="Cree una, arme los grupos con su lista de estudiantes y elija la rúbrica (la de la Copa ya viene lista)."
          action={
            <Button variant="success" onClick={() => navigate('/admin/exposiciones/nueva')}>
              <Plus className="size-5" /> Nueva exposición
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <SolidCard className="relative flex h-full flex-col gap-3 overflow-hidden p-5">
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: p.subject.theme_color || '#1B7339' }} />
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={PRES_STATUS[p.status].tone}>{PRES_STATUS[p.status].label}</Badge>
                  <Badge tone="blue">
                    {p.subject.code} · {p.subject.parallel}
                  </Badge>
                  {p.status !== 'closed' && <Badge tone="neutral">PIN {p.pin}</Badge>}
                </div>
                <button onClick={() => navigate(`/expo-host/${p.id}`)} className="text-left font-display text-xl font-bold leading-snug hover:underline">
                  {p.title}
                </button>
                <p className="text-sm text-ink-soft">
                  {p.done} de {p.presenters} expusieron · {p.reviews} calificaciones · {fmtDateTime(p.updated_at)}
                </p>
                <div className="mt-auto flex justify-end gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Eliminar ${p.title}`}
                    onClick={() =>
                      void (async () => {
                        if (await confirm({ title: `¿Eliminar "${p.title}"?`, message: 'Se borran los grupos, las calificaciones y los comentarios.', confirmText: 'Eliminar', danger: true })) {
                          await deletePresentation(p.id).catch((e: Error) => toast.error('No se pudo eliminar', e.message))
                          void qc.invalidateQueries({ queryKey: ['presentations'] })
                        }
                      })()
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/exposiciones/${p.id}`)}>
                    <Pencil className="size-4" /> Grupos y rúbrica
                  </Button>
                  <Button size="sm" variant="success" onClick={() => navigate(`/expo-host/${p.id}`)}>
                    <MonitorPlay className="size-4" /> Control
                  </Button>
                </div>
              </SolidCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
