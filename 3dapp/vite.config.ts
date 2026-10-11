import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../src', import.meta.url))

// The 3D client of Actora. It renders its own scene but runs on the 2D app's
// framework-free code (../src/aelora, ../src/stores, …), imported as @actora/*.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@actora': shared },
    // ../src would otherwise resolve these from the root node_modules: two zustands
    // means two sets of stores (the socket fills one, the scene reads the other).
    dedupe: ['react', 'react-dom', 'zustand', 'three'],
  },
  // 5173 belongs to the 2D app (pinned there for the OAuth redirect).
  server: { host: true, port: 5174, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 5174, strictPort: true },
})
