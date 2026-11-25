import { BarChart3, Lightbulb, Mail, Route, Search, ShieldCheck, Target, Users, type LucideIcon } from 'lucide-react'

/** Color e ícono del tema de una pregunta (su primera etiqueta). «G1 · Redes…» → color fijo de ese grupo. */
export interface TopicStyle {
  code: string
  label: string
  color: string
  icon: LucideIcon
}
const GROUPS: Record<string, { color: string; icon: LucideIcon }> = {
  G1: { color: '#1c7ed6', icon: Users },
  G2: { color: '#7048e8', icon: ShieldCheck },
  G3: { color: '#e8590c', icon: Target },
  G4: { color: '#d6336c', icon: Route },
  G5: { color: '#0c8599', icon: Mail },
  G6: { color: '#2b8a3e', icon: Search },
  G7: { color: '#b8860b', icon: BarChart3 },
}
const PALETTE = Object.values(GROUPS).map((g) => g.color)

export function topicStyle(topic: string | null | undefined): TopicStyle | null {
  if (!topic || topic.startsWith('var:')) return null
  const m = topic.match(/^(G\d+)\s*[·:-]\s*(.+)$/)
  if (m && GROUPS[m[1]]) return { code: m[1], label: m[2], ...GROUPS[m[1]] }
  let h = 0
  for (const ch of topic) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  // «P1 · Tema» o «CI · Tema»: código corto propio y el resto como nombre
  const c = topic.match(/^([A-Z]{1,2}\d*)\s*·\s*(.+)$/)
  if (c) return { code: c[1], label: c[2], color: PALETTE[h % PALETTE.length], icon: Lightbulb }
  return { code: topic.slice(0, 2).toUpperCase(), label: topic, color: PALETTE[h % PALETTE.length], icon: Lightbulb }
}
