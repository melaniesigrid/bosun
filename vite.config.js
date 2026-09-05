import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],

  // The Base44 plugin used to supply this alias. Removing the plugin removed
  // it, and every "@/..." import in the app broke at once.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The app and the API are one origin in the browser, so the session cookie
    // is same-origin and no CORS is involved.
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8787",
        changeOrigin: false,
      },
    },
  }
});