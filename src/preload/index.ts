import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system' | 'user_question' | 'partial_text' | 'thinking' | 'tool_progress'
  data: Record<string, unknown>
  /** Session ID that emitted this event — used to filter cross-project events */
  sessionId?: string
  /** Turn ID that emitted this event — used to route events to the correct turn */
  turnId?: string
}

const api = {
  // Auth
  getCredentials: () => ipcRenderer.invoke('auth:get-credentials'),
  saveCredentials: (credentials: { apiUrl: string; apiToken: string; user: { id: string; name: string; email: string } }) =>
    ipcRenderer.invoke('auth:save-credentials', credentials),
  clearCredentials: () => ipcRenderer.invoke('auth:clear-credentials'),
  getAnthropicKey: () => ipcRenderer.invoke('auth:get-anthropic-key'),
  saveAnthropicKey: (apiKey: string) => ipcRenderer.invoke('auth:save-anthropic-key', apiKey),
  clearAnthropicKey: () => ipcRenderer.invoke('auth:clear-anthropic-key'),

  // App state
  getAppState: () => ipcRenderer.invoke('app-state:get'),
  saveWorkingDirectory: (directory: string) => ipcRenderer.invoke('app-state:save-working-directory', directory),
  saveSessionId: (sessionId: string) => ipcRenderer.invoke('app-state:save-session-id', sessionId),
  saveProjectSessionId: (projectId: string, sessionId: string) => ipcRenderer.invoke('app-state:save-project-session-id', projectId, sessionId),
  getProjectLastSessionId: (projectId: string) => ipcRenderer.invoke('app-state:get-project-last-session-id', projectId),
  clearAppState: () => ipcRenderer.invoke('app-state:clear'),
  saveClaudeCodePath: (path: string) => ipcRenderer.invoke('app-state:save-claude-code-path', path),
  getClaudeCodePath: () => ipcRenderer.invoke('app-state:get-claude-code-path'),
  clearClaudeCodePath: () => ipcRenderer.invoke('app-state:clear-claude-code-path'),
  saveActiveWorkspaceId: (workspaceId: string) => ipcRenderer.invoke('app-state:save-active-workspace-id', workspaceId),

  // Folder selection
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),

  // File operations
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  readPdf: (path: string) => ipcRenderer.invoke('fs:read-pdf', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:write-file', path, content),
  copyDirectory: (sourcePath: string, destinationPath: string) => ipcRenderer.invoke('fs:copy-directory', sourcePath, destinationPath),
  getSkillsPath: () => ipcRenderer.invoke('fs:get-skills-path'),
  getUserHome: () => ipcRenderer.invoke('fs:get-user-home'),
  writeImageFile: (path: string, imageData: Uint8Array) => ipcRenderer.invoke('fs:write-image-file', path, imageData),
  listDirectories: (dirPath: string) => ipcRenderer.invoke('fs:list-directories', dirPath),
  searchFiles: (rootDir: string, query: string, limit?: number) => ipcRenderer.invoke('fs:search-files', rootDir, query, limit ?? 20),

  // Agent
  sendMessage: (params: {
    content: string
    workingDirectory: string
    sessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
    model?: string
    turnId?: string
    sessionTitle?: string
    projectId?: string | null
    featureId?: string | null
  }) => ipcRenderer.invoke('agent:send-message', params),

  abortAgent: (sessionId: string) => ipcRenderer.invoke('agent:abort', sessionId),
  injectMessage: (sessionId: string, content: string) => ipcRenderer.invoke('agent:inject-message', sessionId, content),
  rewindFiles: (sessionId: string, userMessageId: string, dryRun?: boolean) =>
    ipcRenderer.invoke('agent:rewind-files', sessionId, userMessageId, dryRun ?? false),

  addMarker: (sessionId: string, marker: { type: string; skillName?: string; data?: Record<string, unknown> }) =>
    ipcRenderer.invoke('agent:add-marker', sessionId, marker),

  createSession: (params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => ipcRenderer.invoke('agent:create-session', params),

  destroySession: (sessionId: string) =>
    ipcRenderer.invoke('agent:destroy-session', sessionId),

  getSessionInfo: (sessionId: string) =>
    ipcRenderer.invoke('agent:get-session-info', sessionId),

  listActiveSessions: () =>
    ipcRenderer.invoke('agent:list-active-sessions'),

  getActiveTurnState: (sessionId: string) =>
    ipcRenderer.invoke('agent:get-active-turn', sessionId),

  setSessionMeta: (sessionId: string, meta: { title: string; timestamp: number; completedTurns: unknown[] }) =>
    ipcRenderer.invoke('agent:set-session-meta', sessionId, meta),

  // Session persistence
  saveSession: (sessionData: unknown) =>
    ipcRenderer.invoke('session:save', sessionData),
  loadSession: (workingDirectory: string, sessionId: string, projectId?: string | null) =>
    ipcRenderer.invoke('session:load', workingDirectory, sessionId, projectId),
  listSessions: (workingDirectory: string, projectId?: string | null) =>
    ipcRenderer.invoke('session:list', workingDirectory, projectId),
  deleteSession: (workingDirectory: string, sessionId: string, projectId?: string | null) =>
    ipcRenderer.invoke('session:delete', workingDirectory, sessionId, projectId),
  renameSession: (workingDirectory: string, sessionId: string, newTitle: string, projectId?: string | null) =>
    ipcRenderer.invoke('session:rename', workingDirectory, sessionId, newTitle, projectId),

  // Skills
  syncSkills: (apiUrl: string, apiToken: string) =>
    ipcRenderer.invoke('skills:sync', apiUrl, apiToken),
  getSkillsInfo: () =>
    ipcRenderer.invoke('skills:get-info'),
  clearSkills: () =>
    ipcRenderer.invoke('skills:clear'),

  // Workspaces
  fetchWorkspaces: () =>
    ipcRenderer.invoke('workspaces:fetch'),

  // Projects
  fetchProjects: () =>
    ipcRenderer.invoke('projects:fetch'),

  // Features
  fetchFeatures: (workspaceId: string, projectId: string) =>
    ipcRenderer.invoke('features:fetch', workspaceId, projectId),
  downloadFeaturePRD: (workspaceId: string, projectId: string, featureId: string, workingDirectory: string) =>
    ipcRenderer.invoke('features:download-prd', workspaceId, projectId, featureId, workingDirectory),

  // Product Owners (digital employees)
  fetchProductOwners: (workspaceId: string, projectId: string) =>
    ipcRenderer.invoke('product-owners:fetch', workspaceId, projectId),

  // Active tasks & tickets
  fetchActiveTasks: (workspaceId: string, projectId: string) =>
    ipcRenderer.invoke('active-tasks:fetch', workspaceId, projectId),
  fetchActiveTickets: (workspaceId: string) =>
    ipcRenderer.invoke('active-tickets:fetch', workspaceId),

  // WebSocket — config is fetched from main, Pusher runs in renderer (browser context)
  getWebSocketConfig: () =>
    ipcRenderer.invoke('websocket:get-config') as Promise<{
      success: boolean
      error?: string
      config?: { apiUrl: string; apiToken: string; key: string; host: string; port: number; scheme: string }
    }>,

  // User question responses
  respondToQuestion: (questionId: string, response: string) =>
    ipcRenderer.invoke('agent:respond-to-question', questionId, response),

  // Menu
  executeMenuAction: (action: string) => ipcRenderer.invoke('menu:execute', action),

  // Stream events from main process
  onStreamEvent: (callback: (event: StreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data)
    ipcRenderer.on('agent:stream-event', handler)
    return () => ipcRenderer.removeListener('agent:stream-event', handler)
  },

  // File utilities
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
