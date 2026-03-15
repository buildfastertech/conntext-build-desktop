import { useEffect, useRef, useState } from 'react'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Claude Code path state
  const [claudeCodePath, setClaudeCodePath] = useState('')
  const [hasExistingPath, setHasExistingPath] = useState(false)
  const [isEditingPath, setIsEditingPath] = useState(false)
  const [pathSaveStatus, setPathSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Session sync state
  const [sessionSyncEnabled, setSessionSyncEnabled] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Load current key status
      window.api.getAnthropicKey().then((key) => {
        setHasExistingKey(!!key)
        if (key) {
          // Show masked version
          setAnthropicKey(key.slice(0, 10) + '...' + key.slice(-4))
        } else {
          setAnthropicKey('')
        }
        setShowKey(false)
        setSaveStatus('idle')
      })

      // Load Claude Code path
      window.api.getClaudeCodePath().then((path) => {
        setHasExistingPath(!!path)
        setClaudeCodePath(path || '')
        setIsEditingPath(false)
        setPathSaveStatus('idle')
      })

      // Load session sync setting
      window.api.getSessionSyncEnabled().then(setSessionSyncEnabled)
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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

  const handleSaveKey = async () => {
    const trimmed = anthropicKey.trim()
    if (!trimmed || trimmed.includes('...')) return

    if (!trimmed.startsWith('sk-ant-')) {
      setSaveStatus('error')
      return
    }

    setIsSaving(true)
    setSaveStatus('idle')

    try {
      await window.api.saveAnthropicKey(trimmed)
      setHasExistingKey(true)
      setAnthropicKey(trimmed.slice(0, 10) + '...' + trimmed.slice(-4))
      setShowKey(false)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearKey = async () => {
    await window.api.clearAnthropicKey()
    setAnthropicKey('')
    setHasExistingKey(false)
    setSaveStatus('idle')
  }

  const handleEditKey = () => {
    setAnthropicKey('')
    setShowKey(false)
    setSaveStatus('idle')
  }

  const handleSavePath = async () => {
    const trimmed = claudeCodePath.trim()
    if (!trimmed) return

    setPathSaveStatus('idle')

    try {
      await window.api.saveClaudeCodePath(trimmed)
      setHasExistingPath(true)
      setIsEditingPath(false)
      setPathSaveStatus('success')
      setTimeout(() => setPathSaveStatus('idle'), 2000)
    } catch {
      setPathSaveStatus('error')
    }
  }

  const handleClearPath = async () => {
    await window.api.clearClaudeCodePath()
    setClaudeCodePath('')
    setHasExistingPath(false)
    setIsEditingPath(false)
    setPathSaveStatus('idle')
  }

  const handleBrowsePath = async () => {
    const path = await window.api.selectFile()
    if (path) {
      setClaudeCodePath(path)
      setIsEditingPath(true)
      setPathSaveStatus('idle')
    }
  }

  const handleEditPath = () => {
    setIsEditingPath(true)
    setPathSaveStatus('idle')
  }

  if (!isOpen) return null

  const isEditingNew = !hasExistingKey || !anthropicKey.includes('...')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="animate-fade-in-up w-full max-w-[480px] rounded-xl border border-brand-border bg-brand-card shadow-2xl shadow-black/50"
        style={{ animationDuration: '0.2s' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-purple/15">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-brand-text">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-brand-text-dim transition-colors hover:bg-brand-border/30 hover:text-brand-text-muted"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {/* Anthropic API Key */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                Anthropic API Key
              </label>
              {hasExistingKey && !isEditingNew && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-brand-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-success" />
                    Connected
                  </span>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value)
                  setSaveStatus('idle')
                }}
                placeholder="sk-ant-..."
                disabled={hasExistingKey && !isEditingNew}
                className="w-full rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 pr-10 font-mono text-[13px] text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-brand-text-dim transition-colors hover:text-brand-text-muted"
                tabIndex={-1}
              >
                {showKey ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-brand-text-dim/80">
              Get your key from{' '}
              <span className="text-brand-purple-soft">console.anthropic.com/settings/keys</span>
              . Stored encrypted on your machine.
            </p>

            {/* Status messages */}
            {saveStatus === 'success' && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-brand-success">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                API key saved successfully
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-brand-error">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Invalid key format. Keys start with sk-ant-
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex items-center gap-2">
              {isEditingNew ? (
                <>
                  <button
                    onClick={handleSaveKey}
                    disabled={isSaving || !anthropicKey.trim()}
                    className="cursor-pointer rounded-lg bg-brand-purple px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-purple-dim disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving ? 'Saving...' : 'Save Key'}
                  </button>
                  {hasExistingKey && (
                    <button
                      onClick={() => {
                        // Cancel edit, restore masked key
                        window.api.getAnthropicKey().then((key) => {
                          if (key) setAnthropicKey(key.slice(0, 10) + '...' + key.slice(-4))
                        })
                        setSaveStatus('idle')
                      }}
                      className="cursor-pointer rounded-lg border border-brand-border px-3.5 py-2 text-[13px] text-brand-text-muted transition-colors hover:bg-brand-border/20"
                    >
                      Cancel
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleEditKey}
                    className="cursor-pointer rounded-lg border border-brand-border px-3.5 py-2 text-[13px] text-brand-text-muted transition-colors hover:bg-brand-border/20 hover:text-brand-text"
                  >
                    Change Key
                  </button>
                  <button
                    onClick={handleClearKey}
                    className="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] text-brand-error/80 transition-colors hover:bg-brand-error/10 hover:text-brand-error"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-brand-border" />

          {/* Claude Code Path */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                Claude Code Path
              </label>
              {hasExistingPath && !isEditingPath && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-brand-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-success" />
                    Configured
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={claudeCodePath}
                onChange={(e) => {
                  setClaudeCodePath(e.target.value)
                  setPathSaveStatus('idle')
                }}
                placeholder="Auto-detect (or specify custom path)"
                disabled={hasExistingPath && !isEditingPath}
                className="flex-1 rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 font-mono text-[13px] text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30 disabled:opacity-60"
              />
              {(isEditingPath || !hasExistingPath) && (
                <button
                  type="button"
                  onClick={handleBrowsePath}
                  className="cursor-pointer rounded-lg border border-brand-border px-3.5 py-2.5 text-[13px] text-brand-text-muted transition-colors hover:bg-brand-border/20 hover:text-brand-text"
                  title="Browse for executable"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              )}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-brand-text-dim/80">
              Leave empty to auto-detect. Set a custom path if Claude Code is installed in a non-standard location.
            </p>

            {/* Status messages */}
            {pathSaveStatus === 'success' && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-brand-success">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Path saved successfully
              </div>
            )}
            {pathSaveStatus === 'error' && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-brand-error">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Failed to save path
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex items-center gap-2">
              {isEditingPath || !hasExistingPath ? (
                <>
                  <button
                    onClick={handleSavePath}
                    disabled={!claudeCodePath.trim()}
                    className="cursor-pointer rounded-lg bg-brand-purple px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-purple-dim disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save Path
                  </button>
                  {hasExistingPath && (
                    <button
                      onClick={() => {
                        window.api.getClaudeCodePath().then((path) => {
                          setClaudeCodePath(path || '')
                          setIsEditingPath(false)
                        })
                        setPathSaveStatus('idle')
                      }}
                      className="cursor-pointer rounded-lg border border-brand-border px-3.5 py-2 text-[13px] text-brand-text-muted transition-colors hover:bg-brand-border/20"
                    >
                      Cancel
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleEditPath}
                    className="cursor-pointer rounded-lg border border-brand-border px-3.5 py-2 text-[13px] text-brand-text-muted transition-colors hover:bg-brand-border/20 hover:text-brand-text"
                  >
                    Change Path
                  </button>
                  <button
                    onClick={handleClearPath}
                    className="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] text-brand-error/80 transition-colors hover:bg-brand-error/10 hover:text-brand-error"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-brand-border" />

          {/* Session Sync */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                  Session Sync
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-brand-text-dim/80">
                  Sync session data to the ConnText platform when a project is selected.
                </p>
              </div>
              <button
                onClick={async () => {
                  const next = !sessionSyncEnabled
                  setSessionSyncEnabled(next)
                  await window.api.setSessionSyncEnabled(next)
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
                  sessionSyncEnabled ? 'bg-brand-purple' : 'bg-brand-border'
                }`}
                role="switch"
                aria-checked={sessionSyncEnabled}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    sessionSyncEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-brand-border px-5 py-3">
          <p className="text-[11px] text-brand-text-dim/60">ConnText Build v0.1.0</p>
        </div>
      </div>
    </div>
  )
}
