/** Imágenes del jaguar (generadas para YaguarQuiz) servidas desde /public/jaguar. */
const base = `${import.meta.env.BASE_URL}jaguar/`
export const jaguarImg = (name: string) => base + name

export const JAGUAR = {
  seria: jaguarImg('mascota_seria.webp'),
  rugido: jaguarImg('mascota_rugido.webp'),
  alerta: jaguarImg('mascota_alerta.webp'),
  triste: jaguarImg('mascota_triste.webp'),
  guino: jaguarImg('mascota_guino.webp'),
  rayo: jaguarImg('jaguar_rayo.webp'),
  rayoFrente: jaguarImg('jaguar_rayo_frente.webp'),
  salto: jaguarImg('jaguar_salto_rayo.webp'),
  zarpazo: jaguarImg('zarpazo_rayo.webp'),
  ojo: jaguarImg('ojo_acuarela.webp'),
  rostroAcuarela: jaguarImg('rostro_acuarela.webp'),
  descansando: jaguarImg('jaguar_descansando_acuarela.webp'),
  manchas: jaguarImg('manchas_tinta.webp'),
  huella: jaguarImg('huella.webp'),
  selva: jaguarImg('fondo_selva.webp'),
  selva960: jaguarImg('fondo_selva_960.webp'),
  piel: jaguarImg('piel_jaguar.webp'),
  video: jaguarImg('entrada.mp4'),
  poster: jaguarImg('entrada_poster.webp'),
}

/** Descarga por adelantado (en segundo plano) imágenes que se mostrarán pronto. */
export function preloadImages(urls: string[]) {
  if (typeof window === 'undefined') return
  const run = () =>
    urls.forEach((u) => {
      const i = new Image()
      i.decoding = 'async'
      i.src = u
    })
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (ric) ric(run)
  else window.setTimeout(run, 1200)
}
