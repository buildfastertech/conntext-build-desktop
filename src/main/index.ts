import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, readdir, unlink, cp, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { AgentService } from './agent-service'
import { AuthStore } from './auth-store'
import { AppStateStore } from './app-state-store'
import { SkillsStore } from './skills-store'

let mainWindow: BrowserWindow | null = null
const agentService = new AgentService()
const authStore = new AuthStore()
const appStateStore = new AppStateStore()
const skillsStore = new SkillsStore()

/**
 * Get the path to the local skills cache directory.
 * Skills are synced from ConnText platform and stored in app data.
 */
function getSkillsPath(): string {
  return skillsStore.getSkillsPath()
}

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

ipcMain.handle('auth:get-anthropic-key', () => {
  return authStore.getAnthropicKey()
})

ipcMain.handle('auth:save-anthropic-key', (_event, apiKey: string) => {
  authStore.saveAnthropicKey(apiKey)
  // Initialize vision service with the Anthropic API key
  agentService.initializeVisionService(apiKey)
  return { success: true }
})

ipcMain.handle('auth:clear-anthropic-key', () => {
  authStore.clearAnthropicKey()
  return { success: true }
})

// App state
ipcMain.handle('app-state:get', () => {
  return appStateStore.getAppState()
})

ipcMain.handle('app-state:save-working-directory', (_event, directory: string) => {
  appStateStore.saveWorkingDirectory(directory)
  return { success: true }
})

ipcMain.handle('app-state:save-session-id', (_event, sessionId: string) => {
  appStateStore.saveSessionId(sessionId)
  return { success: true }
})

ipcMain.handle('app-state:clear', () => {
  appStateStore.clearAppState()
  return { success: true }
})

ipcMain.handle('app-state:save-claude-code-path', (_event, path: string) => {
  appStateStore.saveClaudeCodePath(path)
  agentService.setClaudeCodePath(path)
  return { success: true }
})

ipcMain.handle('app-state:get-claude-code-path', () => {
  return appStateStore.getClaudeCodePath()
})

ipcMain.handle('app-state:clear-claude-code-path', () => {
  appStateStore.clearClaudeCodePath()
  agentService.setClaudeCodePath(null)
  return { success: true }
})

ipcMain.handle('app-state:save-active-workspace-id', (_event, workspaceId: string) => {
  appStateStore.saveActiveWorkspaceId(workspaceId)
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

// File selection for Claude Code executable
ipcMain.handle('dialog:select-file', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Claude Code Executable',
    filters: process.platform === 'win32'
      ? [{ name: 'Executables', extensions: ['exe'] }]
      : []
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

// File operations
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }
    throw error
  }
})

ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
  // Ensure parent directory exists
  const { dirname } = await import('path')
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })

  await writeFile(filePath, content, 'utf-8')
})

ipcMain.handle('fs:copy-directory', async (_event, sourcePath: string, destinationPath: string) => {
  try {
    // Check if source exists
    const sourceStats = await stat(sourcePath)
    if (!sourceStats.isDirectory()) {
      throw new Error('Source path is not a directory')
    }

    // Copy recursively
    await cp(sourcePath, destinationPath, { recursive: true })
    return true
  } catch (error) {
    console.error('Error copying directory:', error)
    throw error
  }
})

ipcMain.handle('fs:get-skills-path', async () => {
  return getSkillsPath()
})

ipcMain.handle('fs:get-user-home', async () => {
  return homedir()
})

ipcMain.handle('fs:write-image-file', async (_event, filePath: string, imageData: Uint8Array) => {
  await writeFile(filePath, Buffer.from(imageData))
})

// Skills
ipcMain.handle('skills:sync', async (_event, apiUrl: string, apiToken: string) => {
  return skillsStore.syncSkills(apiUrl, apiToken)
})

ipcMain.handle('skills:get-info', async () => {
  return {
    count: skillsStore.getSkillCount(),
    lastSync: skillsStore.getLastSync(),
    version: skillsStore.getVersion()
  }
})

ipcMain.handle('skills:clear', async () => {
  await skillsStore.clearSkills()
  return { success: true }
})

