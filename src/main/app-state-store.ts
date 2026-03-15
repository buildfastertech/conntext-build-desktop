import Store from 'electron-store'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

interface AppState {
  lastWorkingDirectory: string | null
  lastSessionId: string | null
  claudeCodePath: string | null
  recentDirectories: string[]
  activeWorkspaceId: string | null
  windowBounds: WindowBounds | null
  projectLastSessionIds: Record<string, string>
}

export class AppStateStore {
  private store: Store

  constructor() {
    this.store = new Store({
      name: 'conntext-build-app-state'
    })
  }

  getAppState(): AppState {
    const lastWorkingDirectory = this.store.get('lastWorkingDirectory') as string | undefined
    const lastSessionId = this.store.get('lastSessionId') as string | undefined
    const claudeCodePath = this.store.get('claudeCodePath') as string | undefined
    const recentDirectories = (this.store.get('recentDirectories') as string[] | undefined) ?? []
    const activeWorkspaceId = this.store.get('activeWorkspaceId') as string | undefined
    const windowBounds = this.store.get('windowBounds') as WindowBounds | undefined
    const projectLastSessionIds = (this.store.get('projectLastSessionIds') as Record<string, string> | undefined) ?? {}

    return {
      lastWorkingDirectory: lastWorkingDirectory ?? null,
      lastSessionId: lastSessionId ?? null,
      claudeCodePath: claudeCodePath ?? null,
      recentDirectories,
      activeWorkspaceId: activeWorkspaceId ?? null,
      windowBounds: windowBounds ?? null,
      projectLastSessionIds
    }
  }

  saveWorkingDirectory(directory: string): void {
    this.store.set('lastWorkingDirectory', directory)
    // Also add to recent directories (max 10, most recent first, no duplicates)
    const recent = (this.store.get('recentDirectories') as string[] | undefined) ?? []
    const updated = [directory, ...recent.filter(d => d !== directory)].slice(0, 10)
    this.store.set('recentDirectories', updated)
  }

  saveSessionId(sessionId: string): void {
    this.store.set('lastSessionId', sessionId)
  }

  saveProjectSessionId(projectId: string, sessionId: string): void {
    const map = (this.store.get('projectLastSessionIds') as Record<string, string> | undefined) ?? {}
    map[projectId] = sessionId
    this.store.set('projectLastSessionIds', map)
  }

  getProjectLastSessionId(projectId: string): string | null {
    const map = (this.store.get('projectLastSessionIds') as Record<string, string> | undefined) ?? {}
    return map[projectId] ?? null
  }

  saveClaudeCodePath(path: string): void {
    this.store.set('claudeCodePath', path)
  }

  clearClaudeCodePath(): void {
    this.store.delete('claudeCodePath')
  }

  getClaudeCodePath(): string | null {
    const path = this.store.get('claudeCodePath') as string | undefined
    return path ?? null
  }

  saveActiveWorkspaceId(workspaceId: string): void {
    this.store.set('activeWorkspaceId', workspaceId)
  }

  clearActiveWorkspaceId(): void {
    this.store.delete('activeWorkspaceId')
  }

  saveWindowBounds(bounds: WindowBounds): void {
    this.store.set('windowBounds', bounds)
  }

  getWindowBounds(): WindowBounds | null {
    return (this.store.get('windowBounds') as WindowBounds | undefined) ?? null
  }

  getSessionSyncEnabled(): boolean {
    return (this.store.get('sessionSyncEnabled') as boolean | undefined) ?? false
  }

  setSessionSyncEnabled(enabled: boolean): void {
    this.store.set('sessionSyncEnabled', enabled)
  }

  clearAppState(): void {
    this.store.delete('lastWorkingDirectory')
    this.store.delete('lastSessionId')
    this.store.delete('claudeCodePath')
    this.store.delete('activeWorkspaceId')
  }
}
