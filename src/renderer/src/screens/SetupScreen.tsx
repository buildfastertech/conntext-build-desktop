import { useState } from 'react'
import type { UserInfo, Workspace } from '../../../preload/index.d'
import { AppHeader } from '../components/AppHeader'

interface SetupScreenProps {
  onComplete: () => void
  onBack: () => void
  userName: string
  user?: UserInfo | null
  workspaces?: Workspace[]
  activeWorkspace?: Workspace | null
  onSwitchWorkspace?: (workspace: Workspace) => void
}

export function SetupScreen({ onComplete, onBack, userName, user, workspaces = [], activeWorkspace, onSwitchWorkspace }: SetupScreenProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedKey = apiKey.trim()

    if (trimmedKey) {
      if (!trimmedKey.startsWith('sk-ant-')) {
        setError('Invalid key format. Anthropic keys start with sk-ant-')
        return
      }

      setIsLoading(true)

      try {
        await window.api.saveAnthropicKey(trimmedKey)
        onComplete()
      } catch {
        setError('Failed to save API key')
      } finally {
        setIsLoading(false)
      }
    } else {
      await window.api.clearAnthropicKey()
      onComplete()
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-brand-bg">
      <AppHeader
        user={user ?? null}
        onLogout={onBack}
        variant="projects"
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSwitchWorkspace={onSwitchWorkspace}
      />
      <div className="flex flex-1 items-center justify-center">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-ambient-pulse absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
      </div>

      <div
        className="animate-fade-in-up relative z-10 w-full max-w-[420px] px-6"
        style={{ animationDelay: '0.1s', opacity: 0, animationFillMode: 'forwards' }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-1 text-sm text-brand-text-muted">
            Welcome, <span className="text-brand-text-secondary">{userName}</span>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-brand-text">Connect your AI</h1>
          <p className="text-[13px] leading-relaxed text-brand-text-dim">
            ConnText Build uses Claude to write code locally on your machine.
            An Anthropic API key is optional but recommended for full functionality.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-brand-border bg-brand-card/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                Anthropic API Key <span className="normal-case font-normal text-brand-text-dim/60">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoFocus
                  className="w-full rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 pr-10 font-mono text-[13px] text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-brand-text-dim transition-colors hover:text-brand-text-muted"
                  tabIndex={-1}
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-text-dim/80">
                Get your key from{' '}
                <span className="text-brand-purple-soft">console.anthropic.com/settings/keys</span>
                . It's stored encrypted on your machine.
              </p>
            </div>

            {error && (
              <div className="animate-fade-in flex items-start gap-2 rounded-lg border border-brand-error/20 bg-brand-error/5 px-3 py-2.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p className="text-[13px] leading-snug text-brand-error">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full cursor-pointer rounded-lg bg-brand-purple px-4 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-brand-purple-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? 'Saving...' : apiKey.trim() ? 'Continue' : 'Skip for now'}
            </button>
          </form>

          <div className="mt-4 border-t border-brand-border-subtle pt-3">
            <button
              type="button"
              onClick={onBack}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 text-[12px] text-brand-text-dim transition-colors hover:text-brand-text-muted"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
