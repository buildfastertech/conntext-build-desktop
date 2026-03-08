import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, readdir, unlink, cp, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { AgentService } from './agent-service'
import { AuthStore } from './auth-store'
import { AppStateStore } from './app-state-store'
import { SkillsStore } from './skills-store'
import { resolveUserQuestion } from './tools/ask-user'

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
  // Set a hidden menu with keyboard accelerators (visible menu is rendered in the renderer)
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Quit', accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  const savedBounds = appStateStore.getWindowBounds()

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1200,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 800,
    minHeight: 600,
    title: 'ConnText Build',
    icon: join(__dirname, '../../resources/icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e0e14',
      symbolColor: '#a0a0b8',
      height: 44
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Restore maximized state after window is created
  if (savedBounds?.isMaximized) {
    mainWindow.maximize()
  }

  // Save window bounds on move/resize (debounced)
  let saveBoundsTimeout: ReturnType<typeof setTimeout> | null = null
  const saveWindowBounds = () => {
    if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout)
    saveBoundsTimeout = setTimeout(() => {
      if (!mainWindow) return
      const isMaximized = mainWindow.isMaximized()
      // Save normal (non-maximized) bounds so restore works correctly
      const bounds = isMaximized ? (mainWindow.getNormalBounds?.() ?? mainWindow.getBounds()) : mainWindow.getBounds()
      appStateStore.saveWindowBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized
      })
    }, 500)
  }

  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

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

// Menu actions - define allowed actions for security
const ALLOWED_MENU_ACTIONS = [
  'app:quit',
  'window:reload',
  'window:toggle-devtools',
  'window:toggle-fullscreen',
  'window:zoom-in',
  'window:zoom-out',
  'window:zoom-reset',
  'edit:undo',
  'edit:redo',
  'edit:cut',
  'edit:copy',
  'edit:paste',
  'edit:select-all'
] as const

ipcMain.handle('menu:execute', (_event, action: string) => {
  // Validate action is in allowed list
  if (!ALLOWED_MENU_ACTIONS.includes(action as any)) {
    console.warn(`Invalid menu action attempted: ${action}`)
    return
  }

  const win = BrowserWindow.getFocusedWindow()
  if (!win) return

  switch (action) {
    case 'app:quit':
      app.quit()
      break
    case 'window:reload':
      win.reload()
      break
    case 'window:toggle-devtools':
      win.webContents.toggleDevTools()
      break
    case 'window:toggle-fullscreen':
      win.setFullScreen(!win.isFullScreen())
      break
    case 'window:zoom-in':
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5)
      break
    case 'window:zoom-out':
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5)
      break
    case 'window:zoom-reset':
      win.webContents.setZoomLevel(0)
      break
    case 'edit:undo':
      win.webContents.undo()
      break
    case 'edit:redo':
      win.webContents.redo()
      break
    case 'edit:cut':
      win.webContents.cut()
      break
    case 'edit:copy':
      win.webContents.copy()
      break
    case 'edit:paste':
      win.webContents.paste()
      break
    case 'edit:select-all':
      win.webContents.selectAll()
      break
  }
})

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

// General file selection (multiple files)
ipcMain.handle('dialog:select-files', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Files to Attach'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths
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

ipcMain.handle('fs:read-pdf', async (_event, filePath: string) => {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = await readFile(filePath)
    const data = await pdfParse(buffer)
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info
    }
  } catch (error) {
    return { error: (error as Error).message, text: '', numPages: 0, info: {} }
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

ipcMain.handle('fs:list-directories', async (_event, dirPath: string) => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
})

// File search (for @ mentions)
ipcMain.handle('fs:search-files', async (_event, rootDir: string, query: string, limit: number = 20) => {
  const IGNORED = new Set([
    'node_modules', '.git', '.next', 'dist', 'out', 'build', '.cache',
    'vendor', '.idea', '.vscode', '__pycache__', '.conntext', '.claude'
  ])
  const results: string[] = []
  const lowerQuery = query.toLowerCase()

  async function walk(dir: string, prefix: string): Promise<void> {
    if (results.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= limit) return
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!IGNORED.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name), relPath)
        }
      } else {
        if (relPath.toLowerCase().includes(lowerQuery)) {
          results.push(relPath)
        }
      }
    }
  }

  await walk(rootDir, '')
  return results
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

// Workspace folders (for folder context selector)
ipcMain.handle('workspace:fetch-folders', async (_event, projectId: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return {
        success: false,
        folders: [],
        error: 'Not authenticated'
      }
    }

    const response = await fetch(`${credentials.apiUrl}/api/projects/${projectId}/planning/folders`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${credentials.apiToken}`
      }
    })

    if (!response.ok) {
      return {
        success: false,
        folders: [],
        error: `Failed to fetch folders: ${response.statusText}`
      }
    }

    const data = await response.json()
    return {
      success: true,
      folders: data.folders || []
    }
  } catch (error) {
    return {
      success: false,
      folders: [],
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
  model?: string
}) => {
  return agentService.sendMessage(params, (event) => {
    mainWindow?.webContents.send('agent:stream-event', event)
  })
})

ipcMain.handle('agent:abort', async (_event, sessionId: string) => {
  return agentService.abortSession(sessionId)
})

ipcMain.handle('agent:inject-message', async (_event, sessionId: string, content: string) => {
  return { injected: agentService.injectMessage(sessionId, content) }
})

ipcMain.handle('agent:rewind-files', async (_event, sessionId: string, userMessageId: string, dryRun: boolean) => {
  return agentService.rewindFiles(sessionId, userMessageId, dryRun)
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

// User question responses (from ask_user MCP tool)
ipcMain.handle('agent:respond-to-question', async (_event, questionId: string, response: string) => {
  console.log('[IPC] respond-to-question:', questionId, '| response length:', response.length)
  console.log('[IPC] response preview:', response.substring(0, 200))
  const resolved = resolveUserQuestion(questionId, response)
  console.log('[IPC] resolveUserQuestion result:', resolved, '| questionId:', questionId)
  if (!resolved) {
    console.error('[IPC] WARNING: Could not resolve question — pending question not found for id:', questionId)
  }
  return { success: resolved }
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

ipcMain.handle('session:rename', async (_event, workingDirectory: string, sessionId: string, newTitle: string) => {
  console.log('[Main] session:rename called', { workingDirectory, sessionId, newTitle })
  try {
    const sessionFile = join(workingDirectory, '.conntext', 'sessions', `${sessionId}.json`)
    const content = await readFile(sessionFile, 'utf-8')
    const session = JSON.parse(content)
    session.title = newTitle
    await writeFile(sessionFile, JSON.stringify(session, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to rename session:', error)
    return { success: false }
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
