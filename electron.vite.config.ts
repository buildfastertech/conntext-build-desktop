import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
    assetsInclude: ['**/*.riv'],
    plugins: [react(), tailwindcss()]
  }
})
