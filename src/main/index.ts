import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { AgentService } from './agent-service'
import { AuthStore } from './auth-store'

let mainWindow: BrowserWindow | null = null
const agentService = new AgentService()
const authStore = new AuthStore()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ConnText Build',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== IPC Handlers =====

// Auth
ipcMain.handle('auth:get-credentials', () => {
  return authStore.getCredentials()
})

ipcMain.handle('auth:save-credentials', (_event, credentials: { apiUrl: string; apiToken: string; user: { id: string; name: string; email: string } }) => {
  authStore.saveCredentials(credentials)
  return { success: true }
})

ipcMain.handle('auth:clear-credentials', () => {
  authStore.clearCredentials()
  return { success: true }
})

// Folder selection
ipcMain.handle('dialog:select-folder', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Folder'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

// Agent
ipcMain.handle('agent:send-message', async (_event, params: {
  content: string
  workingDirectory: string
  sessionId?: string
  systemPrompt?: string
  allowedTools?: string[]
}) => {
  return agentService.sendMessage(params, (event) => {
    mainWindow?.webContents.send('agent:stream-event', event)
  })
})

ipcMain.handle('agent:create-session', async (_event, params: {
  workingDirectory: string
  systemPrompt?: string
  allowedTools?: string[]
}) => {
  return agentService.createSession(params)
})

ipcMain.handle('agent:destroy-session', async (_event, sessionId: string) => {
  return agentService.destroySession(sessionId)
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
