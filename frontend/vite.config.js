
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],

  // Build both the React app and the existing login page.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(
          new URL('./index.html', import.meta.url)
        ),
        login: fileURLToPath(
          new URL('./login/index.html', import.meta.url)
        ),
      },
    },
  },

  // Preserve local FastAPI development routing.
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
