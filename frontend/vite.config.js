import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_DESKTOP === 'true' ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client'],
          utils: ['axios', 'date-fns']
        }
      }
    }
  }
})
