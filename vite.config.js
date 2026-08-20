import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works on GitHub Pages,
// Netlify, or any static host without reconfiguring.
export default defineConfig({
  base: './',
  plugins: [react()],
    // The question bank is bundled deliberately: one request, works offline
  // inside Telegram, and gzips well. Raise the limit rather than code-split it.
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
})
