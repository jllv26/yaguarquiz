import { HashRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'
import { DesignPage } from '../features/design/DesignPage'
import { AdminPlaceholder, NotFound } from '../features/home/AdminPlaceholder'
import { HomePage } from '../features/home/HomePage'
import { PlayPage } from '../features/play/PlayPage'

/**
 * HashRouter: las rutas quedan como /#/play/123456 para que GitHub Pages
 * nunca devuelva 404 al recargar la página.
 */
export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play/:pin" element={<PlayPage />} />
          <Route path="/admin/*" element={<AdminPlaceholder />} />
          <Route path="/diseno" element={<DesignPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}
