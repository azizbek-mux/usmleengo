import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works on GitHub Pages,
// Netlify, or any static host without reconfiguring.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The bank is fetched as a separate asset (see src/data/bank.js), so the JS
  // chunk stays small; this limit only guards the app code.
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
})
