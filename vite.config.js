import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`        → carpeta dist/ para Vercel o Netlify
// `npm run build:single` → un solo index.html autocontenido (para el widget HTML de Blynk o compartir)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: mode === 'single' ? { outDir: 'dist-single', chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 1500 },
}))
