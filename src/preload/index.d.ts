export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system'
  data: Record<string, unknown>
}

export interface UserInfo {
  id: string
  name: string
  email: string
}

export interface SessionData {
  sessionId: string
  sdkSessionId?: string | null
  title: string
  timestamp: number
  endTime: number | null
  workingDirectory: string
  turns: Turn[]
  totalCost: number
}

export interface Turn {
  id: string
  userMessage: string
  images?: Array<{ data: string; mediaType: string }>
  textBlocks: string[]
  toolEvents: ToolEvent[]
  isComplete: boolean
  startTime: number
  endTime: number | null
  costUsd: number | null
}

export interface ToolEvent {
  type: 'tool_use' | 'tool_result'
  tool?: string
  input?: Record<string, unknown>
  output?: string
}

export interface SessionMetadata {
  sessionId: string
  title: string
  timestamp: number
  endTime: number | null
  turnsCount: number
  totalCost: number
}

export interface ActiveSessionInfo {
  id: string
  sdkSessionId: string | null
  workingDirectory: string
  createdAt: Date
  allowedTools: string[]
}

export interface StoredCredentials {
  apiUrl: string
  apiToken: string
  user: UserInfo
}

export interface AppState {
  lastWorkingDirectory: string | null
  lastSessionId: string | null
  claudeCodePath: string | null
  recentDirectories: string[]
  activeWorkspaceId: string | null
}

export interface SkillsInfo {
  count: number
  lastSync: string | null
  version: number
}

export interface SkillsSyncResult {
  success: boolean
  count: number
  updated: boolean
  error?: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  workspace_type: 'personal' | 'shared'
  logo_url: string | null
}

export interface WorkspacesResponse {
  success: boolean
  data: Workspace[]
  error?: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
  organisation_id: string
  organisation?: {
    id: string
    name: string
  }
}

export interface ProjectsResponse {
  success: boolean
  data: Project[]
  error?: string
}

export interface ElectronAPI {
  // Auth
  getCredentials: () => Promise<StoredCredentials | null>
  saveCredentials: (credentials: StoredCredentials) => Promise<{ success: boolean }>
  clearCredentials: () => Promise<{ success: boolean }>
  getAnthropicKey: () => Promise<string | null>
  saveAnthropicKey: (apiKey: string) => Promise<{ success: boolean }>
  clearAnthropicKey: () => Promise<{ success: boolean }>

  // App state
  getAppState: () => Promise<AppState>
  saveWorkingDirectory: (directory: string) => Promise<{ success: boolean }>
  saveSessionId: (sessionId: string) => Promise<{ success: boolean }>
  clearAppState: () => Promise<{ success: boolean }>
  saveClaudeCodePath: (path: string) => Promise<{ success: boolean }>
  getClaudeCodePath: () => Promise<string | null>
  clearClaudeCodePath: () => Promise<{ success: boolean }>
  saveActiveWorkspaceId: (workspaceId: string) => Promise<{ success: boolean }>

  // Folder selection
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<string | null>

  // File operations
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  copyDirectory: (sourcePath: string, destinationPath: string) => Promise<boolean>
  getSkillsPath: () => Promise<string>
  getUserHome: () => Promise<string>
  writeImageFile: (path: string, imageData: Uint8Array) => Promise<void>

  // Agent
  sendMessage: (params: {
    content: string
    images?: Array<{ data: string; mediaType: string }>
    workingDirectory: string
    sessionId?: string
    sdkSessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
    previousTurns?: Turn[]
  }) => Promise<{ sessionId: string; success: boolean }>

  createSession: (params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => Promise<{ sessionId: string }>

  destroySession: (sessionId: string) => Promise<{ success: boolean }>

  getSessionInfo: (sessionId: string) => Promise<ActiveSessionInfo | null>

  listActiveSessions: () => Promise<ActiveSessionInfo[]>

  // Session persistence
  saveSession: (sessionData: SessionData) => Promise<{ success: boolean }>
  loadSession: (workingDirectory: string, sessionId: string) => Promise<SessionData | null>
  listSessions: (workingDirectory: string) => Promise<SessionMetadata[]>
  deleteSession: (workingDirectory: string, sessionId: string) => Promise<{ success: boolean }>

  // Skills
  syncSkills: (apiUrl: string, apiToken: string) => Promise<SkillsSyncResult>
  getSkillsInfo: () => Promise<SkillsInfo>
  clearSkills: () => Promise<{ success: boolean }>

  // Workspaces
  fetchWorkspaces: () => Promise<WorkspacesResponse>

  // Projects
  fetchProjects: () => Promise<ProjectsResponse>

  // Stream events
  onStreamEvent: (callback: (event: StreamEvent) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
