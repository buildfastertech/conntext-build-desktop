import { contextBridge, ipcRenderer } from 'electron'

export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system'
  data: Record<string, unknown>
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
  clearAppState: () => ipcRenderer.invoke('app-state:clear'),
  saveClaudeCodePath: (path: string) => ipcRenderer.invoke('app-state:save-claude-code-path', path),
  getClaudeCodePath: () => ipcRenderer.invoke('app-state:get-claude-code-path'),
  clearClaudeCodePath: () => ipcRenderer.invoke('app-state:clear-claude-code-path'),
  saveActiveWorkspaceId: (workspaceId: string) => ipcRenderer.invoke('app-state:save-active-workspace-id', workspaceId),

  // Folder selection
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),

  // File operations
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:write-file', path, content),
  copyDirectory: (sourcePath: string, destinationPath: string) => ipcRenderer.invoke('fs:copy-directory', sourcePath, destinationPath),
  getSkillsPath: () => ipcRenderer.invoke('fs:get-skills-path'),
  getUserHome: () => ipcRenderer.invoke('fs:get-user-home'),
  writeImageFile: (path: string, imageData: Uint8Array) => ipcRenderer.invoke('fs:write-image-file', path, imageData),

  // Agent
  sendMessage: (params: {
    content: string
    workingDirectory: string
    sessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => ipcRenderer.invoke('agent:send-message', params),

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

  // Session persistence
  saveSession: (sessionData: unknown) =>
    ipcRenderer.invoke('session:save', sessionData),
  loadSession: (workingDirectory: string, sessionId: string) =>
    ipcRenderer.invoke('session:load', workingDirectory, sessionId),
  listSessions: (workingDirectory: string) =>
    ipcRenderer.invoke('session:list', workingDirectory),
  deleteSession: (workingDirectory: string, sessionId: string) =>
    ipcRenderer.invoke('session:delete', workingDirectory, sessionId),

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

  // Stream events from main process
  onStreamEvent: (callback: (event: StreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data)
    ipcRenderer.on('agent:stream-event', handler)
    return () => ipcRenderer.removeListener('agent:stream-event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
