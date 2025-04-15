import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { // Optional: Configure dev server port if needed
    port: 3000,
    open: true // Automatically open in browser
  }
})
