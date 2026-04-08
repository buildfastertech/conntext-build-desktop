export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system' | 'user_question' | 'partial_text' | 'thinking' | 'tool_progress'
  data: Record<string, unknown>
  /** Session ID that emitted this event — used to filter cross-project events */
  sessionId?: string
  /** Turn ID that emitted this event — used to route events to the correct turn */
  turnId?: string
}

export interface UserQuestion {
  questionId: string
  questions: Array<{
    question: string
    options?: Array<{ label: string; description?: string }>
    multiSelect?: boolean
    freeText?: boolean
  }>
}

export interface UserInfo {
  id: string
  name: string
  email: string
}

export interface SessionMarker {
  type: 'skill_started' | 'skill_completed' | 'skill_failed' | 'prd_build_started' | 'prd_build_completed' | 'prd_build_failed'
  timestamp: number
  afterTurnIndex: number
  skillName?: string
  data?: {
    prdPath?: string
    totalTasks?: number
    totalSubtasks?: number
    tasksCompleted?: number
    tasksFailed?: number
    tasksSkipped?: number
    featureId?: string
    featureTitle?: string
    errorMessage?: string
    [key: string]: unknown
  }
}

export interface SessionData {
  sessionId: string
  sdkSessionId?: string | null
  projectId?: string | null
  featureId?: string | null
  featureTitle?: string | null
  title: string
  timestamp: number
  endTime: number | null
  workingDirectory: string
  turns: Turn[]
  totalCost: number
  markers?: SessionMarker[]
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
  /** SDK checkpoint UUID for this turn — enables file rewind */
  checkpointId?: string
  /** Current partial/streaming assistant text (cleared when full text block arrives) */
  currentPartialText?: string
  /** Current thinking/reasoning text from extended thinking */
  currentThinking?: string
  /** Whether the model is currently thinking */
  isThinking?: boolean
  /** Progress updates for currently running tools */
  toolProgress?: Record<string, { toolName: string; elapsedSeconds: number }>
  /** Messages injected by the user mid-turn while agent is streaming */
  injectedMessages?: string[]
}

export interface RewindFilesResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}

export interface ToolEvent {
  type: 'tool_use' | 'tool_result'
  tool?: string
  input?: Record<string, unknown>
  output?: string
}

export interface SessionMetadata {
  sessionId: string
  projectId?: string | null
  featureId?: string | null
  featureTitle?: string | null
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
  isProcessing: boolean
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
  projectLastSessionIds: Record<string, string>
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
  partialFailure?: boolean
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
  is_starred?: boolean
  created_at: string
  updated_at: string
  organisation_id: string
  organisation?: {
    id: string
    name: string
  }
  features_count?: number
  feature_statuses?: {
    draft: number
    in_progress: number
    ready: number
    completed: number
    rejected: number
    archived: number
  }
  handoff?: {
    generated_at: string | null
    download_url: string | null
  }
}

export interface ProjectsResponse {
  success: boolean
  data: Project[]
  error?: string
}

export interface ProjectFeature {
  id: string
  title: string
  description: string | null
  content: string | null
  status: {
    value: string
    label: string
    color: string
  }
  priority: {
    value: string
    label: string
    color: string
  } | null
  work_item_type: {
    value: string
    label: string
  } | null
  brainstorm_category: string | null
  parent_feature_id: string | null
  order_index: number
  prd_summary: string | null
  prd_summary_status: string
  prd_summary_generated_at: string | null
  spec: string | null
  spec_status: string
  spec_generated_at: string | null
  labels: Array<{ id: string; name: string }>
  created_at: string
  updated_at: string
}

export interface FeaturesResponse {
  success: boolean
  data: ProjectFeature[]
  error?: string
}

export interface ProductOwner {
  id: string
  name: string
  profile_photo_url: string | null
  gender: string
  bio: string | null
  job_description: string
}

export interface ProductOwnersResponse {
  success: boolean
  data: ProductOwner[]
  error?: string
}

export interface ActiveTask {
  id: string
  title: string
  description: string | null
  ai_analysis: string | null
  project_id: string | null
  project_name: string | null
  status: string
  priority: string
  assigned_to_id: string | null
  assigned_to_name: string | null
  digital_employee_id: string | null
}

export interface ActiveTasksResponse {
  success: boolean
  data: ActiveTask[]
  error?: string
}

export interface ActiveTicket {
  id: string
  reference: string
  subject: string
  description: string | null
  investigation: string | null
  service_desk_id: string
  service_desk_name: string | null
  priority: string
  assigned_to_id: string | null
  assigned_to_name: string | null
  digital_employee_id: string | null
}

export interface ActiveTicketsResponse {
  success: boolean
  data: ActiveTicket[]
  error?: string
}

export interface WebSocketEvent {
  type: string
  action: string
  data: Record<string, unknown>
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
  saveProjectSessionId: (projectId: string, sessionId: string) => Promise<{ success: boolean }>
  getProjectLastSessionId: (projectId: string) => Promise<string | null>
  clearAppState: () => Promise<{ success: boolean }>
  saveClaudeCodePath: (path: string) => Promise<{ success: boolean }>
  getClaudeCodePath: () => Promise<string | null>
  clearClaudeCodePath: () => Promise<{ success: boolean }>
  saveActiveWorkspaceId: (workspaceId: string) => Promise<{ success: boolean }>
  getSessionSyncEnabled: () => Promise<boolean>
  setSessionSyncEnabled: (enabled: boolean) => Promise<{ success: boolean }>

