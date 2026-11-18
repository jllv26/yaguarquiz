/**
 * Sonidos sintetizados con Web Audio (sin archivos que descargar: carga instantánea en el laboratorio).
 * Se pueden silenciar; la preferencia se guarda en el navegador.
 */
let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem('yq-mute') === '1'
  } catch {
    return false
  }
})()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('yq-mute', m ? '1' : '0')
  } catch {
    /* sin almacenamiento */
  }
}

function audio() {
  if (muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export const sfx = {
  tick: () => tone(880, 0, 0.08, 'square', 0.05),
  urgent: () => tone(1320, 0, 0.1, 'square', 0.08),
  countdown: () => tone(523, 0, 0.18, 'triangle', 0.2),
  go: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.2)),
  join: () => [784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.12, 'sine', 0.12)),
  sent: () => tone(660, 0, 0.12, 'sine', 0.12),
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.18)),
  wrong: () => [330, 247].forEach((f, i) => tone(f, i * 0.15, 0.35, 'sawtooth', 0.08)),
  reveal: () => [392, 523].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.16)),
  fanfare: () =>
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.2][i], i === 7 ? 0.9 : 0.2, 'triangle', 0.2)),
}
