import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4401,
    proxy: {
      '/api': {
        target: 'http://localhost:4400',
        changeOrigin: true
      }
    }
  }
})