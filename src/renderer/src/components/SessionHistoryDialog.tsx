import { useEffect, useRef, useState } from 'react'
import type { SessionMetadata } from '../../../preload/index.d'

interface SessionHistoryDialogProps {
  isOpen: boolean
  onClose: () => void
  onLoadSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  sessions: SessionMetadata[]
  workingDirectory: string | null
}

export function SessionHistoryDialog({
  isOpen,
  onClose,
  onLoadSession,
  onDeleteSession,
  sessions,
  workingDirectory
}: SessionHistoryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

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

  if (!isOpen) return null

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

  const formatDuration = (start: number, end: number | null) => {
    if (!end) return 'Incomplete'
    const durationMs = end - start
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    if (minutes === 0) return `${seconds}s`
    return `${minutes}m ${seconds}s`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="relative w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/15 text-brand-purple ring-1 ring-brand-purple/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Session History</h2>
              <p className="text-xs text-brand-text-dim">
                {workingDirectory ? `${sessions.length} saved sessions` : 'No project selected'}
              </p>
            </div>
          </div>
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

        {/* Content */}
        <div className="overflow-y-auto overflow-x-hidden p-6" style={{ maxHeight: 'calc(80vh - 80px)' }}>
          {sessions.length === 0 ? (
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
          )}
        </div>
      </div>
    </div>
  )
}
