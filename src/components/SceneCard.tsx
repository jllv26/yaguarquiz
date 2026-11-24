import { motion } from 'framer-motion'
import { BarChart3, Bot, CheckCheck, Globe, Heart, Mail, MapPin, MessageCircle, MoreHorizontal, Search, Send, Share2, Star, ThumbsUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * Escena de un caso: muestra la situación como se ve en la vida real (un chat de WhatsApp, un anuncio de Facebook,
 * una búsqueda en Google, un correo…). Solo ilustra; nunca dice la respuesta.
 */
export type Scene =
  | { kind: 'chat'; app?: 'whatsapp' | 'ai'; title: string; subtitle?: string; msgs: { me?: boolean; text: string; time?: string }[] }
  | { kind: 'post'; net?: 'facebook' | 'instagram' | 'tiktok'; author: string; text: string; sponsored?: boolean; cta?: string; emoji?: string; stats?: { label: string; value: string }[]; badge?: string }
  | { kind: 'comment'; page: string; post?: string; author: string; text: string; ago?: string }
  | { kind: 'search'; query: string; results?: { title: string; url: string; text?: string; ad?: boolean; stars?: number; reviews?: number }[]; empty?: boolean }
  | { kind: 'email'; from: string; subject: string; text: string; button?: string }
  | { kind: 'review'; business: string; author: string; stars: number; text: string; ago?: string }
  | { kind: 'form'; title: string; text?: string; fields?: string[]; check?: { label: string; on: boolean }; button: string }
  | { kind: 'metrics'; title: string; source?: 'meta' | 'email' | 'negocio' | 'google' | 'tiktok'; rows: { label: string; value: string }[] }
  | { kind: 'task'; when: string; text: string; who: string }

const SOURCE: Record<string, { label: string; color: string }> = {
  meta: { label: 'Administrador de anuncios', color: '#1877f2' },
  email: { label: 'Informe de la campaña de correo', color: '#e8590c' },
  negocio: { label: 'Cuaderno del negocio', color: '#2b8a3e' },
  google: { label: 'Datos del negocio en internet', color: '#4285f4' },
  tiktok: { label: 'Estadísticas del video', color: '#111' },
}

function Frame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={cn('mx-auto w-full max-w-md select-none overflow-hidden rounded-3xl text-left shadow-[0_12px_30px_-12px_rgba(13,26,51,.45)] ring-1 ring-black/10', className)}
      aria-label={label}
    >
      {children}
    </motion.figure>
  )
}

const Avatar = ({ name, color = '#1f3864' }: { name: string; color?: string }) => (
  <span className="grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-black text-white" style={{ background: color }} aria-hidden>
    {name.trim().charAt(0).toUpperCase()}
  </span>
)

