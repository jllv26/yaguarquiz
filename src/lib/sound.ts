/**
 * Sonido de YaguarQuiz, 100 % sintetizado con Web Audio: no hay archivos que descargar
 * (carga instantánea en el laboratorio) ni música con derechos de autor.
 *
 * - Dos canales con volumen propio: música y efectos. Preferencias guardadas en el navegador.
 * - Música en bucle generada en tiempo real: "sala" (marimba amazónica relajada) y "pregunta" (tensión).
 * - Los navegadores bloquean el audio hasta el primer clic; se activa solo al tocar la página.
 */
type Prefs = { muted: boolean; music: number; sfx: number; studentMusic: boolean }
const DEFAULTS: Prefs = { muted: false, music: 0.55, sfx: 0.8, studentMusic: false }

function load(): Prefs {
  try {
    const raw = localStorage.getItem('yq-sound')
    const old = localStorage.getItem('yq-mute')
    const p = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS }
    if (!raw && old === '1') p.muted = true
    return p
  } catch {
    return { ...DEFAULTS }
  }
}
let prefs = load()
const listeners = new Set<() => void>()
function save() {
  try {
    localStorage.setItem('yq-sound', JSON.stringify(prefs))
  } catch {
    /* sin almacenamiento */
  }
  applyGains()
  listeners.forEach((l) => l())
}

export const soundPrefs = () => prefs
export function setSoundPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p }
  save()
}
export function onSoundPrefs(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export const isMuted = () => prefs.muted
export const setMuted = (m: boolean) => setSoundPrefs({ muted: m })

// ------------------------------------------------------------------ motor
let ctx: AudioContext | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let unlocked = false

function applyGains() {
  if (!ctx || !musicBus || !sfxBus) return
  const t = ctx.currentTime
  musicBus.gain.setTargetAtTime(prefs.muted ? 0 : prefs.music * 0.6, t, 0.08)
  sfxBus.gain.setTargetAtTime(prefs.muted ? 0 : prefs.sfx, t, 0.03)
}

function audio() {
  // No se crea el audio antes del primer clic o tecla (los navegadores lo bloquean)
  if (!unlocked) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      musicBus = ctx.createGain()
      sfxBus = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      musicBus.connect(comp)
      sfxBus.connect(comp)
      comp.connect(ctx.destination)
      applyGains()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// Audio HTML mudo: en el iPhone hace que los efectos suenen aunque el interruptor de silencio esté activado
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
let silentEl: HTMLAudioElement | null = null

/** Desbloquea el audio con un gesto del usuario (requisito de los navegadores). */
export function unlockAudio() {
  unlocked = true
  try {
    // Safari 17+: el audio de la página se comporta como reproducción, no como timbre
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback'
  } catch {
    /* sin soporte */
  }
  try {
    if (!silentEl) {
      silentEl = new Audio(SILENT)
      silentEl.setAttribute('playsinline', '')
      silentEl.loop = false
      silentEl.volume = 0
    }
    void silentEl.play().catch(() => {})
  } catch {
    /* sin soporte */
  }
  const a = audio()
  if (a && a.state !== 'running') void a.resume()
  // si ya se había pedido música, empieza ahora
  if (current && !timer && a) startLoop(a)
}
if (typeof window !== 'undefined') {
  // En el celular el «pointerdown» de un toque no da permiso para sonar: se reintenta con cada toque,
  // clic o tecla hasta que el audio quede activo (antes se intentaba una sola vez y quedaba mudo).
  const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const
  const tryUnlock = () => {
    unlockAudio()
    if (ctx && ctx.state === 'running') events.forEach((e) => window.removeEventListener(e, tryUnlock, true))
  }
  events.forEach((e) => window.addEventListener(e, tryUnlock, { capture: true, passive: true }))
  // al volver a la pestaña (o desbloquear el celular) el navegador puede suspender el audio
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') events.forEach((e) => window.addEventListener(e, tryUnlock, { capture: true, passive: true }))
  })
}

/** Vibración corta en celulares Android (los iPhone la ignoran). */
export function haptic(pattern: number | number[]) {
  try {
    if (prefs.muted) return
    navigator.vibrate?.(pattern)
  } catch {
    /* sin soporte */
  }
}
let lastClick = 0

