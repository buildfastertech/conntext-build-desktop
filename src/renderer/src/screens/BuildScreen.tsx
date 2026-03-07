import { useState, useRef, useEffect, useCallback } from 'react'
import type { StreamEvent } from '../../../preload/index.d'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolEvents?: ToolEvent[]
  timestamp: Date
}

interface ToolEvent {
  type: 'tool_use' | 'tool_result'
  tool?: string
  input?: Record<string, unknown>
  output?: string
}

interface BuildScreenProps {
  onLogout: () => void
}

export function BuildScreen({ onLogout }: BuildScreenProps) {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingToolEvents, setStreamingToolEvents] = useState<ToolEvent[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Refs to capture latest streaming state for use in async callbacks
  const streamingContentRef = useRef('')
  const streamingToolEventsRef = useRef<ToolEvent[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, streamingToolEvents])

  // Listen for stream events from the main process
  useEffect(() => {
    const unsubscribe = window.api.onStreamEvent((event: StreamEvent) => {
      switch (event.event) {
        case 'text':
          setStreamingContent((prev) => {
            const next = prev + (event.data.text as string)
            streamingContentRef.current = next
            return next
          })
          break
        case 'tool_use': {
          const te: ToolEvent = {
            type: 'tool_use',
            tool: event.data.tool as string,
            input: event.data.input as Record<string, unknown>
          }
          setStreamingToolEvents((prev) => {
            const next = [...prev, te]
            streamingToolEventsRef.current = next
            return next
          })
          break
        }
        case 'tool_result': {
          const tr: ToolEvent = { type: 'tool_result', output: event.data.output as string }
          setStreamingToolEvents((prev) => {
            const next = [...prev, tr]
            streamingToolEventsRef.current = next
            return next
          })
        }
          break
        case 'done':
          setSessionId(event.data.sessionId as string)
          break
        case 'error':
          setStreamingContent(
            (prev) => prev + `\n\n**Error:** ${event.data.error as string}`
          )
          break
      }
    })

    return unsubscribe
  }, [])

  const handleSelectFolder = async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setWorkingDirectory(folder)
      setMessages([])
      setSessionId(null)
    }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || !workingDirectory || isStreaming) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')
    setStreamingToolEvents([])
    streamingContentRef.current = ''
    streamingToolEventsRef.current = []

    try {
      const result = await window.api.sendMessage({
        content: userMessage.content,
        workingDirectory,
        sessionId: sessionId ?? undefined
      })

      // Stream finished — finalize the assistant message using refs for latest values
      const finalContent = streamingContentRef.current
      const finalToolEvents = streamingToolEventsRef.current

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: finalContent,
          toolEvents: finalToolEvents.length > 0 ? finalToolEvents : undefined,
          timestamp: new Date()
        }
      ])

      if (result.sessionId) {
        setSessionId(result.sessionId)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Failed to send message. Please try again.',
          timestamp: new Date()
        }
      ])
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setStreamingToolEvents([])
      streamingContentRef.current = ''
      streamingToolEventsRef.current = []
    }
  }, [input, workingDirectory, isStreaming, sessionId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Folder selection screen
  if (!workingDirectory) {
    return (
      <div className="flex h-screen flex-col bg-brand-bg">
        <Header onLogout={onLogout} workingDirectory={null} onSelectFolder={handleSelectFolder} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-4xl">📁</div>
            <h2 className="mb-2 text-lg font-semibold text-brand-text">
              Select a project folder
            </h2>
            <p className="mb-6 text-sm text-brand-text-muted">
              Choose the folder where the agent will read and write code.
            </p>
            <button
              onClick={handleSelectFolder}
              className="cursor-pointer rounded-lg bg-brand-purple px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-purple-dim"
            >
              Choose Folder
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-brand-bg">
      <Header
        onLogout={onLogout}
        workingDirectory={workingDirectory}
        onSelectFolder={handleSelectFolder}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="py-20 text-center">
              <h2 className="mb-2 text-lg font-semibold text-brand-text">
                Start building
              </h2>
              <p className="text-sm text-brand-text-muted">
                Send a message to begin working in{' '}
                <span className="text-brand-purple">{workingDirectory}</span>
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming content */}
          {isStreaming && (
            <div className="rounded-lg border border-brand-border bg-brand-card p-4">
              {streamingToolEvents.length > 0 && (
                <div className="mb-3 space-y-1">
                  {streamingToolEvents.map((te, i) => (
                    <ToolEventLine key={i} event={te} />
                  ))}
                </div>
              )}
              {streamingContent ? (
                <div className="whitespace-pre-wrap text-sm text-brand-text">
                  {streamingContent}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-brand-text-muted">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-purple" />
                  Agent is working...
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-brand-border px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-brand-input-border bg-brand-input px-3 py-2.5 text-sm text-brand-text placeholder-brand-text-dim outline-none transition-colors focus:border-brand-purple disabled:opacity-50"
            style={{ maxHeight: '150px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 150)}px`
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="cursor-pointer rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-purple-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Sub-components =====

function Header({
  onLogout,
  workingDirectory,
  onSelectFolder
}: {
  onLogout: () => void
  workingDirectory: string | null
  onSelectFolder: () => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-brand-border px-4 py-2.5"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="text-sm font-semibold text-brand-purple">ConnText Build</span>
        {workingDirectory && (
          <button
            onClick={onSelectFolder}
            className="cursor-pointer rounded bg-brand-card px-2 py-1 text-xs text-brand-text-muted transition-colors hover:text-brand-text"
            title="Change folder"
          >
            {workingDirectory.split(/[/\\]/).slice(-2).join('/')}
          </button>
        )}
      </div>
      <button
        onClick={onLogout}
        className="cursor-pointer text-xs text-brand-text-dim transition-colors hover:text-brand-text-muted"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        Disconnect
      </button>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? 'bg-brand-purple text-white'
            : 'border border-brand-border bg-brand-card text-brand-text'
        }`}
      >
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolEvents.map((te, i) => (
              <ToolEventLine key={i} event={te} />
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  )
}

function ToolEventLine({ event }: { event: ToolEvent }) {
  if (event.type === 'tool_use') {
    const detail = getToolDetail(event.tool, event.input)
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-brand-purple">⚡</span>
        <span className="font-mono text-brand-text-muted">{event.tool}</span>
        {detail && (
          <span className="truncate font-mono text-brand-text-dim">{detail}</span>
        )}
      </div>
    )
  }

  if (event.type === 'tool_result') {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-brand-success">✓</span>
        <span className="text-brand-text-dim">Done</span>
      </div>
    )
  }

  return null
}

function getToolDetail(tool?: string, input?: Record<string, unknown>): string | null {
  if (!tool || !input) return null

  switch (tool) {
    case 'Read':
      return input.file_path as string || null
    case 'Write':
      return input.file_path as string || null
    case 'Edit':
      return input.file_path as string || null
    case 'Bash':
      return input.command as string || null
    case 'Glob':
      return input.pattern as string || null
    case 'Grep':
      return input.pattern as string || null
    default:
      return null
  }
}
