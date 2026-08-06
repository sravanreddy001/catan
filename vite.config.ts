import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from https://sravanreddy001.github.io/catan/, so assets need the
  // repo name as their base path.
  base: '/catan/',
  plugins: [react()],
  server: { host: true, port: 5199, strictPort: true },
})
