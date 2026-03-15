import { useEffect, useRef, useState } from 'react'
import type { SessionMetadata, ActiveSessionInfo } from '../../../preload/index.d'

interface SessionDialogProps {
  isOpen: boolean
  onClose: () => void
  onLoadSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  sessions: SessionMetadata[]
  workingDirectory: string | null
  currentSessionId: string | null
}

type TabType = 'sessions' | 'debug'

export function SessionDialog({
  isOpen,
  onClose,
  onLoadSession,
  onDeleteSession,
  sessions,
  workingDirectory,
  currentSessionId
}: SessionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<TabType>('sessions')
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([])
  const [currentSessionInfo, setCurrentSessionInfo] = useState<ActiveSessionInfo | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Load debug data when debug tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'debug') return

    const loadDebugData = async () => {
      // Load active sessions
      const active = await window.api.listActiveSessions()
      setActiveSessions(active)

      // Load current session info
      if (currentSessionId) {
        const info = await window.api.getSessionInfo(currentSessionId)
        setCurrentSessionInfo(info)
      }
    }

    loadDebugData()
  }, [isOpen, activeTab, currentSessionId, refreshKey])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingSessionId === sessionId) {
      onDeleteSession(sessionId)
      setDeletingSessionId(null)
    } else {
      setDeletingSessionId(sessionId)
      setTimeout(() => setDeletingSessionId(null), 3000)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) {
      return diffMins === 0 ? 'Just now' : `${diffMins}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  const formatDateDetailed = (date: Date | string | number) => {
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDuration = (start: number, end: number | null) => {
    if (!end) return 'Incomplete'
    const durationMs = end - start
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    if (minutes === 0) return `${seconds}s`
    return `${minutes}m ${seconds}s`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="relative flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-brand-border">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/15 text-brand-purple ring-1 ring-brand-purple/20">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-brand-text">Session Manager</h2>
                <p className="text-xs text-brand-text-dim">
                  {workingDirectory ? `${sessions.length} saved sessions` : 'No project selected'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'debug' && (
                <button
                  onClick={handleRefresh}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-text-muted transition-colors hover:bg-brand-border/30 hover:text-brand-text"
                  title="Refresh"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-text-muted transition-colors hover:bg-brand-border/30 hover:text-brand-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'sessions'
                  ? 'border-b-2 border-brand-purple text-brand-text'
                  : 'text-brand-text-muted hover:text-brand-text'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('debug')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'debug'
                  ? 'border-b-2 border-brand-purple text-brand-text'
                  : 'text-brand-text-muted hover:text-brand-text'
              }`}
            >
              Debug
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-brand-purple/20 text-brand-purple">
                DEV
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {activeTab === 'sessions' ? (
            // Sessions Tab
            sessions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mb-3 text-4xl opacity-50">💬</div>
                <p className="text-sm text-brand-text-muted">No saved sessions yet</p>
                <p className="mt-2 text-xs text-brand-text-dim">
                  Sessions will be automatically saved when you complete a conversation
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    onClick={() => onLoadSession(session.sessionId)}
                    className="group relative cursor-pointer rounded-xl border border-brand-border bg-brand-bg/50 p-4 transition-all hover:border-brand-purple/50 hover:shadow-lg hover:shadow-brand-purple/10"
                  >
                    {/* Accent glow */}
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-purple/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-0" />

                    <div className="relative">
                      {/* Header */}
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-brand-text group-hover:text-brand-purple transition-colors">
                            {session.title}
                          </h3>
                          <p className="mt-1 text-xs text-brand-text-dim">
                            {formatDate(session.timestamp)}
                            {session.endTime && (
                              <span className="ml-2">• {formatDuration(session.timestamp, session.endTime)}</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(session.sessionId, e)}
                          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-all ${
                            deletingSessionId === session.sessionId
                              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                              : 'text-brand-text-dim hover:bg-brand-border/30 hover:text-brand-text'
                          }`}
                          title={deletingSessionId === session.sessionId ? 'Click again to confirm' : 'Delete session'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 border-t border-brand-border/50 pt-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                          <span className="text-brand-text-muted">{session.turnsCount} {session.turnsCount === 1 ? 'turn' : 'turns'}</span>
                        </div>
                        {session.totalCost > 0 && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
                              <line x1="12" y1="1" x2="12" y2="23"/>
                              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                            <span className="text-brand-text-muted">${session.totalCost.toFixed(4)}</span>
                          </div>
                        )}
                        <div className="ml-auto flex items-center gap-1.5 text-xs text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>Click to load</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Debug Tab
            <div className="space-y-6">
              {/* Current Session */}
              {currentSessionInfo && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-brand-text flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    Current Session (This Conversation)
                  </h3>
                  <div className="rounded-xl border-2 border-brand-purple/50 bg-brand-purple/5 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-brand-text-dim mb-1">App Session ID</p>
                        <p className="font-mono text-xs text-brand-text break-all">{currentSessionInfo.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-text-dim mb-1">SDK Session ID</p>
                        <p className="font-mono text-xs text-brand-text break-all">
                          {currentSessionInfo.sdkSessionId || <span className="text-brand-text-dim italic">Not yet assigned</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-text-dim mb-1">Working Directory</p>
                        <p className="font-mono text-xs text-brand-text-muted truncate" title={currentSessionInfo.workingDirectory}>
                          {currentSessionInfo.workingDirectory}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-text-dim mb-1">Created At</p>
                        <p className="text-xs text-brand-text-muted">{formatDateDetailed(currentSessionInfo.createdAt)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-brand-text-dim mb-1">Allowed Tools</p>
                        <div className="flex flex-wrap gap-1">
                          {currentSessionInfo.allowedTools.map(tool => (
                            <span key={tool} className="rounded bg-brand-purple/20 px-2 py-0.5 text-[10px] font-mono text-brand-purple">
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* All Active Sessions */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-brand-text">
                  Active In-Memory Sessions ({activeSessions.length})
                </h3>
                {activeSessions.length === 0 ? (
                  <div className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 text-center text-sm text-brand-text-dim">
                    No active sessions
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`rounded-lg border p-3 ${
                          session.id === currentSessionId
                            ? 'border-brand-purple/50 bg-brand-purple/5'
                            : 'border-brand-border bg-brand-bg/50'
                        }`}
                      >
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-brand-text-dim mb-0.5">Session ID</p>
                            <p className="font-mono text-brand-text truncate" title={session.id}>
                              {session.id}
                              {session.id === currentSessionId && (
                                <span className="ml-2 text-[10px] text-brand-purple">(current)</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-brand-text-dim mb-0.5">SDK ID</p>
                            <p className="font-mono text-brand-text-muted truncate" title={session.sdkSessionId || ''}>
                              {session.sdkSessionId || <span className="italic">pending</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-brand-text-dim mb-0.5">Created</p>
                            <p className="text-brand-text-muted">{formatDateDetailed(session.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Sessions */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-brand-text">
                  Saved Sessions on Disk ({sessions.length})
                </h3>
                {!workingDirectory ? (
                  <div className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 text-center text-sm text-brand-text-dim">
                    No working directory selected
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 text-center">
                    <p className="text-sm text-brand-text-dim mb-1">No saved sessions yet</p>
                    <p className="text-xs text-brand-text-dim">
                      Sessions are saved to: <code className="font-mono bg-brand-border/30 px-1 rounded">.conntext/sessions/</code>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className="rounded-lg border border-brand-border bg-brand-bg/50 p-3"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-brand-text mb-1">{session.title}</p>
                            <p className="text-xs text-brand-text-dim">
                              {formatDate(session.timestamp)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-brand-text-muted">{session.turnsCount} turns</p>
                            {session.totalCost > 0 && (
                              <p className="text-xs text-brand-text-dim">${session.totalCost.toFixed(4)}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!workingDirectory) return
                            const sessionsDir = session.projectId
                              ? `${workingDirectory}/.conntext/sessions/${session.projectId}`
                              : `${workingDirectory}/.conntext/sessions`
                            window.api.openPath(`${sessionsDir}/${session.sessionId}.json`)
                          }}
                          className="cursor-pointer font-mono text-[10px] text-brand-text-dim hover:text-brand-purple transition-colors truncate block text-left"
                          title="Open session JSON file"
                        >
                          {session.sessionId}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Storage Info */}
              {workingDirectory && (
                <div className="rounded-lg border border-brand-border/50 bg-brand-card/30 p-4">
                  <h4 className="text-xs font-semibold text-brand-text mb-2">Storage Location</h4>
                  <p className="font-mono text-xs text-brand-text-muted break-all">
                    {workingDirectory}/.conntext/sessions/
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
