/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// No PWA plugin: public/manifest.webmanifest and public/sw.js ship as-is
// (Aelora docs/PUSH.md — the service worker is a push transport, not a cache).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pinned: Supabase/Google only redirect back to http://localhost:5173, so never
  // drift to 5174 when the port is busy (sign-in would silently fail there).
  server: { host: true, port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
