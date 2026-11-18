import { supabase } from './supabase'

const MAX_SIDE = 1600
const TARGET_BYTES = 300 * 1024

function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = URL.createObjectURL(blob)
  })
}

/**
 * Reduce la imagen en el navegador: máximo 1600 px por lado, formato WebP,
 * bajando la calidad hasta quedar por debajo de ~300 KB.
 * Los GIF se suben tal cual (para conservar la animación) si pesan menos de 2 MB.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif') {
    if (file.size > 2 * 1024 * 1024) throw new Error('El GIF pesa más de 2 MB.')
    return file
  }
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  const bmp = await loadBitmap(file)
  const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width
  const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w0 * scale)
  canvas.height = Math.round(h0 * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  let quality = 0.85
  let out: Blob | null = null
  for (let i = 0; i < 6; i++) {
    out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality))
    if (!out) break
    if (out.size <= TARGET_BYTES) return out
    quality -= 0.12
  }
  if (out && out.type === 'image/webp') return out
  // Navegadores sin WebP: JPEG
  return await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('No se pudo comprimir.'))), 'image/jpeg', 0.8))
}

/** Sube una imagen (ya comprimida) al bucket "media" en la carpeta del docente y devuelve la URL pública. */
export async function uploadImage(blob: Blob, folder = 'quizzes'): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Tu sesión expiró. Vuelve a ingresar.')
  const ext = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${u.user.id}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(error.message.includes('row-level') ? 'No tienes permiso para subir imágenes.' : error.message)
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

/** Comprime y sube en un paso. */
export async function processAndUpload(file: Blob, folder?: string) {
  return uploadImage(await compressImage(file), folder)
}

/** Lee una imagen desde una URL pegada (si el sitio lo permite) para subirla a nuestro almacenamiento. */
export async function fetchImageFromUrl(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (!r.ok) return null
    const b = await r.blob()
    return b.type.startsWith('image/') ? b : null
  } catch {
    return null
  }
}
