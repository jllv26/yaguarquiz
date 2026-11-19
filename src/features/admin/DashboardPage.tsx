import { motion } from 'framer-motion'
import {
  BookOpen,
  ClipboardList,
  Database,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  PawPrint,
  Radio,
  Rocket,
  Trash2,
  Users,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SolidCard } from '../../components/ui/Card'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import { BRAND } from '../../lib/brand'
import { friendlyError, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

interface Counts {
  subjects: number
  students: number
  quizzes: number
  questions: number
  sessions: number
}

const STATS = [
  { key: 'subjects', label: 'Asignaturas', icon: BookOpen, color: 'text-uap-blue dark:text-game-electric', bg: 'bg-uap-blue/10' },
  { key: 'students', label: 'Estudiantes', icon: Users, color: 'text-uap-green dark:text-game-selva', bg: 'bg-uap-green/10' },
  { key: 'quizzes', label: 'Evaluaciones', icon: ClipboardList, color: 'text-[#8f6c12] dark:text-uap-gold-300', bg: 'bg-uap-gold/15' },
  { key: 'questions', label: 'Preguntas', icon: HelpCircle, color: 'text-game-violet', bg: 'bg-game-violet/10' },
  { key: 'sessions', label: 'Sesiones', icon: Radio, color: 'text-uap-red dark:text-game-coral', bg: 'bg-uap-red/10' },
] as const

const ROADMAP = [
  { phase: 1, title: 'Base de datos y acceso docente', done: true },
  { phase: 2, title: 'Asignaturas, estudiantes y listas desde Excel', done: true },
  { phase: 3, title: 'Editor de evaluaciones y banco de preguntas', done: true },
  { phase: 4, title: 'Partida en vivo con PIN y código QR', done: true },
  { phase: 5, title: 'Modo examen, tareas y anti-copia', done: true },
  { phase: 6, title: 'Reportes, Google Sheets y conversor de notas', done: true },
  { phase: 7, title: 'Sonido, podio, insignias y mascota Yaguar', done: true },
  { phase: 8, title: 'Pruebas, accesibilidad y publicación', done: true },
  { phase: 9, title: 'Actividades estilo Educaplay (juegos de práctica)' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function DashboardPage() {
  const { teacher } = useAuth()
  const toast = useToast()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState<'seed' | 'delete' | null>(null)
  const qc = useQueryClient()
  const confirm = useConfirm()

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('dashboard_counts')
    if (error) toast.error('No se pudo cargar el resumen', friendlyError(error.message))
    else setCounts(data as Counts)
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function seed() {
    setBusy('seed')
    const { data, error } = await supabase.rpc('seed_demo_data')
    setBusy(null)
    if (error) return toast.error('No se pudieron cargar los datos', friendlyError(error.message))
    toast.success('¡Listo!', (data as { message: string }).message)
    void qc.invalidateQueries()
    void load()
  }

  async function removeDemo() {
    if (!(await confirm({ title: '¿Borrar los datos de ejemplo?', message: 'Se borra todo lo marcado como DEMO. Tus datos reales no se tocan.', confirmText: 'Borrar ejemplo', danger: true }))) return
    setBusy('delete')
    const { error } = await supabase.rpc('delete_demo_data')
    setBusy(null)
    if (error) return toast.error('No se pudieron borrar', friendlyError(error.message))
    toast.success('Datos de ejemplo eliminados')
    void qc.invalidateQueries()
    void load()
  }

  const firstName = (teacher?.full_name || '').replace(/^(ing\.?|lic\.?|dr\.?|msc\.?)\s+/i, '').split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-uap-green dark:text-game-selva">
          <PawPrint className="size-4" /> {BRAND.slogan}
        </p>
        <h1 className="font-display text-3xl font-black text-uap-blue sm:text-4xl dark:text-white">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-ink-soft">Este es tu panel de {BRAND.appName}.</p>
      </motion.header>

      {/* Bento de estadísticas */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {STATS.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={i === 0 ? 'col-span-2 md:col-span-1' : ''}
          >
            <SolidCard className="flex h-full flex-col gap-3 p-5">
              <span className={`grid size-11 place-items-center rounded-2xl ${s.bg}`}>
                <s.icon className={`size-6 ${s.color}`} />
              </span>
              <span className="font-display text-4xl font-black tabular-nums">
                {counts ? counts[s.key] : <Loader2 className="size-7 animate-spin text-ink-soft" />}
              </span>
              <span className="text-sm font-semibold text-ink-soft">{s.label}</span>
            </SolidCard>
          </motion.div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Hoja de ruta */}
        <SolidCard>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold">
            <Rocket className="size-5 text-uap-gold" /> Avance del sistema
          </h2>
          <ol className="flex flex-col gap-2">
            {ROADMAP.map((r) => (
              <li key={r.phase} className="flex items-center gap-3 rounded-2xl px-3 py-2 odd:bg-ink/[0.03]">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-black ${
                    r.done ? 'bg-uap-green text-white' : 'bg-ink/10 text-ink-soft'
                  }`}
                >
                  {r.done ? '✓' : r.phase}
                </span>
                <span className={r.done ? 'font-semibold' : 'text-ink-soft'}>{r.title}</span>
              </li>
            ))}
          </ol>
        </SolidCard>

        {/* Datos de ejemplo */}
        <SolidCard className="flex flex-col">
          <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold">
            <Database className="size-5 text-uap-blue dark:text-game-electric" /> Datos de ejemplo
          </h2>
          <p className="text-sm text-ink-soft">
            Crea una asignatura DEMO con 12 estudiantes ficticios, tu plan de calificación (30 + 30 + 40 = 100) y una
            evaluación con 6 preguntas, para probar el sistema sin tocar datos reales.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Button variant="success" onClick={() => void seed()} disabled={busy !== null} className="flex-1">
              {busy === 'seed' ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
              Cargar ejemplo
            </Button>
            <Button variant="secondary" onClick={() => void removeDemo()} disabled={busy !== null} className="flex-1">
              {busy === 'delete' ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
              Borrar ejemplo
            </Button>
          </div>
        </SolidCard>
      </section>
    </div>
  )
}
