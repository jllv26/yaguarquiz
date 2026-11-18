import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages publica el sitio en https://<usuario>.github.io/<repositorio>/
// por eso "base" debe coincidir con el nombre del repositorio.
export default defineConfig({
  base: process.env.BASE_PATH || '/yaguarquiz/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Librerías grandes en archivos aparte: el navegador las guarda en caché
        // y no se vuelven a descargar cuando se publica una versión nueva de la app.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 25 },
            { name: 'vendor-motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'vendor-query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 15 },
          ],
        },
      },
    },
  },
})
