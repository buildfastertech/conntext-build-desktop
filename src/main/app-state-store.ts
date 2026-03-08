import Store from 'electron-store'

interface AppState {
  lastWorkingDirectory: string | null
  lastSessionId: string | null
  claudeCodePath: string | null
  recentDirectories: string[]
  activeWorkspaceId: string | null
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

    return {
      lastWorkingDirectory: lastWorkingDirectory ?? null,
      lastSessionId: lastSessionId ?? null,
      claudeCodePath: claudeCodePath ?? null,
      recentDirectories,
      activeWorkspaceId: activeWorkspaceId ?? null
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

  clearAppState(): void {
    this.store.delete('lastWorkingDirectory')
    this.store.delete('lastSessionId')
    this.store.delete('claudeCodePath')
    this.store.delete('activeWorkspaceId')
  }
}
