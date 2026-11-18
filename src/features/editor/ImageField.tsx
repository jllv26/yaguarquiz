import { ImagePlus, Link2, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/cn'
import { fetchImageFromUrl, processAndUpload } from '../../lib/images'

/**
 * Campo de imagen: arrastrar, pegar (Ctrl+V), elegir archivo o pegar una URL.
 * La imagen se comprime (máx. 1600 px, WebP) y se sube a Supabase Storage.
 */
export function ImageField({
  value,
  onChange,
  compact,
  label = 'Agregar imagen',
  className,
}: {
  value: string | null
  onChange: (url: string | null) => void
  compact?: boolean
  label?: string
  className?: string
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [urlMode, setUrlMode] = useState(false)
  const [url, setUrl] = useState('')

  async function upload(file: Blob) {
    setBusy(true)
    try {
      onChange(await processAndUpload(file))
    } catch (e) {
      toast.error('No se pudo subir la imagen', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function applyUrl() {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) return toast.error('Dirección inválida', 'Debe empezar con https://')
    setBusy(true)
    // Si el sitio lo permite, se copia a nuestro almacenamiento (más rápido y no se rompe); si no, se usa el enlace.
    const blob = await fetchImageFromUrl(u)
    try {
      onChange(blob ? await processAndUpload(blob) : u)
    } catch {
      onChange(u)
    }
    setBusy(false)
    setUrlMode(false)
    setUrl('')
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void upload(f)
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
    const f = item?.getAsFile()
    if (f) {
      e.preventDefault()
      void upload(f)
    }
  }

  if (value)
    return (
      <div className={cn('group relative overflow-hidden rounded-3xl bg-ink/5', className)} onPaste={onPaste} tabIndex={0}>
        <img src={value} alt="" className={cn('mx-auto w-full object-contain', compact ? 'aspect-[4/3]' : 'max-h-64')} />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="size-8 animate-spin text-white" />
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button onClick={() => inputRef.current?.click()} className="rounded-xl bg-white/90 p-2 text-ink shadow" aria-label="Cambiar imagen">
            <ImagePlus className="size-4" />
          </button>
          <button onClick={() => onChange(null)} className="rounded-xl bg-white/90 p-2 text-uap-red shadow" aria-label="Quitar imagen">
            <Trash2 className="size-4" />
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </div>
    )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-center text-ink-soft outline-none transition-colors focus:border-uap-blue',
        drag ? 'border-uap-green bg-uap-green/8' : 'border-line hover:border-uap-green/60',
        compact ? 'aspect-[4/3] p-2' : 'px-4 py-6',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-8 animate-spin text-uap-green" />
      ) : urlMode ? (
        <div className="flex w-full max-w-md flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="h-10 w-full rounded-xl border-2 border-line bg-surface-2 px-3 text-sm text-ink outline-none focus:border-uap-blue"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void applyUrl())}
          />
          <div className="flex justify-center gap-2 text-sm font-semibold">
            <button onClick={() => void applyUrl()} className="rounded-lg bg-uap-green px-3 py-1 text-white">
              Usar
            </button>
            <button onClick={() => setUrlMode(false)} className="rounded-lg px-3 py-1 hover:bg-ink/5">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <button onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-1">
            <ImagePlus className={compact ? 'size-7' : 'size-9'} />
            <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>{label}</span>
          </button>
          {!compact && <span className="text-xs">Arrastra, pega (Ctrl+V) o elige un archivo</span>}
          <button onClick={() => setUrlMode(true)} className="flex items-center gap-1 text-xs font-semibold hover:text-ink">
            <Link2 className="size-3.5" /> Desde URL
          </button>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
    </div>
  )
}
