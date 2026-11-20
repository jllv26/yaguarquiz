import { useQueryClient } from '@tanstack/react-query'
import { Copy, ListChecks, Pencil, School } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { portalSetCode, portalUrl } from '../../lib/api/portal'
import { BulkAssignModal } from './BulkAssignModal'

/** Tarjeta del docente: el código fijo del aula y el botón para asignar varias actividades. */
export function AulaCard({ subjectId, code }: { subjectId: string; code: string | null | undefined }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [assign, setAssign] = useState(false)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(code ?? '')
  const [busy, setBusy] = useState(false)
  if (!code) return null
  const url = portalUrl(code)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado', 'Péguelo en el grupo de WhatsApp del curso.')
    } catch {
      toast.error('No se pudo copiar', url)
    }
  }
  async function save() {
    setBusy(true)
    try {
      await portalSetCode(subjectId, draft)
      await qc.invalidateQueries()
      setEdit(false)
      toast.success('Código cambiado')
    } catch (e) {
      toast.error('No se pudo cambiar', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-uap-green/40 bg-uap-green/10 p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-uap-green text-white">
        <School className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Aula de los estudiantes · un solo código</p>
        <p className="font-display text-2xl font-black tracking-wider">{code}</p>
        <p className="break-all text-xs text-ink-soft">{url}</p>
        <p className="mt-1 text-xs text-ink-soft">Entran una vez con su RU (y 3 dígitos del CI) y ven todas sus actividades y notas. Los correos ya llevan este enlace.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          <Copy className="size-4" /> Copiar enlace
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setDraft(code); setEdit(true) }} aria-label="Cambiar el código del aula">
          <Pencil className="size-4" />
        </Button>
        <Button size="sm" onClick={() => setAssign(true)}>
          <ListChecks className="size-4" /> Asignar actividades
        </Button>
      </div>
      {assign && <BulkAssignModal open onClose={() => setAssign(false)} subjectId={subjectId} />}
      <Modal
        open={edit}
        onClose={() => setEdit(false)}
        title="Código del aula"
        subtitle="De 4 a 14 letras o números. Si lo cambia, el enlace anterior deja de funcionar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={busy || draft.trim().length < 4}>
              Guardar
            </Button>
          </>
        }
      >
        <Input label="Código" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} autoFocus />
      </Modal>
    </section>
  )
}
