import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the account API (server/) during `npm run dev`; run it with
  // BOARDROUTE_ORIGIN=http://localhost:5173 node server/server.js
  server: { proxy: { '/api': 'http://localhost:3041' } },
})
