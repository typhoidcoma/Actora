import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const shared = fileURLToPath(new URL('../src', import.meta.url))
const ownPublic = fileURLToPath(new URL('./public', import.meta.url))
const rootPublic = fileURLToPath(new URL('../public', import.meta.url))

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

/**
 * The 2D app's public files (the push service worker, its icons, fonts, the
 * manifest) served in dev too: the shared push code registers /sw.js and its
 * notifications point at /icons/. Deployed, the 2D app serves them at the site
 * root. This app's own public (models) wins.
 */
function sharedPublic(): Plugin {
  return {
    name: 'actora-shared-public',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0])
        if (path === '/' || existsSync(join(ownPublic, path))) return next()
        const file = normalize(join(rootPublic, path))
        if (!file.startsWith(rootPublic) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
  }
}

// The 3D client of Actora. It renders its own scene but runs on the 2D app's
// framework-free code (../src/aelora, ../src/stores, …), imported as @actora/*.
export default defineConfig(({ command }) => ({
  // Deployed beside the 2D app on the same site, under /3d/ (same origin: the
  // same sign-in, session and Aelora CORS). Dev serves it at the root.
  base: command === 'build' ? '/3d/' : '/',
  plugins: [react(), tailwindcss(), sharedPublic()],
  // Vendors in their own chunks: an app deploy doesn't re-download three.js or React
  // (their hashes don't change), and three/webgpu alone is past the default warning size.
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\/]three[\/]/.test(id)) return 'three'
          if (id.includes('@react-three')) return 'r3f'
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react'
          if (/[\/](motion|framer-motion|motion-dom|motion-utils)[\/]/.test(id)) return 'motion'
          return undefined
        },
      },
    },
  },
  // The root .env: same backend, Supabase and mock settings as the 2D app.
  envDir: '..',
  resolve: {
    alias: [
      { find: '@actora', replacement: shared },
      // R3F and the loaders import plain 'three', which carries the WebGL renderer
      // (~2 MB of source) beside the WebGPU one; this app never uses it. three/webgpu
      // re-exports the same core classes, so they all share one copy.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
    // ../src would otherwise resolve these from the root node_modules: two zustands
    // means two sets of stores (the socket fills one, the scene reads the other).
    dedupe: ['react', 'react-dom', 'zustand', 'three', 'motion'],
  },
  // Same pinned port as the 2D app: Supabase/Google only redirect back to
  // http://localhost:5173, so sign-in works here too. Run one app at a time.
  server: { host: true, port: 5173, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 5173, strictPort: true },
}))
