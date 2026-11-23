import { AnimatePresence, motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { useGame } from '../ActivityGame'
import { McQuestion } from './McPanel'

/* ───────────── YouTube ───────────── */

/** ID del video a partir de cualquier enlace de YouTube (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/)
  return m ? m[1] : /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null
}

/** «1:05» → 65 · «65» → 65 */
export function parseTime(t: string): number | null {
  const s = t.trim()
  if (!s) return null
  const parts = s.split(':').map((x) => Number(x))
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null
  return parts.reduce((a, b) => a * 60 + b, 0)
}
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  playVideo(): void
  pauseVideo(): void
  seekTo(s: number, allow: boolean): void
  destroy(): void
}
type YTNs = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer }
declare global {
  interface Window {
    YT?: YTNs
    onYouTubeIframeAPIReady?: () => void
  }
}
let ytLoading: Promise<YTNs> | null = null
function loadYT(): Promise<YTNs> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!ytLoading)
    ytLoading = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        if (window.YT) res(window.YT)
      }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.onerror = () => {
        ytLoading = null
        rej(new Error('yt'))
      }
      document.head.appendChild(s)
    })
  return ytLoading
}

/* ───────────── Juego ───────────── */

export default function VideoQuiz() {
  const { board, progress } = useGame<'video'>()
  const items = board.board.items
  const vid = youtubeId(board.board.video_url)
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(!vid)
  const [ask, setAsk] = useState<string | null>(null)
  const [dur, setDur] = useState(0)
  const [now, setNow] = useState(0)
  const [ended, setEnded] = useState(false)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const askRef = useRef(ask)
  askRef.current = ask

  const pending = useCallback(() => items.filter((x) => !progressRef.current[x.key]?.done), [items])

  useEffect(() => {
    if (!vid || !host.current) return
    let alive = true
    const timeout = setTimeout(() => alive && !player.current && setFailed(true), 10000)
    loadYT()
      .then((YT) => {
        if (!alive || !host.current) return
        player.current = new YT.Player(host.current, {
          videoId: vid,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, fs: 0 },
          events: {
            onReady: () => {
              setReady(true)
              setDur(player.current?.getDuration() ?? 0)
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === 0) setEnded(true)
              if (e.data === 1 && askRef.current) player.current?.pauseVideo()
            },
            onError: () => setFailed(true),
          },
        })
      })
      .catch(() => setFailed(true))
    return () => {
      alive = false
      clearTimeout(timeout)
      player.current?.destroy()
      player.current = null
    }
  }, [vid])

  // vigila el minuto: al llegar a una pregunta, pausa y la muestra
  useEffect(() => {
    if (!ready) return
    const t = setInterval(() => {
      const pl = player.current
      if (!pl || askRef.current) return
      const cur = pl.getCurrentTime?.() ?? 0
      setNow(cur)
      if (!dur) setDur(pl.getDuration?.() ?? 0)
      const due = pending().find((x) => (x.t ?? 0) <= cur + 0.25)
      if (due) {
        pl.pauseVideo()
        setAsk(due.key)
      }
    }, 300)
    return () => clearInterval(t)
  }, [ready, dur, pending])

  // si el video terminó y quedan preguntas (minutos después del final), se hacen igual
  useEffect(() => {
    if ((ended || failed) && !ask) {
      const left = pending()
      if (left.length) setAsk(left[0].key)
    }
  }, [ended, failed, ask, pending, progress])

  const current = items.find((x) => x.key === ask)
  const qRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ask) setTimeout(() => qRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
  }, [ask])
  const resume = () => {
    setAsk(null)
    if (!ended && pending().length) setTimeout(() => player.current?.playVideo(), 150)
  }

  return (
    <div className="flex flex-col gap-3">
      {vid && !failed ? (
        <div className="relative overflow-hidden rounded-3xl bg-black shadow-lg">
          <div className="aspect-video w-full">
            <div ref={host} className="size-full" />
          </div>
          <AnimatePresence>
            {ask && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55">
                <span className="rounded-full bg-uap-gold px-4 py-2 font-display font-black text-ink">⏸ ¡Pregunta! Respóndela abajo</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-3xl bg-uap-gold/15 p-4 text-sm font-semibold">
          No se pudo cargar el video aquí.{' '}
          {board.board.video_url && (
            <a href={board.board.video_url} target="_blank" rel="noreferrer" className="text-uap-blue underline">
              Ábrelo en YouTube
            </a>
          )}{' '}
          y responde las preguntas de abajo.
        </div>
      )}

      {/* línea de tiempo con las preguntas */}
      {vid && !failed && dur > 0 && (
        <div className="relative mx-2 h-8" aria-label="Preguntas en el video">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-[#c92a2a]" style={{ width: `${Math.min(100, (now / dur) * 100)}%` }} />
          </div>
          {items.map((x, i) => {
            const q = progress[x.key]
            return (
              <button
                key={x.key}
                onClick={() => {
                  if (q?.done || ask) return
                  player.current?.seekTo(Math.max(0, (x.t ?? 0) - 3), true)
                  player.current?.playVideo()
                }}
                className={cn('absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[10px] font-black text-white ring-2 ring-surface', q?.done ? (q.correct ? 'bg-uap-green' : 'bg-uap-red') : 'bg-uap-blue')}
                style={{ left: `${Math.min(100, ((x.t ?? 0) / dur) * 100)}%` }}
                aria-label={`Pregunta ${i + 1} en el minuto ${fmtTime(x.t ?? 0)}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      )}

      {current ? (
        <div ref={qRef} className="flex scroll-mt-20 flex-col gap-2">
          <McQuestion key={current.key} it={current} n={items.indexOf(current) + 1} onDone={() => setTimeout(resume, 400)} />
          {progress[current.key]?.done && (
            <Button className="self-center" onClick={resume}>
              <Play className="size-4" /> Seguir viendo
            </Button>
          )}
        </div>
      ) : (
        <p className="text-center text-sm font-semibold text-ink-soft">
          {items.every((x) => progress[x.key]?.done) ? '¡Respondiste todas las preguntas del video!' : '▶ Dale play al video: se detendrá solo cuando llegue una pregunta.'}
        </p>
      )}
    </div>
  )
}
