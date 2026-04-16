import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // GitHub Pages project pages are served at /REPO-NAME/ — replace with your actual repo name
  // Leave as '/' for custom domains or when using Vercel
  base: process.env.NODE_ENV === 'production' ? (process.env.VITE_BASE_PATH || '/PopNicPOS') : '/PopNicPOS',
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
})