// Workspaces
ipcMain.handle('workspaces:fetch', async () => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return {
        success: false,
        data: [],
        error: 'Not authenticated'
      }
    }

    const response = await fetch(`${credentials.apiUrl}/api/workspaces`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${credentials.apiToken}`
      }
    })

    if (!response.ok) {
      return {
        success: false,
        data: [],
        error: `Failed to fetch workspaces: ${response.statusText}`
      }
    }

    const data = await response.json()
    return {
      success: true,
      data: data.workspaces || []
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Projects
ipcMain.handle('projects:fetch', async () => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return {
        success: false,
        data: [],
        error: 'Not authenticated'
      }
    }

    const response = await fetch(`${credentials.apiUrl}/api/projects`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${credentials.apiToken}`
      }
    })

    if (!response.ok) {
      return {
        success: false,
        data: [],
        error: `Failed to fetch projects: ${response.statusText}`
      }
    }

    const data = await response.json()
    return {
      success: true,
      data: data.data || data
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Agent
ipcMain.handle('agent:send-message', async (_event, params: {
  content: string
  images?: Array<{ data: string; mediaType: string }>
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

ipcMain.handle('agent:get-session-info', async (_event, sessionId: string) => {
  const info = agentService.getSessionInfo(sessionId)
  console.log('[IPC] get-session-info:', sessionId, '→', info ? 'found' : 'not found')
  return info
})

ipcMain.handle('agent:list-active-sessions', async () => {
  const sessions = agentService.listActiveSessions()
  console.log('[IPC] list-active-sessions → count:', sessions.length)
  return sessions
})

// Session persistence
ipcMain.handle('session:save', async (_event, sessionData: {
  sessionId: string
  title: string
  timestamp: number
  endTime: number | null
  workingDirectory: string
  turns: unknown[]
  totalCost: number
}) => {
  try {
    const sessionsDir = join(sessionData.workingDirectory, '.conntext', 'sessions')

    // Create directory if it doesn't exist
    if (!existsSync(sessionsDir)) {
      await mkdir(sessionsDir, { recursive: true })
    }

    // Save session file
    const sessionFile = join(sessionsDir, `${sessionData.sessionId}.json`)
    await writeFile(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('Failed to save session:', error)
    return { success: false }
  }
})

ipcMain.handle('session:load', async (_event, workingDirectory: string, sessionId: string) => {
  try {
    const sessionFile = join(workingDirectory, '.conntext', 'sessions', `${sessionId}.json`)
    const content = await readFile(sessionFile, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Failed to load session:', error)
    return null
  }
})

ipcMain.handle('session:list', async (_event, workingDirectory: string) => {
  try {
    const sessionsDir = join(workingDirectory, '.conntext', 'sessions')

    if (!existsSync(sessionsDir)) {
      return []
    }

    const files = await readdir(sessionsDir)
    const sessions = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(join(sessionsDir, file), 'utf-8')
          const session = JSON.parse(content)
          sessions.push({
            sessionId: session.sessionId,
            title: session.title,
            timestamp: session.timestamp,
            endTime: session.endTime,
            turnsCount: session.turns?.length || 0,
            totalCost: session.totalCost || 0
          })
        } catch (error) {
          console.error(`Failed to read session file ${file}:`, error)
        }
      }
    }

    // Sort by timestamp descending (newest first)
    return sessions.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to list sessions:', error)
    return []
  }
})

ipcMain.handle('session:delete', async (_event, workingDirectory: string, sessionId: string) => {
  try {
    const sessionFile = join(workingDirectory, '.conntext', 'sessions', `${sessionId}.json`)
    await unlink(sessionFile)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete session:', error)
    return { success: false }
  }
})

// App lifecycle
app.whenReady().then(() => {
  // Initialize vision service if Anthropic API key exists
  const anthropicKey = authStore.getAnthropicKey()
  if (anthropicKey) {
    agentService.initializeVisionService(anthropicKey)
  }

  // Initialize Claude Code path if it exists
  const claudeCodePath = appStateStore.getClaudeCodePath()
  if (claudeCodePath) {
    agentService.setClaudeCodePath(claudeCodePath)
  }

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
