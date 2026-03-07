export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system'
  data: Record<string, unknown>
}

export interface UserInfo {
  id: string
  name: string
  email: string
}

export interface StoredCredentials {
  apiUrl: string
  apiToken: string
  user: UserInfo
}

export interface ElectronAPI {
  // Auth
  getCredentials: () => Promise<StoredCredentials | null>
  saveCredentials: (credentials: StoredCredentials) => Promise<{ success: boolean }>
  clearCredentials: () => Promise<{ success: boolean }>

  // Folder selection
  selectFolder: () => Promise<string | null>

  // Agent
  sendMessage: (params: {
    content: string
    workingDirectory: string
    sessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => Promise<{ sessionId: string; success: boolean }>

  createSession: (params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => Promise<{ sessionId: string }>

  destroySession: (sessionId: string) => Promise<{ success: boolean }>

  // Stream events
  onStreamEvent: (callback: (event: StreamEvent) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
