import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works on GitHub Pages,
// Netlify, or any static host without reconfiguring.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The commit a build came from (GitHub Actions sets GITHUB_SHA), so a
  // problem report says which version it was.
  define: { __APP_VERSION__: JSON.stringify((process.env.GITHUB_SHA || "dev").slice(0, 7)) },
  // The bank is fetched as a separate asset (see src/data/bank.js), so the JS
  // chunk stays small; this limit only guards the app code.
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
})
