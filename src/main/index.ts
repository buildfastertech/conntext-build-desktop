import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import * as path from 'path'
import * as fs from 'fs'
import { readFile, writeFile, mkdir, readdir, unlink, cp, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { AgentService, type SessionSaveData } from './agent-service'
import { AuthStore } from './auth-store'
import { AppStateStore } from './app-state-store'
import { SkillsStore } from './skills-store'
// WebSocketService no longer used — Pusher.js runs in the renderer (browser context)
import { resolveUserQuestion } from './tools/ask-user'

let mainWindow: BrowserWindow | null = null
const agentService = new AgentService()
const authStore = new AuthStore()
const appStateStore = new AppStateStore()
const skillsStore = new SkillsStore()
// webSocketService removed — Pusher.js now runs in the renderer process

// Wire up auto-save → server sync: every time AgentService auto-saves to disk, sync to server
agentService.setOnSessionSaved((data) => {
  if (data.projectId) {
    syncToServer({ ...data, projectId: data.projectId })
  }
})

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

ipcMain.handle('app-state:save-project-session-id', (_event, projectId: string, sessionId: string) => {
  appStateStore.saveProjectSessionId(projectId, sessionId)
  return { success: true }
})

ipcMain.handle('app-state:get-project-last-session-id', (_event, projectId: string) => {
  return appStateStore.getProjectLastSessionId(projectId)
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
    count: await skillsStore.getSkillCount(),
    lastSync: await skillsStore.getLastSync(),
    version: await skillsStore.getVersion()
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

// Project features (for features panel)
ipcMain.handle('features:fetch', async (_event, workspaceId: string, projectId: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const response = await fetch(
      `${credentials.apiUrl}/api/workspaces/${workspaceId}/projects/${projectId}/features`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.apiToken}`
        }
      }
    )

    if (!response.ok) {
      return { success: false, data: [], error: `Failed to fetch features: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data: data.features || [] }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Active tasks for a project (from task boards)
ipcMain.handle('active-tasks:fetch', async (_event, workspaceId: string, projectId: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const response = await fetch(
      `${credentials.apiUrl}/api/workspaces/${workspaceId}/tasks?project_id=${projectId}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.apiToken}`
        }
      }
    )

    if (!response.ok) {
      return { success: false, data: [], error: `Failed to fetch tasks: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data: data.tasks || [] }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Active tickets for a workspace (from service desks)
ipcMain.handle('active-tickets:fetch', async (_event, workspaceId: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const response = await fetch(
      `${credentials.apiUrl}/api/workspaces/${workspaceId}/tickets`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.apiToken}`
        }
      }
    )

    if (!response.ok) {
      return { success: false, data: [], error: `Failed to fetch tickets: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data: data.tickets || [] }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Project product owners (digital employees)
ipcMain.handle('product-owners:fetch', async (_event, workspaceId: string, projectId: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const response = await fetch(
      `${credentials.apiUrl}/api/workspaces/${workspaceId}/projects/${projectId}/product-owners`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.apiToken}`
        }
      }
    )

    if (!response.ok) {
      return { success: false, data: [], error: `Failed to fetch product owners: ${response.statusText}` }
    }

    const data = await response.json()
    return { success: true, data: data.product_owners || [] }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Download feature PRD to working directory
ipcMain.handle('features:download-prd', async (_event, workspaceId: string, projectId: string, featureId: string, workingDirectory: string) => {
  try {
    const credentials = authStore.getCredentials()
    if (!credentials) {
      return { success: false, error: 'Not authenticated' }
    }

    // Fetch all features for the project
    const response = await fetch(
      `${credentials.apiUrl}/api/workspaces/${workspaceId}/projects/${projectId}/features`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.apiToken}`
        }
      }
    )

    if (!response.ok) {
      return { success: false, error: `Failed to fetch features: ${response.statusText}` }
    }

    const data = await response.json()
    const features = data.features || []

    // Find the specific feature
    const feature = features.find((f: any) => f.id === featureId)

    if (!feature) {
      return { success: false, error: 'Feature not found' }
    }

    if (!feature.prd_summary || feature.prd_summary_status !== 'generated') {
      return { success: false, error: 'PRD not available for this feature' }
    }

    // Create .context/feature directory if it doesn't exist
    const contextDir = path.join(workingDirectory, '.context', 'feature')
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true })
    }

    // Generate filename from feature title
    const slug = feature.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const filename = `${slug}-prd.md`
    const filePath = path.join(contextDir, filename)

    // Write PRD content to file
    fs.writeFileSync(filePath, feature.prd_summary, 'utf8')

    // Return relative path from working directory
    const relativePath = path.relative(workingDirectory, filePath).replace(/\\/g, '/')

    return { success: true, path: relativePath }
  } catch (error) {
    return {
      success: false,
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
  turnId?: string
  sessionTitle?: string
  projectId?: string | null
  featureId?: string | null
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

ipcMain.handle('agent:add-marker', async (_event, sessionId: string, marker: { type: string; skillName?: string; data?: Record<string, unknown> }) => {
  return { success: agentService.addMarker(sessionId, marker as any) }
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

// Get the current active turn state accumulated in the main process.
// Used when the renderer switches back to a session to hydrate the UI.
ipcMain.handle('agent:get-active-turn', async (_event, sessionId: string) => {
  return agentService.getActiveTurnState(sessionId)
})

// Set session metadata so the main process can auto-save to disk.
ipcMain.handle('agent:set-session-meta', async (_event, sessionId: string, meta: { title: string; timestamp: number; completedTurns: unknown[] }) => {
  agentService.setSessionMeta(sessionId, meta as any)
  return { success: true }
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
// Helper to get the sessions directory — scoped by projectId when provided
function getSessionsDir(workingDirectory: string, projectId?: string | null): string {
  if (projectId) {
    return join(workingDirectory, '.conntext', 'sessions', projectId)
  }
  return join(workingDirectory, '.conntext', 'sessions')
}

// Sync session to server on every disk save (fire-and-forget)
function syncToServer(sessionData: {
  sessionId: string
  projectId: string
  featureId?: string | null
  title: string
  timestamp: number
  endTime: number | null
  workingDirectory: string
  turns: unknown[]
  totalCost: number
}): void {
  const credentials = authStore.getCredentials()
  if (!credentials) return

  const syncStartedAt = Date.now()
  console.log(`[SessionSync] → START sync for session: ${sessionData.sessionId} (turns: ${(sessionData.turns as unknown[]).length}, cost: ${sessionData.totalCost})`)

  fetch(`${credentials.apiUrl}/api/agent-sessions/sync`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.apiToken}`
    },
    body: JSON.stringify({
      session_id: sessionData.sessionId,
      project_id: sessionData.projectId,
      feature_id: sessionData.featureId ?? null,
      data: {
        title: sessionData.title,
        timestamp: sessionData.timestamp,
        endTime: sessionData.endTime,
        workingDirectory: sessionData.workingDirectory,
        turns: sessionData.turns,
        totalCost: sessionData.totalCost
      }
    })
  })
    .then(res => {
      const elapsed = Date.now() - syncStartedAt
      if (res.ok) {
        console.log(`[SessionSync] ✓ DONE  sync for session: ${sessionData.sessionId} (${elapsed}ms)`)
      } else {
        console.warn(`[SessionSync] ✗ FAIL  sync for session: ${sessionData.sessionId} — server returned ${res.status} (${elapsed}ms)`)
      }
    })
    .catch(err => {
      const elapsed = Date.now() - syncStartedAt
      console.warn(`[SessionSync] ✗ ERROR sync for session: ${sessionData.sessionId} — ${err.message} (${elapsed}ms)`)
    })
}

ipcMain.handle('session:save', async (_event, sessionData: {
  sessionId: string
  projectId?: string | null
  featureId?: string | null
  title: string
  timestamp: number
  endTime: number | null
  workingDirectory: string
  turns: unknown[]
  totalCost: number
}) => {
  try {
    const sessionsDir = getSessionsDir(sessionData.workingDirectory, sessionData.projectId)

    // Create directory if it doesn't exist
    if (!existsSync(sessionsDir)) {
      await mkdir(sessionsDir, { recursive: true })
    }

    // Save session file
    const sessionFile = join(sessionsDir, `${sessionData.sessionId}.json`)
    await writeFile(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8')

    // Sync to server (fire-and-forget) on every disk save when a project is selected
    if (sessionData.projectId) {
      syncToServer({ ...sessionData, projectId: sessionData.projectId })
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to save session:', error)
    return { success: false }
  }
})

ipcMain.handle('session:load', async (_event, workingDirectory: string, sessionId: string, projectId?: string | null) => {
  try {
    // Try project-scoped directory first
    const sessionFile = join(getSessionsDir(workingDirectory, projectId), `${sessionId}.json`)
    const content = await readFile(sessionFile, 'utf-8')
    return JSON.parse(content)
  } catch {
    // Fallback: try the root sessions directory (backwards compat for old sessions)
    if (projectId) {
      try {
        const fallbackFile = join(getSessionsDir(workingDirectory), `${sessionId}.json`)
        const content = await readFile(fallbackFile, 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    }
    return null
  }
})

ipcMain.handle('session:list', async (_event, workingDirectory: string, projectId?: string | null) => {
  try {
    const sessionsDir = getSessionsDir(workingDirectory, projectId)

    if (!existsSync(sessionsDir)) {
      return []
    }

    const entries = await readdir(sessionsDir, { withFileTypes: true })
    const sessions = []

    for (const entry of entries) {
      // Only read .json files, skip subdirectories (which are project-scoped folders)
      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const content = await readFile(join(sessionsDir, entry.name), 'utf-8')
          const session = JSON.parse(content)
          sessions.push({
            sessionId: session.sessionId,
            projectId: session.projectId || null,
            featureId: session.featureId || null,
            featureTitle: session.featureTitle || null,
            title: session.title,
            timestamp: session.timestamp,
            endTime: session.endTime,
            turnsCount: session.turns?.length || 0,
            totalCost: session.totalCost || 0
          })
        } catch (error) {
          console.error(`Failed to read session file ${entry.name}:`, error)
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

ipcMain.handle('session:rename', async (_event, workingDirectory: string, sessionId: string, newTitle: string, projectId?: string | null) => {
  console.log('[Main] session:rename called', { workingDirectory, sessionId, newTitle, projectId })
  try {
    const sessionFile = join(getSessionsDir(workingDirectory, projectId), `${sessionId}.json`)
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

ipcMain.handle('session:delete', async (_event, workingDirectory: string, sessionId: string, projectId?: string | null) => {
  try {
    const sessionFile = join(getSessionsDir(workingDirectory, projectId), `${sessionId}.json`)
    await unlink(sessionFile)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete session:', error)
    return { success: false }
  }
})

// WebSocket config for renderer-side Pusher connection
// (Pusher.js must run in the renderer/browser context, not Node.js main process)
ipcMain.handle('websocket:get-config', async () => {
  const credentials = authStore.getCredentials()
  if (!credentials) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const configResponse = await fetch(`${credentials.apiUrl}/api/broadcasting/config`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.apiToken}`
      }
    })

    let wsConfig = { key: '', host: '', port: 443, scheme: 'https' }

    if (configResponse.ok) {
      const remoteConfig = await configResponse.json()
      wsConfig = {
        key: remoteConfig.key || '',
        host: remoteConfig.host || '',
        port: remoteConfig.port || 443,
        scheme: remoteConfig.scheme || 'https'
      }
    }

    return {
      success: true,
      config: {
        apiUrl: credentials.apiUrl,
        apiToken: credentials.apiToken,
        ...wsConfig
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch config'
    }
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