function noise(a: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const s = a.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  return s
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, bus: 'sfx' | 'music' = 'sfx', at?: number) {
  const a = audio()
  if (!a || (bus === 'sfx' ? !sfxBus : !musicBus)) return
  if (bus === 'sfx' && (prefs.muted || prefs.sfx === 0)) return
  const t = (at ?? a.currentTime) + start
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(bus === 'sfx' ? sfxBus! : musicBus!)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** Tono que se desliza de una frecuencia a otra (saltos, caídas, «bonk»). */
function glide(f1: number, f2: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.12) {
  const a = audio()
  if (!a || !sfxBus || prefs.muted || prefs.sfx === 0) return
  const t = a.currentTime + start
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f1, t)
  o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.setValueAtTime(vol, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(sfxBus)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function hit(start: number, dur: number, vol: number, filter: { type: BiquadFilterType; freq: number; q?: number }, bus: 'sfx' | 'music' = 'sfx', at?: number) {
  const a = audio()
  if (!a || (bus === 'sfx' ? !sfxBus : !musicBus)) return
  if (bus === 'sfx' && (prefs.muted || prefs.sfx === 0)) return
  const t = (at ?? a.currentTime) + start
  const n = noise(a)
  const f = a.createBiquadFilter()
  f.type = filter.type
  f.frequency.value = filter.freq
  f.Q.value = filter.q ?? 1
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  n.connect(f).connect(g).connect(bus === 'sfx' ? sfxBus! : musicBus!)
  n.start(t, Math.random() * 0.5)
  n.stop(t + dur + 0.05)
}

// ------------------------------------------------------------------ efectos
export const sfx = {
  tick: () => tone(880, 0, 0.08, 'square', 0.05),
  /** Clic suave de botones y enlaces (toda la página). */
  click: () => {
    const now = performance.now()
    if (now - lastClick < 60) return
    lastClick = now
    tone(1250, 0, 0.045, 'sine', 0.07)
    tone(620, 0.005, 0.04, 'triangle', 0.05)
  },
  /** Toque de letra, ficha o casilla. */
  tap: () => tone(980 + Math.random() * 120, 0, 0.05, 'sine', 0.08),
  /** Se abre una ventana o un menú. */
  open: () => {
    hit(0, 0.16, 0.09, { type: 'bandpass', freq: 2400, q: 0.7 })
    tone(520, 0, 0.12, 'sine', 0.07)
    tone(780, 0.05, 0.12, 'sine', 0.07)
  },
  /** Se cierra una ventana. */
  close: () => {
    hit(0, 0.12, 0.07, { type: 'bandpass', freq: 1600, q: 0.7 })
    tone(700, 0, 0.1, 'sine', 0.06)
    tone(470, 0.05, 0.1, 'sine', 0.06)
  },
  /** Cambio de pantalla. */
  whoosh: () => hit(0, 0.28, 0.12, { type: 'bandpass', freq: 900, q: 0.6 }),
  /** Voltear una carta. */
  flip: () => {
    hit(0, 0.06, 0.18, { type: 'highpass', freq: 2500 })
    tone(640, 0.01, 0.06, 'triangle', 0.06)
  },
  /** Puntos que llegan al marcador. */
  coin: () => {
    tone(988, 0, 0.09, 'square', 0.06)
    tone(1319, 0.07, 0.2, 'square', 0.06)
  },
  /** Cada estrella del resultado (n = 1, 2 o 3: cada una más aguda). */
  star: (n = 1) => {
    const base = [784, 988, 1175][Math.max(0, Math.min(2, n - 1))]
    tone(base, 0, 0.25, 'triangle', 0.18)
    tone(base * 1.5, 0.06, 0.3, 'sine', 0.1)
    hit(0.02, 0.25, 0.06, { type: 'highpass', freq: 6000 })
  },
  /** Aviso de tiempo (quedan 5 minutos o 1 minuto). */
  warning: () => [880, 660, 880].forEach((f, i) => tone(f, i * 0.16, 0.18, 'triangle', 0.16)),
  /** Ánimo cuando el resultado es bajo (no es un castigo). */
  encourage: () => [392, 440, 523].forEach((f, i) => tone(f, i * 0.14, 0.3, 'triangle', 0.14)),
  /** Notificación o mensaje. */
  notify: () => [1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.16, 'sine', 0.1)),
  /** Tic-tac de los últimos segundos: más golpes por segundo a medida que se acaba el tiempo. */
  urgent: (secsLeft = 5) => {
    const n = Math.max(1, Math.min(4, 6 - secsLeft))
    for (let i = 0; i < n; i++) tone(i % 2 ? 990 : 1320, i / n, 0.07, 'square', 0.07)
  },
  countdown: () => {
    tone(523, 0, 0.2, 'triangle', 0.22)
    hit(0, 0.12, 0.25, { type: 'lowpass', freq: 180 })
  },
  go: () => {
    ;[523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.2))
    hit(0, 0.25, 0.35, { type: 'lowpass', freq: 140 })
  },
  join: () => [784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.12, 'sine', 0.12)),
  sent: () => {
    tone(660, 0, 0.1, 'sine', 0.14)
    tone(990, 0.06, 0.12, 'sine', 0.1)
  },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.18)),
  /** Error: «bonk-bonk» que baja, bien audible en el parlante del celular. */
  wrong: () => {
    glide(440, 280, 0, 0.2, 'square', 0.13)
    glide(330, 190, 0.18, 0.3, 'square', 0.13)
    hit(0, 0.18, 0.3, { type: 'lowpass', freq: 220 })
  },
  /** Se acabaron los intentos de una palabra: trombón triste «wah-wah-wah-waaah». */
  fail: () => {
    ;[466, 440, 415].forEach((f, i) => glide(f, f * 0.97, i * 0.28, 0.26, 'triangle', 0.16))
    glide(392, 330, 0.84, 0.75, 'triangle', 0.16)
    glide(196, 165, 0.84, 0.75, 'square', 0.05)
  },
  /** Acción no válida («completa la palabra»): «eh-eh» corto. */
  nope: () => {
    tone(200, 0, 0.09, 'square', 0.09)
    tone(200, 0.13, 0.09, 'square', 0.09)
  },
  /** Se acabó el tiempo: chicharra. */
  timeUp: () => {
    tone(196, 0, 0.8, 'square', 0.12)
    tone(147, 0, 0.8, 'sawtooth', 0.08)
    hit(0, 0.3, 0.3, { type: 'lowpass', freq: 200 })
  },
  /** Rana: salto, croar y chapuzón. */
  jump: () => glide(260, 900, 0, 0.2, 'sine', 0.16),
  ribbit: () => {
    glide(320, 190, 0, 0.09, 'square', 0.1)
    glide(340, 200, 0.13, 0.11, 'square', 0.1)
  },
  splash: () => {
    hit(0, 0.5, 0.35, { type: 'bandpass', freq: 900, q: 0.5 })
    hit(0.04, 0.35, 0.2, { type: 'highpass', freq: 3000 })
    glide(700, 160, 0, 0.35, 'sine', 0.14)
  },
  reveal: () => {
    ;[392, 523].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.16))
    hit(0, 0.4, 0.12, { type: 'highpass', freq: 5000 })
  },
  rankUp: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.05, 0.16, 'sine', 0.12)),
  /** Redoble de tambor (para antes del podio). */
  drumroll: (secs = 2) => {
    const steps = Math.floor(secs / 0.045)
    for (let i = 0; i < steps; i++) {
      const v = 0.08 + (i / steps) * 0.22
      hit(i * 0.045, 0.06, v, { type: 'bandpass', freq: 1800, q: 0.8 })
    }
    hit(secs, 0.6, 0.5, { type: 'lowpass', freq: 160 })
    hit(secs, 0.9, 0.25, { type: 'highpass', freq: 6000 })
  },
  /** Aplausos: muchas palmadas cortas al azar. */
  applause: (secs = 3) => {
    for (let i = 0; i < secs * 45; i++) {
      const t = Math.random() * secs
      const fade = t > secs - 0.8 ? (secs - t) / 0.8 : 1
      hit(t, 0.03 + Math.random() * 0.03, (0.05 + Math.random() * 0.08) * fade, { type: 'bandpass', freq: 1200 + Math.random() * 1800, q: 1.2 })
    }
  },
  fanfare: () =>
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) =>
      tone(f, [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.2][i], i === 7 ? 0.9 : 0.2, 'triangle', 0.2),
    ),
  /** Rugido de jaguar: ruido grave con vibración + tono que cae. */
  roar: () => {
    const a = audio()
    if (!a || !sfxBus || prefs.muted || prefs.sfx === 0) return
    const t = a.currentTime
    const n = noise(a)
    const f = a.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(900, t)
    f.frequency.exponentialRampToValueAtTime(260, t + 1.1)
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    const lfo = a.createOscillator()
    const lg = a.createGain()
    lfo.frequency.value = 28
    lg.gain.value = 0.25
    lfo.connect(lg).connect(g.gain)
    n.connect(f).connect(g).connect(sfxBus)
    const o = a.createOscillator()
    const og = a.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(70, t + 1.1)
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.12, t + 0.1)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.15)
    o.connect(og).connect(f)
    ;[n, o, lfo].forEach((s) => {
      s.start(t)
      s.stop(t + 1.3)
    })
  },
}

