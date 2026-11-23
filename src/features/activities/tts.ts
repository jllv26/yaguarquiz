// Voz del navegador (sin servidor ni archivos de audio): dictado y diálogo
import { useEffect, useState } from 'react'

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** Voces en español disponibles, la mejor primero (latinoamericanas antes que de España). */
export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return []
  const vs = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('es'))
  const pref = ['es-bo', 'es-419', 'es-us', 'es-mx', 'es-pe', 'es-ar', 'es-co', 'es-cl', 'es-es']
  const rank = (v: SpeechSynthesisVoice) => {
    const l = pref.indexOf(v.lang.toLowerCase().replace('_', '-'))
    return (l < 0 ? 50 : l * 2) - (/google|natural|neural|paulina|sabina|monica|mónica|helena|jorge|diego/i.test(v.name) ? 1 : 0)
  }
  return [...vs].sort((a, b) => rank(a) - rank(b))
}

export interface SpeakOpts {
  slow?: boolean
  /** 0.5 – 2 (más grave o más agudo, para distinguir personajes) */
  pitch?: number
  /** usar la voz n.º de la lista (si hay varias) */
  voice?: number
  onEnd?: () => void
}

/** Lee el texto en voz alta. Devuelve false si este navegador no puede hablar. */
export function speak(text: string, opts: SpeakOpts = {}): boolean {
  if (!canSpeak() || !text.trim()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const vs = spanishVoices()
  const v = vs.length ? vs[(opts.voice ?? 0) % vs.length] : null
  if (v) u.voice = v
  u.lang = v?.lang ?? 'es-419'
  u.rate = opts.slow ? 0.6 : 0.95
  u.pitch = opts.pitch ?? 1
  u.onend = () => opts.onEnd?.()
  u.onerror = () => opts.onEnd?.()
  synth.speak(u)
  return true
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}

/** Algunas voces cargan tarde (Chrome): espera a que estén listas y calla al salir. */
export function useVoicesReady() {
  const [ready, setReady] = useState(() => canSpeak() && window.speechSynthesis.getVoices().length > 0)
  useEffect(() => {
    if (!canSpeak() || ready) return
    const on = () => setReady(true)
    window.speechSynthesis.addEventListener?.('voiceschanged', on)
    const t = setTimeout(on, 1500)
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', on)
      clearTimeout(t)
    }
  }, [ready])
  useEffect(() => () => stopSpeaking(), [])
  return ready
}
