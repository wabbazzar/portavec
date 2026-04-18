import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Base path — override with VITE_BASE env var when deploying to a
// subdirectory (e.g. GitHub Pages project site: `/portavec/`). Default
// `/` works for Vercel, Netlify, user/org GH Pages sites, and dev.
const base = process.env.VITE_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    // Training corpus has 180+ small PNGs; increase warning threshold.
    chunkSizeWarningLimit: 1200,
  },
})
