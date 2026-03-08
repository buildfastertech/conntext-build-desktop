import { useEffect, useRef, useState } from 'react'
import type { SessionMetadata, ActiveSessionInfo } from '../../../preload/index.d'

interface SessionDebugPanelProps {
  isOpen: boolean
  onClose: () => void
  workingDirectory: string | null
  currentSessionId: string | null
}

export function SessionDebugPanel({
  isOpen,
  onClose,
  workingDirectory,
  currentSessionId
}: SessionDebugPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([])
  const [savedSessions, setSavedSessions] = useState<SessionMetadata[]>([])
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

  // Load session data
  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      // Load active sessions
      const active = await window.api.listActiveSessions()
      console.log('[Debug Panel] Loaded', active.length, 'active sessions')
      setActiveSessions(active)

      // Load current session info
      if (currentSessionId) {
        const info = await window.api.getSessionInfo(currentSessionId)
        console.log('[Debug Panel] Loaded current session info for:', currentSessionId)
        setCurrentSessionInfo(info)
      }

      // Load saved sessions
      if (workingDirectory) {
        const saved = await window.api.listSessions(workingDirectory)
        console.log('[Debug Panel] Loaded', saved.length, 'saved sessions')
        setSavedSessions(saved)
      }
    }

    loadData()
  }, [isOpen, workingDirectory, currentSessionId, refreshKey])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  if (!isOpen) return null

  const formatDate = (date: Date | string | number) => {
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="relative flex flex-col w-full max-w-5xl h-[85vh] overflow-hidden rounded-2xl border-2 border-brand-purple/30 bg-brand-card-elevated shadow-2xl ring-1 ring-brand-purple/10"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between border-b border-brand-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/15 text-brand-purple ring-1 ring-brand-purple/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Session Debug Panel</h2>
              <p className="text-xs text-brand-text-dim">
                Active & Saved Sessions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-text-muted transition-colors hover:bg-brand-border/30 hover:text-brand-text"
              title="Refresh"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </button>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
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
                      <p className="text-xs text-brand-text-muted">{formatDate(currentSessionInfo.createdAt)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-brand-text-dim mb-1">Allowed Tools</p>
                      <div className="flex flex-wrap gap-1">
                        {(currentSessionInfo.allowedTools || []).map(tool => (
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
                          <p className="text-brand-text-muted">{formatDate(session.createdAt)}</p>
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
                Saved Sessions on Disk ({savedSessions.length})
              </h3>
              {!workingDirectory ? (
                <div className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 text-center text-sm text-brand-text-dim">
                  No working directory selected
                </div>
              ) : savedSessions.length === 0 ? (
                <div className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 text-center">
                  <p className="text-sm text-brand-text-dim mb-1">No saved sessions yet</p>
                  <p className="text-xs text-brand-text-dim">
                    Sessions are saved to: <code className="font-mono bg-brand-border/30 px-1 rounded">.conntext/sessions/</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedSessions.map((session) => (
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
                      <p className="font-mono text-[10px] text-brand-text-dim truncate" title={session.sessionId}>
                        {session.sessionId}
                      </p>
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
        </div>
      </div>
    </div>
  )
}
