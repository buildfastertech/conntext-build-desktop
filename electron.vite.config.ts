import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: [
        '@anthropic-ai/claude-agent-sdk',
        '@anthropic-ai/sdk',
        'electron-store',
        'adm-zip',
        'uuid'
      ]
    })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    server: {
      port: 5200
    },
    assetsInclude: ['**/*.riv'],
    resolve: {
      alias: {
        // Force browser build of pusher-js (electron-vite defaults to Node build)
        'pusher-js': resolve(__dirname, 'node_modules/pusher-js/dist/web/pusher.js')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
