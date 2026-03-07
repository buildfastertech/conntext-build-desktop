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

  // Folder selection
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

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

  // Stream events from main process
  onStreamEvent: (callback: (event: StreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data)
    ipcRenderer.on('agent:stream-event', handler)
    return () => ipcRenderer.removeListener('agent:stream-event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
