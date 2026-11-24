import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { ConfirmProvider } from '../components/ui/Confirm'
import { ToastProvider } from '../components/ui/Toast'
import { AuthProvider } from '../features/auth/AuthProvider'
import { HomePage } from '../features/home/HomePage'
import { UiSounds } from './UiSounds'

/**
 * HashRouter: las rutas quedan como /#/play/123456 para que GitHub Pages
 * nunca devuelva 404 al recargar la página.
 */
// El inicio carga de inmediato; todo lo demás se descarga solo cuando se necesita.
const StudentPortalPage = lazy(() => import('../features/aula/StudentPortalPage').then((m) => ({ default: m.StudentPortalPage })))
const PlayPage = lazy(() => import('../features/play/PlayPage').then((m) => ({ default: m.PlayPage })))
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const HelpPage = lazy(() => import('../features/home/HelpPage').then((m) => ({ default: m.HelpPage })))
const NotFound = lazy(() => import('../features/home/NotFound').then((m) => ({ default: m.NotFound })))
const AcademicPage = lazy(() => import('../features/academic/AcademicPage').then((m) => ({ default: m.AcademicPage })))
const SubjectDetailPage = lazy(() => import('../features/academic/SubjectDetailPage').then((m) => ({ default: m.SubjectDetailPage })))
const StudentsPage = lazy(() => import('../features/students/StudentsPage').then((m) => ({ default: m.StudentsPage })))
const DashboardPage = lazy(() => import('../features/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ActivitiesPage = lazy(() => import('../features/activities/ActivitiesPage').then((m) => ({ default: m.ActivitiesPage })))
const ActivityEditorPage = lazy(() => import('../features/activities/ActivityEditorPage').then((m) => ({ default: m.ActivityEditorPage })))
const PresentationPlayPage = lazy(() => import('../features/presentations/PresentationPlayPage').then((m) => ({ default: m.PresentationPlayPage })))
const PresentationsPage = lazy(() => import('../features/presentations/PresentationsPage').then((m) => ({ default: m.PresentationsPage })))
const PresentationEditorPage = lazy(() => import('../features/presentations/PresentationEditorPage').then((m) => ({ default: m.PresentationEditorPage })))
const PresentationHostPage = lazy(() => import('../features/presentations/PresentationHostPage').then((m) => ({ default: m.PresentationHostPage })))
const DesignPage = lazy(() => import('../features/design/DesignPage').then((m) => ({ default: m.DesignPage })))
const AdminLayout = lazy(() => import('../features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const SettingsPage = lazy(() => import('../features/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const QuizzesPage = lazy(() => import('../features/quizzes/QuizzesPage').then((m) => ({ default: m.QuizzesPage })))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const SessionReportPage = lazy(() => import('../features/reports/SessionReportPage').then((m) => ({ default: m.SessionReportPage })))
const ReportPrint = lazy(() => import('../features/reports/ReportPrint').then((m) => ({ default: m.ReportPrint })))
const SessionsPage = lazy(() => import('../features/sessions/SessionsPage').then((m) => ({ default: m.SessionsPage })))
const HostPage = lazy(() => import('../features/host/HostPage').then((m) => ({ default: m.HostPage })))
const QuizEditorPage = lazy(() => import('../features/editor/QuizEditorPage').then((m) => ({ default: m.QuizEditorPage })))
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <ConfirmProvider>
      <AuthProvider>
        <HashRouter>
          <UiSounds />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/play/:pin" element={<PlayPage />} />
            <Route path="/aula" element={<StudentPortalPage />} />
            <Route path="/aula/:code" element={<StudentPortalPage />} />
            <Route path="/expo/:pin" element={<PresentationPlayPage />} />
            <Route path="/expo-host/:id" element={<PresentationHostPage />} />
            <Route path="/ayuda" element={<HelpPage />} />
            <Route path="/diseno" element={<DesignPage />} />
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/host/:id" element={<HostPage />} />
            <Route path="/reporte/:id/imprimir" element={<ReportPrint />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="asignaturas" element={<AcademicPage />} />
              <Route path="asignaturas/:id" element={<SubjectDetailPage />} />
              <Route path="estudiantes" element={<StudentsPage />} />
              <Route path="evaluaciones" element={<QuizzesPage />} />
              <Route path="evaluaciones/:id" element={<QuizEditorPage />} />
              <Route path="actividades" element={<ActivitiesPage />} />
              <Route path="actividades/:id" element={<ActivityEditorPage />} />
              <Route path="exposiciones" element={<PresentationsPage />} />
              <Route path="exposiciones/:id" element={<PresentationEditorPage />} />
              <Route path="sesiones" element={<SessionsPage />} />
              <Route path="reportes" element={<ReportsPage />} />
              <Route path="reportes/:id" element={<SessionReportPage />} />
              <Route path="configuracion" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
    </QueryClientProvider>
  )
}

function PageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader2 className="size-10 animate-spin text-uap-green" aria-label="Cargando" />
    </div>
  )
}
