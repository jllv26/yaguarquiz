import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages publica el sitio en https://<usuario>.github.io/<repositorio>/
// por eso "base" debe coincidir con el nombre del repositorio.
export default defineConfig({
  base: '/yaguarquiz/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