// ------------------------------------------------------------------ música
export type Track = 'lobby' | 'question' | null
let current: Track = null
let timer: number | null = null
let nextAt = 0
let stepIdx = 0

// Escala pentatónica menor de La (sonido "selva"), en Hz
const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99]
// Patrones fijos (suenan siempre igual, sin azar): melodía de marimba de 32 pasos
const LOBBY_MEL = [5, -1, 7, -1, 6, 5, -1, 3, 4, -1, 5, -1, 3, -1, 2, -1, 5, -1, 7, 8, 7, -1, 6, -1, 5, -1, 4, 3, 2, -1, 3, -1]
const LOBBY_BASS = [0, 0, 3, 3, 4, 4, 2, 2]
const Q_BASS = [0, 0, 0, 0, 1, 1, 0, 0, 3, 3, 2, 2, 0, 0, 4, 3]

function marimba(freq: number, at: number, vol: number) {
  tone(freq, 0, 0.35, 'sine', vol, 'music', at)
  tone(freq * 4, 0, 0.06, 'sine', vol * 0.35, 'music', at)
}

function schedule() {
  const a = ctx
  if (!a || !current) return
  const bpm = current === 'lobby' ? 104 : 128
  const step = 60 / bpm / 2 // corcheas
  while (nextAt < a.currentTime + 0.25) {
    const i = stepIdx
    if (current === 'lobby') {
      const m = LOBBY_MEL[i % 32]
      if (m >= 0) marimba(PENTA[m], nextAt, 0.16)
      if (i % 4 === 0) tone(PENTA[LOBBY_BASS[Math.floor(i / 4) % 8]] / 2, 0, 0.5, 'triangle', 0.16, 'music', nextAt)
      hit(0, 0.05, i % 2 ? 0.035 : 0.06, { type: 'highpass', freq: 7000 }, 'music', nextAt) // shaker
      if (i % 8 === 4) hit(0, 0.15, 0.12, { type: 'bandpass', freq: 400, q: 2 }, 'music', nextAt) // tambor
    } else {
      const b = Q_BASS[Math.floor(i / 2) % 16]
      tone(PENTA[b] / 2, 0, step * 0.9, 'sawtooth', 0.07, 'music', nextAt)
      if (i % 2 === 0) hit(0, 0.1, 0.14, { type: 'lowpass', freq: 120 }, 'music', nextAt) // bombo
      hit(0, 0.03, 0.04, { type: 'highpass', freq: 8000 }, 'music', nextAt)
      if (i % 16 === 14) tone(PENTA[6], 0, 0.2, 'triangle', 0.07, 'music', nextAt)
    }
    nextAt += step
    stepIdx++
  }
}

/** Cambia la música de fondo (null = silencio). Solo suena tras el primer clic en la página. */
export function setMusic(track: Track) {
  if (track === current) return
  current = track
  if (timer) window.clearInterval(timer)
  timer = null
  if (!track) return
  const a = audio()
  if (a) startLoop(a) // si aún no hubo clic, empieza con el primer clic
}

function startLoop(a: AudioContext) {
  nextAt = a.currentTime + 0.08
  stepIdx = 0
  timer = window.setInterval(schedule, 90)
  schedule()
}
