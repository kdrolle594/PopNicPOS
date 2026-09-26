import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Vercel serves the app at the root; GitHub Pages serves it at /PopNicPOS/ (or VITE_BASE_PATH)
  base: process.env.VERCEL ? '/' : (process.env.VITE_BASE_PATH || '/PopNicPOS/'),
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Proxy API calls to Express server during development
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
  },
})