  // Folder selection
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<string | null>
  selectFiles: () => Promise<string[] | null>

  // File operations
  readFile: (path: string) => Promise<string>
  readPdf: (path: string) => Promise<{ text: string; numPages: number; info: Record<string, unknown>; error?: string }>
  writeFile: (path: string, content: string) => Promise<void>
  copyDirectory: (sourcePath: string, destinationPath: string) => Promise<boolean>
  getSkillsPath: () => Promise<string>
  getUserHome: () => Promise<string>
  writeImageFile: (path: string, imageData: Uint8Array) => Promise<void>
  listDirectories: (dirPath: string) => Promise<string[]>
  searchFiles: (rootDir: string, query: string, limit?: number) => Promise<string[]>
  openPath: (filePath: string) => Promise<{ success: boolean }>

  // Agent
  sendMessage: (params: {
    content: string
    images?: Array<{ data: string; mediaType: string }>
    workingDirectory: string
    sessionId?: string
    sdkSessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
    model?: string
    turnId?: string
    sessionTitle?: string
    projectId?: string | null
    featureId?: string | null
    userId?: string | null
    userName?: string | null
    userEmail?: string | null
    previousTurns?: Turn[]
  }) => Promise<{ sessionId: string; success: boolean }>

  abortAgent: (sessionId: string) => Promise<{ success: boolean }>
  injectMessage: (sessionId: string, content: string) => Promise<{ injected: boolean }>
  rewindFiles: (sessionId: string, userMessageId: string, dryRun?: boolean) => Promise<RewindFilesResult>
  addMarker: (sessionId: string, marker: { type: SessionMarker['type']; skillName?: string; data?: SessionMarker['data'] }) => Promise<{ success: boolean }>

  createSession: (params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }) => Promise<{ sessionId: string }>

  createDefaultSession: (workingDirectory: string) => Promise<{ sessionId: string }>

  destroySession: (sessionId: string) => Promise<{ success: boolean }>

  getSessionInfo: (sessionId: string) => Promise<ActiveSessionInfo | null>

  listActiveSessions: () => Promise<ActiveSessionInfo[]>

  getActiveTurnState: (sessionId: string) => Promise<{ activeTurn: Turn | null; meta: { title: string; timestamp: number; completedTurns: Turn[] } | null } | null>

  setSessionMeta: (sessionId: string, meta: { title: string; timestamp: number; completedTurns: Turn[] }) => Promise<{ success: boolean }>

  // Session persistence
  saveSession: (sessionData: SessionData) => Promise<{ success: boolean }>
  loadSession: (workingDirectory: string, sessionId: string, projectId?: string | null) => Promise<SessionData | null>
  listSessions: (workingDirectory: string, projectId?: string | null) => Promise<SessionMetadata[]>
  deleteSession: (workingDirectory: string, sessionId: string, projectId?: string | null) => Promise<{ success: boolean }>
  renameSession: (workingDirectory: string, sessionId: string, newTitle: string, projectId?: string | null) => Promise<{ success: boolean }>
  updateSessionMetadata: (sessionId: string, metadata: { projectId?: string | null; featureId?: string | null }) => Promise<{ success: boolean }>

  // Skills
  syncSkills: (apiUrl: string, apiToken: string) => Promise<SkillsSyncResult>
  checkAndSyncSkills: (apiUrl: string, apiToken: string) => Promise<SkillsSyncResult>
  getSkillsInfo: () => Promise<SkillsInfo>
  listSkills: () => Promise<Array<{ id: string; title: string; version_number: number; purpose?: string | null; arguments?: Record<string, string> | null }>>
  resolveSkill: (commandName: string) => Promise<string | null>
  clearSkills: () => Promise<{ success: boolean }>

  // Workspaces
  fetchWorkspaces: () => Promise<WorkspacesResponse>

  // Projects
  fetchProjects: () => Promise<ProjectsResponse>

  // Features
  fetchFeatures: (workspaceId: string, projectId: string) => Promise<FeaturesResponse>
  downloadFeaturePRD: (workspaceId: string, projectId: string, featureId: string, workingDirectory: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // Product Owners
  fetchProductOwners: (workspaceId: string, projectId: string) => Promise<ProductOwnersResponse>

  // Active tasks & tickets
  fetchActiveTasks: (workspaceId: string, projectId: string) => Promise<ActiveTasksResponse>
  fetchActiveTickets: (workspaceId: string) => Promise<ActiveTicketsResponse>

  // WebSocket — config is fetched from main, Pusher runs in renderer (browser context)
  getWebSocketConfig: () => Promise<{
    success: boolean
    error?: string
    config?: { apiUrl: string; apiToken: string; key: string; host: string; port: number; scheme: string }
  }>

  // User question responses
  respondToQuestion: (questionId: string, response: string) => Promise<{ success: boolean }>

  // Menu
  executeMenuAction: (action: string) => Promise<void>

  // Stream events
  onStreamEvent: (callback: (event: StreamEvent) => void) => () => void

  // File utilities
  getPathForFile: (file: File) => string

  // Platform info
  platform: NodeJS.Platform
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
