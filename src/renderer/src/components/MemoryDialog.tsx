import { useEffect, useRef } from 'react'

interface MemoryDialogProps {
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
  memories: string[]
  workingDirectory: string | null
}

export function MemoryDialog({ isOpen, onClose, onRefresh, memories, workingDirectory }: MemoryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple/15 text-brand-purple ring-1 ring-brand-purple/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-text">Memory</h2>
              <p className="text-xs text-brand-text-dim">
                {workingDirectory ? `${workingDirectory}/MEMORY.md` : 'No project selected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-text-muted transition-colors hover:bg-brand-border/30 hover:text-brand-text"
                title="Refresh memory"
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

        {/* Content */}
        <div className="overflow-y-auto overflow-x-hidden p-6" style={{ maxHeight: 'calc(80vh - 80px)' }}>
          {memories.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-3 text-4xl opacity-50">🧠</div>
              <p className="text-sm text-brand-text-muted">No memories stored yet</p>
              <p className="mt-2 text-xs text-brand-text-dim">
                Use <span className="rounded bg-brand-border px-1.5 py-0.5 font-mono text-brand-purple">/init</span> to create MEMORY.md
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-brand-border bg-brand-bg/50 p-4 transition-colors hover:border-brand-border-subtle"
                >
                  <div className="prose-response text-sm text-brand-text">
                    <div className="whitespace-pre-wrap">{memory}</div>
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
