/*
 * YaguarQuiz · service worker (caché para cargar rápido en el laboratorio).
 * - Archivos de /assets/ (llevan un código en el nombre): se guardan y se sirven desde la caché.
 * - La página (index.html) siempre se pide a internet primero, para recibir la versión nueva;
 *   si no hay internet, se usa la última guardada.
 * - Nunca guarda llamadas a Supabase ni a Google (datos en vivo).
 */
const VERSION = 'yq-v1'
const SCOPE = self.registration.scope

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (!url.href.startsWith(SCOPE)) return // otros dominios (Supabase, Google): sin caché

  const isAsset = url.pathname.includes('/assets/') || /\.(woff2|webp|png|svg)$/.test(url.pathname)
  if (isAsset) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      }),
    )
    return
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(SCOPE, copy))
          return res
        })
        .catch(() => caches.match(SCOPE).then((r) => r || Response.error())),
    )
  }
})
