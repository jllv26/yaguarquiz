import { HashRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'
import { AdminLayout } from '../features/admin/AdminLayout'
import { DashboardPage } from '../features/admin/DashboardPage'
import { ComingSoon, SettingsPage } from '../features/admin/SettingsPage'
import { AuthProvider } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { DesignPage } from '../features/design/DesignPage'
import { NotFound } from '../features/home/NotFound'
import { HomePage } from '../features/home/HomePage'
import { PlayPage } from '../features/play/PlayPage'

/**
 * HashRouter: las rutas quedan como /#/play/123456 para que GitHub Pages
 * nunca devuelva 404 al recargar la página.
 */
export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/play/:pin" element={<PlayPage />} />
            <Route path="/diseno" element={<DesignPage />} />
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="asignaturas" element={<ComingSoon phase={2} title="Asignaturas" />} />
              <Route path="estudiantes" element={<ComingSoon phase={2} title="Estudiantes" />} />
              <Route path="evaluaciones" element={<ComingSoon phase={3} title="Evaluaciones" />} />
              <Route path="sesiones" element={<ComingSoon phase={4} title="Sesiones" />} />
              <Route path="reportes" element={<ComingSoon phase={6} title="Reportes" />} />
              <Route path="configuracion" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
