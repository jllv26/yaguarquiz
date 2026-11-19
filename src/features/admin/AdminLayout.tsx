import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Gamepad2,
  Presentation,
  Hourglass,
  LayoutDashboard,
  Loader2,
  LogOut,
  Radio,
  Settings,
  Users,
} from 'lucide-react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { ThemeToggle } from '../../components/TopBar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { BRAND } from '../../lib/brand'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/AuthProvider'

const NAV = [
  { to: '/admin', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/admin/asignaturas', label: 'Asignaturas', icon: BookOpen },
  { to: '/admin/estudiantes', label: 'Estudiantes', icon: Users },
  { to: '/admin/evaluaciones', label: 'Evaluaciones', icon: ClipboardList },
  { to: '/admin/actividades', label: 'Actividades', icon: Gamepad2 },
  { to: '/admin/exposiciones', label: 'Exposiciones', icon: Presentation },
  { to: '/admin/sesiones', label: 'Sesiones', icon: Radio },
  { to: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
] as const

export function AdminLayout() {
  const { loading, session, teacher, signOut } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/admin/login" replace />
  if (!teacher || !teacher.approved) return <PendingApproval email={session.user.email ?? ''} onSignOut={signOut} />

  return (
    <div className="relative flex min-h-dvh">
      <AnimatedBackground variant="calm" />

      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-2 p-4 lg:flex">
        <div className="glass flex h-full flex-col rounded-3xl p-4">
          <div className="mb-6 flex items-center gap-3 px-1">
            <img src={BRAND.logoColor} alt="Escudo UAP" className="size-11 rounded-xl bg-white object-contain p-0.5" />
            <div className="leading-tight">
              <p className="font-display text-lg font-extrabold text-uap-blue dark:text-white">
                Yaguar<span className="text-[#8a6416] dark:text-uap-gold-300">Quiz</span>
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Panel docente</p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1" aria-label="Menú del panel">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
          <div className="mt-4 rounded-2xl bg-ink/5 p-3">
            <p className="truncate text-sm font-semibold">{teacher.full_name || 'Docente'}</p>
            <p className="truncate text-xs text-ink-soft">{teacher.email}</p>
            <div className="mt-3 flex items-center gap-2">
              <ThemeToggle />
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => void signOut()}>
                <LogOut className="size-4" /> Salir
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (celular/tablet) */}
        <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 rounded-b-3xl px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <img src={BRAND.logoColor} alt="" className="size-9 rounded-lg bg-white object-contain p-0.5" />
            <p className="font-display text-lg font-extrabold">
              Yaguar<span className="text-uap-gold">Quiz</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => void signOut()}
              className="glass grid size-11 place-items-center rounded-2xl"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto px-4 pt-3 lg:hidden" aria-label="Menú del panel">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} compact />
          ))}
        </nav>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  phase,
  compact,
}: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  phase?: number
  compact?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex shrink-0 items-center gap-3 rounded-2xl font-semibold transition-colors',
          compact ? 'glass px-3 py-2 text-sm' : 'px-3 py-2.5',
          isActive ? 'bg-uap-blue !text-white shadow-md dark:bg-game-electric' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      <Icon className="size-5" />
      <span className="flex-1">{label}</span>
      {phase && !compact && (
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-bold text-ink-soft">F{phase}</span>
      )}
    </NavLink>
  )
}

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <AnimatedBackground variant="calm" />
      <Loader2 className="size-10 animate-spin text-uap-green" aria-label="Cargando" />
    </div>
  )
}

function PendingApproval({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  return (
    <div className="relative grid min-h-dvh place-items-center px-4">
      <AnimatedBackground variant="calm" />
      <Card className="w-full max-w-md text-center">
        <Hourglass className="mx-auto mb-3 size-12 text-uap-gold" />
        <h1 className="font-display text-2xl font-extrabold">Cuenta pendiente de aprobación</h1>
        <p className="mt-3 text-ink-soft">
          Tu cuenta <strong className="text-ink">{email}</strong> fue creada. El administrador de {BRAND.appName} debe
          aprobarla antes de que puedas usar el panel.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => void onSignOut()}>
          <LogOut className="size-4" /> Cerrar sesión
        </Button>
      </Card>
    </div>
  )
}
