import { useState } from 'react'

interface LoginScreenProps {
  onAuthenticated: () => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [apiUrl, setApiUrl] = useState('https://conntext.test')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          device_name: 'ConnText Build'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed')
      }

      await window.api.saveCredentials({
        apiUrl,
        apiToken: data.token,
        user: data.user
      })

      onAuthenticated()
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Unable to connect. Check the server URL and try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Connection failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center bg-brand-bg">
      {/* Ambient purple glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-ambient-pulse absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
      </div>

      {/* Login card */}
      <div
        className="animate-fade-in-up relative z-10 w-full max-w-[380px] px-6"
        style={{ animationDelay: '0.1s', opacity: 0, animationFillMode: 'forwards' }}
      >
        {/* Brand header */}
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-purple/15">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#8b5cf6" />
              </svg>
            </div>
            <span className="text-xl font-semibold tracking-tight text-brand-text">
              ConnText <span className="font-normal text-brand-text-muted">Build</span>
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-brand-text-dim">
            Sign in to your workspace to start building
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-brand-border bg-brand-card/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 text-[14px] text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
              />
            </div>

            {/* Password field */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 pr-10 text-[14px] text-brand-text placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-brand-text-dim transition-colors hover:text-brand-text-muted"
                  tabIndex={-1}
                >
                  {showPassword ? (
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
            </div>

            {/* Error message */}
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

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="group relative w-full cursor-pointer overflow-hidden rounded-lg bg-brand-purple px-4 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-brand-purple-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className={`inline-flex items-center gap-2 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
                Sign in
              </span>
              {isLoading && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              )}
            </button>
          </form>

          {/* Advanced settings toggle */}
          <div className="mt-4 border-t border-brand-border-subtle pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full cursor-pointer items-center justify-between text-[12px] text-brand-text-dim transition-colors hover:text-brand-text-muted"
            >
              <span>Server settings</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="animate-fade-in mt-3">
                <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-brand-text-dim">
                  API URL
                </label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://conntext.test"
                  required
                  className="w-full rounded-lg border border-brand-input-border bg-brand-input px-3.5 py-2.5 text-[13px] font-mono text-brand-text-muted placeholder-brand-text-dim/60 outline-none transition-all duration-200 focus:border-brand-input-focus focus:ring-1 focus:ring-brand-input-focus/30"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-brand-text-dim/60">
          ConnText Build v0.1.0
        </p>
      </div>
    </div>
  )
}