const Stars = ({ n, size = 'size-4' }: { n: number; size?: string }) => (
  <span className="flex" aria-label={`${n} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={cn(size, i <= Math.round(n) ? 'fill-[#fbbc04] text-[#fbbc04]' : 'text-[#dadce0]')} />
    ))}
  </span>
)

export function SceneCard({ scene }: { scene: Scene }) {
  switch (scene.kind) {
    case 'chat': {
      const ai = scene.app === 'ai'
      return (
        <Frame label={`Chat: ${scene.title}`} className={ai ? 'bg-[#f7f7f8]' : 'bg-[#efe7dd]'}>
          <div className={cn('flex items-center gap-2 px-3 py-2 text-white', ai ? 'bg-[#343541]' : 'bg-[#075e54]')}>
            {ai ? <Bot className="size-6" /> : <Avatar name={scene.title} color="#128c7e" />}
            <div className="min-w-0">
              <p className="truncate font-bold leading-tight">{scene.title}</p>
              <p className="text-xs opacity-80">{scene.subtitle ?? (ai ? 'Asistente de IA' : 'en línea')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 p-3 [background-image:radial-gradient(#0000000d_1px,transparent_1px)] [background-size:14px_14px]">
            {scene.msgs.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.25 }}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-1.5 text-[15px] leading-snug text-[#111b21] shadow-sm',
                  m.me ? 'self-end rounded-tr-sm bg-[#d9fdd3]' : 'self-start rounded-tl-sm bg-white',
                  ai && m.me && 'bg-[#e7e7ff]',
                )}
              >
                {m.text}
                <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px] text-[#667781]">
                  {m.time ?? ''}
                  {m.me && !ai && <CheckCheck className="size-3.5 text-[#53bdeb]" />}
                </span>
              </motion.div>
            ))}
          </div>
        </Frame>
      )
    }
    case 'post': {
      const net = scene.net ?? 'facebook'
      const color = net === 'instagram' ? '#d6249f' : net === 'tiktok' ? '#111111' : '#1877f2'
      return (
        <Frame label={`Publicación de ${scene.author}`} className="bg-white text-[#050505]">
          <div className="flex items-center gap-2 px-3 pt-3">
            <Avatar name={scene.author} color={color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight">{scene.author}</p>
              <p className="text-xs text-[#65676b]">{scene.sponsored ? 'Publicidad · 🌎' : net === 'instagram' ? 'Instagram' : net === 'tiktok' ? 'TikTok' : 'Hace 2 h · 🌎'}</p>
            </div>
            {scene.badge && <span className="rounded-full bg-[#fff3bf] px-2 py-0.5 text-[11px] font-bold text-[#8a6416]">{scene.badge}</span>}
            <MoreHorizontal className="size-5 text-[#65676b]" />
          </div>
          <p className="whitespace-pre-line px-3 py-2 text-[15px] leading-snug">{scene.text}</p>
          {scene.emoji && (
            <div className="grid h-36 place-items-center text-6xl" style={{ background: `linear-gradient(135deg, ${color}22, ${color}55)` }} aria-hidden>
              {scene.emoji}
            </div>
          )}
          {scene.cta && (
            <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-3 py-2">
              <span className="truncate text-xs font-semibold uppercase text-[#65676b]">{scene.author}</span>
              <span className="shrink-0 rounded-md bg-[#e4e6eb] px-3 py-1.5 text-sm font-bold">{scene.cta}</span>
            </div>
          )}
          {scene.stats ? (
            <div className="grid grid-cols-3 gap-px border-t border-[#e4e6eb] bg-[#e4e6eb] text-center">
              {scene.stats.map((s) => (
                <div key={s.label} className="bg-white px-1 py-2">
                  <p className="font-display text-lg font-black leading-none">{s.value}</p>
                  <p className="text-[11px] text-[#65676b]">{s.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-around border-t border-[#e4e6eb] py-2 text-sm font-semibold text-[#65676b]">
              <span className="flex items-center gap-1">{net === 'instagram' ? <Heart className="size-4" /> : <ThumbsUp className="size-4" />} Me gusta</span>
              <span className="flex items-center gap-1"><MessageCircle className="size-4" /> Comentar</span>
              <span className="flex items-center gap-1">{net === 'instagram' ? <Send className="size-4" /> : <Share2 className="size-4" />} Compartir</span>
            </div>
          )}
        </Frame>
      )
    }
    case 'comment':
      return (
        <Frame label={`Comentario en la página ${scene.page}`} className="bg-white p-3 text-[#050505]">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#65676b]">
            <span className="grid size-5 place-items-center rounded-full bg-[#1877f2] text-[11px] font-black text-white">f</span>
            Comentario en {scene.page}
            {scene.post ? ` · «${scene.post}»` : ''}
          </p>
          <div className="flex gap-2">
            <Avatar name={scene.author} color="#a61e4d" />
            <div>
              <div className="rounded-2xl bg-[#f0f2f5] px-3 py-2">
                <p className="text-sm font-bold">{scene.author}</p>
                <p className="text-[15px] leading-snug">{scene.text}</p>
              </div>
              <p className="ml-3 mt-0.5 text-xs font-semibold text-[#65676b]">{scene.ago ?? 'Hace 5 min'} · Me gusta · Responder</p>
            </div>
          </div>
        </Frame>
      )
    case 'search':
      return (
        <Frame label={`Búsqueda en Google: ${scene.query}`} className="bg-white p-3 text-[#202124]">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-black tracking-tight" aria-hidden>
              <span className="text-[#4285f4]">G</span>
              <span className="text-[#ea4335]">o</span>
              <span className="text-[#fbbc05]">o</span>
              <span className="text-[#4285f4]">g</span>
              <span className="text-[#34a853]">l</span>
              <span className="text-[#ea4335]">e</span>
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe1e5] px-3 py-1.5 shadow-sm">
              <Search className="size-4 shrink-0 text-[#9aa0a6]" />
              <span className="truncate text-[15px]">{scene.query}</span>
              <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="-ml-1 h-4 w-px bg-[#202124]" aria-hidden />
            </div>
          </div>
          {scene.empty && <p className="mt-3 text-sm text-[#4d5156]">No se encontraron resultados para tu búsqueda.</p>}
          {scene.results && (
            <div className="mt-3 flex flex-col gap-3">
              {scene.results.map((r, i) => (
                <div key={i}>
                  <p className="flex items-center gap-1 text-xs text-[#4d5156]">
                    {r.ad ? <b className="text-[#202124]">Patrocinado ·</b> : <Globe className="size-3" />} {r.url}
                  </p>
                  <p className="text-[17px] leading-tight text-[#1a0dab]">{r.title}</p>
                  {r.stars !== undefined && (
                    <p className="flex items-center gap-1 text-xs text-[#4d5156]">
                      {r.stars.toLocaleString('es-BO')} <Stars n={r.stars} size="size-3" /> ({r.reviews ?? 0})
                    </p>
                  )}
                  {r.text && <p className="text-sm leading-snug text-[#4d5156]">{r.text}</p>}
                </div>
              ))}
            </div>
          )}
        </Frame>
      )
    case 'email':
      return (
        <Frame label={`Correo: ${scene.subject}`} className="bg-white text-[#202124]">
          <div className="flex items-center gap-2 border-b border-[#e8eaed] bg-[#f6f8fc] px-3 py-2 text-sm font-semibold text-[#5f6368]">
            <Mail className="size-4 text-[#ea4335]" /> Recibidos
          </div>
          <div className="p-3">
            <p className="font-display text-lg font-black leading-tight">{scene.subject}</p>
            <div className="mt-2 flex items-center gap-2">
              <Avatar name={scene.from} color="#e8590c" />
              <p className="text-sm">
                <b>{scene.from}</b> <span className="text-[#5f6368]">para mí</span>
              </p>
            </div>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-snug">{scene.text}</p>
            {scene.button && <span className="mt-3 inline-block rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-bold text-white">{scene.button}</span>}
          </div>
        </Frame>
      )
    case 'review':
      return (
        <Frame label={`Reseña en Google de ${scene.business}`} className="bg-white p-3 text-[#202124]">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#5f6368]">
            <MapPin className="size-4 text-[#ea4335]" /> Reseña en Google Maps · {scene.business}
          </p>
          <div className="flex items-center gap-2">
            <Avatar name={scene.author} color="#7048e8" />
            <div>
              <p className="text-sm font-bold">{scene.author}</p>
              <p className="flex items-center gap-1 text-xs text-[#5f6368]">
                <Stars n={scene.stars} size="size-3.5" /> {scene.ago ?? 'hace una semana'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[15px] leading-snug">{scene.text}</p>
        </Frame>
      )
    case 'form':
      return (
        <Frame label={`Formulario: ${scene.title}`} className="bg-white p-4 text-[#202124]">
          <p className="font-display text-lg font-black leading-tight">{scene.title}</p>
          {scene.text && <p className="mt-1 text-sm text-[#5f6368]">{scene.text}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {(scene.fields ?? []).map((f) => (
              <div key={f}>
                <p className="text-xs font-semibold text-[#5f6368]">{f}</p>
                <div className="h-9 rounded-lg border border-[#dadce0] bg-[#f8f9fa]" />
              </div>
            ))}
            {scene.check && (
              <p className="flex items-center gap-2 text-sm">
                <span className={cn('grid size-5 place-items-center rounded border-2', scene.check.on ? 'border-[#1a73e8] bg-[#1a73e8] text-white' : 'border-[#5f6368]')}>
                  {scene.check.on && <CheckCheck className="size-3.5" />}
                </span>
                {scene.check.label}
              </p>
            )}
            <span className="mt-1 rounded-lg bg-[#1a73e8] py-2 text-center text-sm font-bold text-white">{scene.button}</span>
          </div>
        </Frame>
      )
    case 'metrics': {
      const src = SOURCE[scene.source ?? 'negocio']
      return (
        <Frame label={scene.title} className="bg-white text-[#202124]">
          <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: src.color }}>
            <BarChart3 className="size-5" />
            <div className="min-w-0">
              <p className="truncate font-bold leading-tight">{scene.title}</p>
              <p className="text-xs opacity-85">{src.label}</p>
            </div>
          </div>
          <div className={cn('grid gap-px bg-[#e8eaed]', scene.rows.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {scene.rows.map((r, i) => (
              <motion.div key={r.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.12 }} className="bg-white px-2 py-3 text-center">
                <p className="font-display text-2xl font-black leading-none tabular-nums">{r.value}</p>
                <p className="mt-1 text-xs leading-tight text-[#5f6368]">{r.label}</p>
              </motion.div>
            ))}
          </div>
        </Frame>
      )
    }
    case 'task':
      return (
        <Frame label="Tarea del calendario" className="bg-white p-3 text-[#202124]">
          <div className="flex gap-3">
            <span className="w-1.5 shrink-0 rounded-full bg-[#1a73e8]" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1a73e8]">📅 {scene.when}</p>
              <p className="font-display text-lg font-black leading-tight">{scene.text}</p>
              <p className="text-sm text-[#5f6368]">Responsable: {scene.who}</p>
            </div>
          </div>
        </Frame>
      )
  }
}
