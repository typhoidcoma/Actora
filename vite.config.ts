/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// No PWA plugin: public/manifest.webmanifest and public/sw.js ship as-is
// (Aelora docs/PUSH.md — the service worker is a push transport, not a cache).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
