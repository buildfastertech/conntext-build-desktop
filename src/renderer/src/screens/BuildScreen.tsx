import { useState, useRef, useEffect, useCallback, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderOpen, Pencil, Check, X, ChevronDown, RefreshCw, AlertCircle, Layers, Blocks, Lightbulb, Users, Heart, TrendingUp, DollarSign, Cpu, Palette, Link2, Cog, MessageSquare, Hammer } from 'lucide-react'
import type { StreamEvent, UserInfo, SessionMetadata, Turn, ToolEvent, Workspace, UserQuestion, Project, ProjectFeature } from '../../../preload/index.d'
import { ResizablePanes } from '../components/ResizablePanes'
import { MemoryDialog } from '../components/MemoryDialog'
import { SettingsDialog } from '../components/SettingsDialog'
import { AppHeader } from '../components/AppHeader'
import { FilePreviewDialog } from '../components/FilePreviewDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { FolderSelector } from '../components/FolderSelector'

const AVAILABLE_MODELS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', description: 'Fast & capable' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Latest Sonnet' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest' },
]

interface BuildScreenProps {
  user: UserInfo | null
  onLogout: () => void
  workingDirectory: string | null
  selectedProject?: Project | null
  onBackToProjects: () => void
  onWorkingDirectoryChange?: (dir: string) => void
  workspaces?: Workspace[]
  activeWorkspace?: Workspace | null
  onSwitchWorkspace?: (workspace: Workspace) => void
}

export function BuildScreen({ user, onLogout, workingDirectory: initialWorkingDirectory, selectedProject, onBackToProjects: onBackToProjectsFromParent, onWorkingDirectoryChange, workspaces = [], activeWorkspace: activeWorkspaceProp, onSwitchWorkspace: onSwitchWorkspaceProp }: BuildScreenProps) {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(initialWorkingDirectory)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [pastedImages, setPastedImages] = useState<Array<{ data: string; mediaType: string }>>([])
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sdkSessionId, setSdkSessionId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false)
  const [memories, setMemories] = useState<string[]>([])
  const [memoryExists, setMemoryExists] = useState(false)
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('')
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [recentDirectories, setRecentDirectories] = useState<string[]>([])
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [pendingQuestions, setPendingQuestions] = useState<UserQuestion[]>([])
  const projectId = selectedProject?.id
  const [activeFolders, setActiveFolders] = useState<string[]>(() => {
    if (!projectId) return []
    try { return JSON.parse(localStorage.getItem(`activeFolders:${projectId}`) || '[]') } catch { return [] }
  })
  const [chosenFolders, setChosenFolders] = useState<string[]>(() => {
    if (!projectId) return []
    try { return JSON.parse(localStorage.getItem(`chosenFolders:${projectId}`) || '[]') } catch { return [] }
  })

  // Sync working directory prop with local state (only when parent sets a non-null value)
  useEffect(() => {
    if (initialWorkingDirectory !== null) {
      setWorkingDirectory(initialWorkingDirectory)
    }
  }, [initialWorkingDirectory])
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [queuedMessages, setQueuedMessages] = useState<Array<{ content: string; images?: Array<{ data: string; mediaType: string }> }>>([])
  const [visibleTurnCount, setVisibleTurnCount] = useState(6)
  const [contextTokens, setContextTokens] = useState(0)
  const [isCompacting, setIsCompacting] = useState(false)
  const [skillsCount, setSkillsCount] = useState(0)
  const [skillsVersion, setSkillsVersion] = useState(0)
  const [skillsLastSync, setSkillsLastSync] = useState<string | null>(null)
  const [isSyncingSkills, setIsSyncingSkills] = useState(false)
  const [syncSkillsMessage, setSyncSkillsMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selectedModel') || 'claude-sonnet-4-5-20250929')
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const selectedModelRef = useRef(localStorage.getItem('selectedModel') || 'claude-sonnet-4-5-20250929')
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([])
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [projectFeatures, setProjectFeatures] = useState<ProjectFeature[]>([])
  const [isFeaturesLoading, setIsFeaturesLoading] = useState(false)
  const [featuresError, setFeaturesError] = useState<string | null>(null)
  const activeTurnIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isStreamingRef = useRef<boolean>(false)
  const turnsRef = useRef<Turn[]>([])
  const isProcessingQueueRef = useRef<boolean>(false)
  const queuedMessagesRef = useRef<Array<{ content: string; images?: Array<{ data: string; mediaType: string }> }>>([])
  const sessionIdRef = useRef<string | null>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const workingDirectoryRef = useRef<string | null>(null)
  const projectIdRef = useRef<string | null>(projectId ?? null)
  const currentSessionTitleRef = useRef<string>('')

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const userHasScrolledUpRef = useRef(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'instant') => {
    if (userHasScrolledUpRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  // Detect if user has scrolled up (to stop auto-scroll)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      // If user is within 150px of bottom, consider them "at bottom"
      userHasScrolledUpRef.current = distanceFromBottom > 150
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [turns])

  // Estimate context tokens from turns (~4 chars per token)
  useEffect(() => {
    let charCount = 0
    for (const turn of turns) {
      charCount += turn.userMessage.length
      for (const block of turn.textBlocks) charCount += block.length
      for (const evt of turn.toolEvents) {
        if (evt.output) charCount += evt.output.length
        if (evt.input) charCount += JSON.stringify(evt.input).length
      }
    }
    setContextTokens(Math.round(charCount / 4))
  }, [turns])

  // Keep turnsRef in sync with turns state
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  // Keep queuedMessagesRef in sync with queuedMessages state
  useEffect(() => {
    queuedMessagesRef.current = queuedMessages
  }, [queuedMessages])

  // Keep sessionIdRef in sync with sessionId state
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Keep sdkSessionIdRef in sync with sdkSessionId state
  useEffect(() => {
    sdkSessionIdRef.current = sdkSessionId
  }, [sdkSessionId])

  // Keep workingDirectoryRef in sync with workingDirectory state
  useEffect(() => {
    workingDirectoryRef.current = workingDirectory
  }, [workingDirectory])

  // Keep projectIdRef in sync with projectId
  useEffect(() => {
    projectIdRef.current = projectId ?? null
  }, [projectId])

  // Keep currentSessionTitleRef in sync with currentSessionTitle state
  useEffect(() => {
    currentSessionTitleRef.current = currentSessionTitle
  }, [currentSessionTitle])

  // Keep selectedModelRef in sync and persist to localStorage
  useEffect(() => {
    selectedModelRef.current = selectedModel
    localStorage.setItem('selectedModel', selectedModel)
  }, [selectedModel])

  // Persist folder selections to localStorage (scoped per project)
  useEffect(() => {
    if (projectId) localStorage.setItem(`activeFolders:${projectId}`, JSON.stringify(activeFolders))
  }, [activeFolders, projectId])

  useEffect(() => {
    if (projectId) localStorage.setItem(`chosenFolders:${projectId}`, JSON.stringify(chosenFolders))
  }, [chosenFolders, projectId])

  // Reset session and folder state when project changes
  // Clear old session immediately to prevent auto-save from writing stale data under the new projectId
  const prevProjectIdRef = useRef<string | undefined>(projectId)
  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return
    prevProjectIdRef.current = projectId

    // Clear session state so old session doesn't leak into the new project
    setTurns([])
    setSessionId(null)
    setSdkSessionId(null)
    setCurrentSessionTitle('')
    setSessions([])
    setContextTokens(0)
    activeTurnIdRef.current = null
    sessionIdRef.current = null
    sdkSessionIdRef.current = null
    currentSessionTitleRef.current = ''
    turnsRef.current = []
    localStorage.removeItem('activeTurnId')

    // Reset folder selections for the new project
    if (projectId) {
      try { setActiveFolders(JSON.parse(localStorage.getItem(`activeFolders:${projectId}`) || '[]')) } catch { setActiveFolders([]) }
      try { setChosenFolders(JSON.parse(localStorage.getItem(`chosenFolders:${projectId}`) || '[]')) } catch { setChosenFolders([]) }
    } else {
      setActiveFolders([])
      setChosenFolders([])
    }

    // Load sessions for the new project and auto-load the last session
    if (workingDirectory && projectId) {
      loadSessions(workingDirectory).then(async () => {
        try {
          const lastSessionId = await window.api.getProjectLastSessionId(projectId)
          if (lastSessionId) {
            handleLoadSession(lastSessionId)
          }
        } catch (err) {
          console.warn('[BuildScreen] Failed to auto-load last project session:', err)
        }
      })
    } else if (workingDirectory) {
      loadSessions(workingDirectory)
    }
  }, [projectId])

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isActionMenuOpen) {
        const target = e.target as HTMLElement
        if (!target.closest('.action-menu-container')) {
          setIsActionMenuOpen(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isActionMenuOpen])

  // Close model dropdown when clicking outside
  useEffect(() => {
    if (!isModelDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.model-dropdown-container')) {
        setIsModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isModelDropdownOpen])

  // Load last app state on mount
  useEffect(() => {
    const restoreLastState = async () => {
      try {
        const appState = await window.api.getAppState()
        setRecentDirectories(appState.recentDirectories || [])
        if (appState.lastWorkingDirectory) {
          // Determine the session to restore: prefer per-project session, fall back to global
          const currentProjectId = projectIdRef.current
          let sessionToRestore = appState.lastSessionId
          if (currentProjectId && appState.projectLastSessionIds?.[currentProjectId]) {
            sessionToRestore = appState.projectLastSessionIds[currentProjectId]
          }
          // If there's a last session, try to load it
          if (sessionToRestore) {
            const sessionData = await window.api.loadSession(
              appState.lastWorkingDirectory,
              sessionToRestore,
              currentProjectId
            )
            // Only restore if the session belongs to the current project (or neither has a projectId)
            if (sessionData && (sessionData.projectId === (projectIdRef.current ?? null) || (!sessionData.projectId && !projectIdRef.current))) {
              setTurns(sessionData.turns)
              setSessionId(sessionData.sessionId)
              setSdkSessionId(sessionData.sdkSessionId ?? null)
              setCurrentSessionTitle(sessionData.title)

              // Check if there's an incomplete turn we should reconnect to
              const storedActiveTurnId = localStorage.getItem('activeTurnId')
              if (storedActiveTurnId) {
                const incompleteTurn = sessionData.turns.find(
                  t => t.id === storedActiveTurnId && !t.isComplete
                )
                if (incompleteTurn) {
                  // Check if the agent service still has this session actively processing
                  const agentSession = await window.api.getSessionInfo(sessionData.sessionId)
                  if (agentSession?.isProcessing) {
                    // Session is still running — reconnect to the event stream
                    console.log('[BuildScreen] Session still processing, reconnecting to stream...')
                    activeTurnIdRef.current = storedActiveTurnId
                    isStreamingRef.current = true
                    setIsStreaming(true)
                  } else {
                    // Session finished while we were away — mark the turn as complete
                    console.log('[BuildScreen] Session finished while away, marking turn complete')
                    setTurns(prev => prev.map(t =>
                      t.id === storedActiveTurnId && !t.isComplete
                        ? { ...t, textBlocks: [...t.textBlocks, '\n\n_Session completed in the background_'], isComplete: true, endTime: Date.now() }
                        : t
                    ))
                    localStorage.removeItem('activeTurnId')
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to restore last state:', error)
      }
    }

    restoreLastState()
  }, [])

  // Load skills info on mount and set up auto-sync
  useEffect(() => {
    loadSkillsInfo()

    // Auto-sync skills on mount if user is logged in
    const autoSync = async () => {
      if (user) {
        await handleSyncSkills()
      }
    }
    autoSync()
  }, [])

  // Load memories and sessions when working directory changes
  useEffect(() => {
    if (workingDirectory) {
      loadMemories(workingDirectory)
      loadSessions(workingDirectory)
      // Save working directory to app state
      window.api.saveWorkingDirectory(workingDirectory)
      onWorkingDirectoryChange?.(workingDirectory)
    }
  }, [workingDirectory])

  // Save session ID whenever it changes (global + per-project)
  useEffect(() => {
    if (sessionId) {
      window.api.saveSessionId(sessionId)
      if (projectIdRef.current) {
        window.api.saveProjectSessionId(projectIdRef.current, sessionId)
      }
    }
  }, [sessionId])

  // Timer for active turn
  useEffect(() => {
    if (isStreaming) {
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isStreaming])

  // Auto-save session after each turn completes
  useEffect(() => {
    if (turns.length > 0 && sessionId && workingDirectory) {
      // Only save when the last turn completes (not on intermediate updates)
      const lastTurn = turns[turns.length - 1]
      if (lastTurn?.isComplete) {
        // Debounce to avoid saving on every state update
        const timeoutId = setTimeout(() => {
          handleSaveSession()
        }, 1000) // Longer debounce to ensure all state updates settle

        return () => clearTimeout(timeoutId)
      }
    }
  }, [turns, sessionId, workingDirectory])

  // Reset selected command index when input changes
  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [input])

  const processNextQueuedMessage = useCallback(() => {
    // ATOMIC guard check-and-set - prevent race conditions
    // Safe in JavaScript's single-threaded event loop: check and set happen
    // in same tick before any async operations, preventing concurrent execution
    if (isStreamingRef.current || isProcessingQueueRef.current) {
      return
    }
    // Set guard immediately after check (same execution context = atomic)
    isProcessingQueueRef.current = true

    console.log('[Queue] processNextQueuedMessage called, queue length:', queuedMessagesRef.current.length)

    // Get current queue from ref (synchronous, no async setState issues)
    const currentQueue = queuedMessagesRef.current
    console.log('[Queue] Current queue length from ref:', currentQueue.length)

    if (currentQueue.length === 0) {
      console.log('[Queue] Queue is empty')
      isProcessingQueueRef.current = false
      return
    }

    const [messageToProcess, ...remainingMessages] = currentQueue
    console.log('[Queue] Processing message from queue:', messageToProcess.content)

    // Validate the message
    const trimmedContent = messageToProcess.content.trim()
    if (!trimmedContent && !messageToProcess.images?.length) {
      console.log('[Queue] Message invalid, removing from queue and trying next')
      setQueuedMessages(remainingMessages)
      queuedMessagesRef.current = remainingMessages // Update ref immediately
      isProcessingQueueRef.current = false
      // Try next message immediately
      setTimeout(() => processNextQueuedMessage(), 0)
      return
    }

    // Remove message from queue
    setQueuedMessages(remainingMessages)
    queuedMessagesRef.current = remainingMessages // Update ref immediately to avoid race conditions
    const turnId = crypto.randomUUID()
    const newTurn: Turn = {
      id: turnId,
      userMessage: trimmedContent,
      images: messageToProcess.images,
      textBlocks: [],
      toolEvents: [],
      isComplete: false,
      startTime: Date.now(),
      endTime: null,
      costUsd: null
    }

    // Handoff guards: set streaming guard BEFORE clearing processing guard
    // This ensures continuous protection against concurrent queue processing
    isStreamingRef.current = true
    setIsStreaming(true)
    // Safe to clear processing flag now - isStreamingRef takes over as guard
    isProcessingQueueRef.current = false
    activeTurnIdRef.current = turnId
    localStorage.setItem('activeTurnId', turnId)

    setTurns((prev) => {
      const updatedTurns = [...prev, newTurn]

      // Save session immediately with updated turns
      if (workingDirectoryRef.current && sessionIdRef.current) {
        const sessionData = {
          sessionId: sessionIdRef.current,
          projectId: projectIdRef.current,
          title: currentSessionTitleRef.current || updatedTurns[0]?.userMessage?.slice(0, 50) || 'Untitled Session',
          timestamp: updatedTurns[0]?.startTime || Date.now(),
          endTime: Date.now(),
          workingDirectory: workingDirectoryRef.current,
          turns: updatedTurns,
          totalCost: updatedTurns.reduce((sum, t) => sum + (t.costUsd || 0), 0)
        }
        window.api.saveSession(sessionData).catch(err =>
          console.error('[BuildScreen] Failed to save session:', err)
        )
      }

      return updatedTurns
    })

    // Send the message with conversation history
    console.log('[Queue] Sending queued message to API')
    window.api.sendMessage({
      content: newTurn.userMessage,
      images: messageToProcess.images,
      workingDirectory: workingDirectoryRef.current!,
      sessionId: sessionIdRef.current ?? undefined,
      sdkSessionId: sdkSessionIdRef.current ?? undefined,
      model: selectedModelRef.current,
      turnId: newTurn.id,
      sessionTitle: currentSessionTitleRef.current || newTurn.userMessage.slice(0, 50),
      previousTurns: turnsRef.current.filter(t => t.isComplete)
    }).catch(() => {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [...t.textBlocks, 'Failed to send message. Please try again.'],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
      isStreamingRef.current = false
      setIsStreaming(false)
      activeTurnIdRef.current = null
      // Try next message after error (delay to ensure state updates settle)
      setTimeout(() => processNextQueuedMessage(), 500)
    })
  }, []) // Empty deps - function reads from refs instead

  // Listen for stream events
  useEffect(() => {
    const unsubscribe = window.api.onStreamEvent((event: StreamEvent) => {
      // Filter out events from other sessions to prevent cross-project contamination.
      // When switching projects, a previous session may still be streaming events —
      // only process events that match our current session (or have no sessionId for backwards compat).
      if (event.sessionId && sessionIdRef.current && event.sessionId !== sessionIdRef.current) {
        // Background session completed — refresh the sessions list so sidebar updates
        if ((event.event === 'done' || event.event === 'error') && workingDirectoryRef.current) {
          console.log('[BuildScreen] Background session completed, refreshing sessions list:', event.sessionId)
          loadSessions(workingDirectoryRef.current)
        }
        return
      }

      // Handle system events (compaction, checkpoints) regardless of active turn
      if (event.event === 'system') {
        const type = event.data.type as string
        if (type === 'compacting') {
          setIsCompacting(true)
        } else if (type === 'compact') {
          setIsCompacting(false)
          // After compaction, the context was reset — use a reduced estimate
          setContextTokens(prev => Math.round(prev * 0.15))
        } else if (type === 'checkpoint') {
          // Store the FIRST checkpoint UUID on the active turn for file rewind.
          // The first user message UUID represents the state before any changes.
          const turnId = activeTurnIdRef.current
          const userMessageId = event.data.userMessageId as string
          if (turnId && userMessageId) {
            setTurns((prev) =>
              prev.map((t) =>
                // Only set if not already set — keep the first checkpoint
                t.id === turnId && !t.checkpointId ? { ...t, checkpointId: userMessageId } : t
              )
            )
          }
        }
        return
      }

      const turnId = activeTurnIdRef.current
      if (!turnId) return

      switch (event.event) {
        case 'text': {
          const text = event.data.text as string
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId) return t
              const blocks = [...t.textBlocks]
              // Append to last text block, or start a new one if last item was a tool event
              const lastToolIdx = t.toolEvents.length
              const expectedBlockIdx = lastToolIdx > 0
                ? countToolGroups(t.toolEvents)
                : 0
              while (blocks.length <= expectedBlockIdx) blocks.push('')
              blocks[expectedBlockIdx] += text
              return { ...t, textBlocks: blocks, currentPartialText: undefined }
            })
          )
          scrollToBottom()
          break
        }

        case 'tool_use':
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId) return t
              return {
                ...t,
                toolEvents: [
                  ...t.toolEvents,
                  {
                    type: 'tool_use' as const,
                    tool: event.data.tool as string,
                    input: event.data.input as Record<string, unknown>
                  }
                ]
              }
            })
          )
          scrollToBottom()
          break

        case 'tool_result':
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId) return t
              return {
                ...t,
                toolEvents: [
                  ...t.toolEvents,
                  { type: 'tool_result' as const, output: event.data.output as string }
                ]
              }
            })
          )
          break

        case 'partial_text': {
          const partialText = event.data.text as string
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? { ...t, currentPartialText: (t.currentPartialText ?? '') + partialText }
                : t
            )
          )
          scrollToBottom()
          break
        }

        case 'thinking': {
          const thinkingType = event.data.type as string
          if (thinkingType === 'start') {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? { ...t, isThinking: true, currentThinking: (event.data.thinking as string) ?? '' }
                  : t
              )
            )
          } else if (thinkingType === 'delta') {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? { ...t, currentThinking: (t.currentThinking ?? '') + (event.data.thinking as string) }
                  : t
              )
            )
          } else if (thinkingType === 'stop') {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? { ...t, isThinking: false }
                  : t
              )
            )
          }
          scrollToBottom()
          break
        }

        case 'tool_progress': {
          const toolUseId = event.data.toolUseId as string
          const toolName = event.data.toolName as string
          const elapsedSeconds = event.data.elapsedSeconds as number
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    toolProgress: {
                      ...(t.toolProgress ?? {}),
                      [toolUseId]: { toolName, elapsedSeconds }
                    }
                  }
                : t
            )
          )
          break
        }

        case 'user_question':
          setPendingQuestions((prev) => [
            ...prev,
            event.data as unknown as UserQuestion
          ])
          scrollToBottom()
          break

        case 'done':
          setSessionId(event.data.sessionId as string)
          if (event.data.sdkSessionId) {
            setSdkSessionId(event.data.sdkSessionId as string)
          }
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    isComplete: true,
                    endTime: Date.now(),
                    costUsd: (event.data.costUsd as number) ?? null,
                    // Clear transient streaming state
                    currentPartialText: undefined,
                    currentThinking: undefined,
                    isThinking: false,
                    toolProgress: undefined
                  }
                : t
            )
          )
          // Clear active turn from localStorage when done
          if (localStorage.getItem('activeTurnId') === turnId) {
            localStorage.removeItem('activeTurnId')
          }
          // Clear any remaining pending questions
          setPendingQuestions([])
          // Reset streaming state
          isStreamingRef.current = false
          setIsStreaming(false)
          activeTurnIdRef.current = null
          // Process next queued message if any (delay to ensure state updates settle)
          setTimeout(() => processNextQueuedMessage(), 500)
          break

        case 'error':
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId) return t
              const blocks = [...t.textBlocks]
              if (blocks.length === 0) blocks.push('')
              blocks[blocks.length - 1] += `\n\nError: ${event.data.error as string}`
              return { ...t, textBlocks: blocks, isComplete: true, endTime: Date.now() }
            })
          )
          // Clear active turn from localStorage on error
          if (localStorage.getItem('activeTurnId') === turnId) {
            localStorage.removeItem('activeTurnId')
          }
          // Reset streaming state
          isStreamingRef.current = false
          setIsStreaming(false)
          activeTurnIdRef.current = null
          // Process next queued message if any (delay to ensure state updates settle)
          setTimeout(() => processNextQueuedMessage(), 500)
          break
      }
    })

    return unsubscribe
  }, [processNextQueuedMessage])

  const switchToDirectory = (folder: string) => {
    // Don't abort running sessions — let them continue in the background.
    // Stream events are filtered by sessionId (line ~479) so they won't contaminate.
    // When the user switches back, handleLoadSession will reconnect to the live session.
    if (sessionIdRef.current && isStreamingRef.current) {
      console.log('[BuildScreen] Detaching from active session (continues in background):', sessionIdRef.current)
    }
    setWorkingDirectory(folder)
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setSdkSessionId(null)
    setCurrentSessionTitle('')
    // Clear streaming state so it doesn't leak into the new directory
    activeTurnIdRef.current = null
    isStreamingRef.current = false
    setIsStreaming(false)
    setPendingQuestions([])
    loadMemories(folder)
    loadSessions(folder)
    window.api.saveWorkingDirectory(folder)
    // Update recents list locally (store handles persistence in saveWorkingDirectory)
    setRecentDirectories(prev => [folder, ...prev.filter(d => d !== folder)].slice(0, 10))
  }

  const handleSelectFolder = async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      switchToDirectory(folder)
    }
  }

  const handleBackToProjects = () => {
    // Don't abort running sessions — let them continue in the background.
    // When the user returns to this project, handleLoadSession will reconnect.
    if (sessionIdRef.current && isStreamingRef.current) {
      console.log('[BuildScreen] Detaching from active session (continues in background):', sessionIdRef.current)
    }
    setWorkingDirectory(null)
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setCurrentSessionTitle('')
    setMemories([])
    setMemoryExists(false)
    setSessions([])
    // Clear streaming state
    activeTurnIdRef.current = null
    isStreamingRef.current = false
    setIsStreaming(false)
    setPendingQuestions([])
    localStorage.removeItem('activeTurnId')

    // Navigate back to ProjectsScreen via parent callback
    onBackToProjectsFromParent()
  }

  // Helper to get memory file path
  const getMemoryPath = (directory: string) => `${directory}/.conntext/history/MEMORY.md`

  const loadMemories = async (directory: string) => {
    try {
      const memoryPath = getMemoryPath(directory)
      const content = await window.api.readFile(memoryPath)
      if (content) {
        setMemoryExists(true)
        // Parse memories - split by markdown headers or double newlines
        const memoryEntries = content
          .split(/(?=^## )/gm)
          .filter(entry => entry.trim().length > 0)
          .map(entry => entry.trim())
        setMemories(memoryEntries)
      } else {
        setMemoryExists(false)
        setMemories([])
      }
    } catch {
      setMemoryExists(false)
      setMemories([])
    }
  }

  const loadSessions = async (directory: string) => {
    try {
      const sessionList = await window.api.listSessions(directory, projectIdRef.current)
      setSessions(sessionList)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      setSessions([])
    }
  }

  const loadSkillsInfo = async () => {
    try {
      const info = await window.api.getSkillsInfo()
      setSkillsCount(info.count)
      setSkillsVersion(info.version)
      setSkillsLastSync(info.lastSync)
    } catch (error) {
      console.error('Failed to load skills info:', error)
      setSkillsCount(0)
      setSkillsVersion(0)
      setSkillsLastSync(null)
    }
  }

  const loadFeatures = useCallback(async () => {
    if (!selectedProject?.id || !activeWorkspaceProp?.id) {
      setProjectFeatures([])
      return
    }

    setIsFeaturesLoading(true)
    setFeaturesError(null)

    try {
      const result = await window.api.fetchFeatures(activeWorkspaceProp.id, selectedProject.id)
      if (result.success) {
        setProjectFeatures(result.data)
      } else {
        setFeaturesError(result.error || 'Failed to load features')
        setProjectFeatures([])
      }
    } catch (error) {
      setFeaturesError(error instanceof Error ? error.message : 'Failed to load features')
      setProjectFeatures([])
    } finally {
      setIsFeaturesLoading(false)
    }
  }, [selectedProject?.id, activeWorkspaceProp?.id])

  // Load features when project or workspace changes
  useEffect(() => {
    loadFeatures()
  }, [loadFeatures])

  const handleSyncSkills = async () => {
    setIsSyncingSkills(true)
    setSyncSkillsMessage(null)

    try {
      const credentials = await window.api.getCredentials()
      if (!credentials) {
        setSyncSkillsMessage({ type: 'error', text: 'Not authenticated. Please log in again.' })
        return
      }

      const result = await window.api.syncSkills(credentials.apiUrl, credentials.apiToken)
      if (result.success) {
        await loadSkillsInfo()
        if (result.updated) {
          setSyncSkillsMessage({ type: 'success', text: `✅ Successfully synced ${result.count} skills` })
        } else if (result.count === 0) {
          setSyncSkillsMessage({ type: 'info', text: 'No skills available on ConnText platform yet' })
        } else {
          setSyncSkillsMessage({ type: 'success', text: `✅ Already up to date - ${result.count} skills available` })
        }
      } else {
        setSyncSkillsMessage({ type: 'error', text: result.error || 'Failed to sync skills' })
      }
    } catch (error) {
      setSyncSkillsMessage({ type: 'error', text: error instanceof Error ? error.message : 'An unexpected error occurred' })
    } finally {
      setIsSyncingSkills(false)
      // Clear message after 5 seconds
      setTimeout(() => setSyncSkillsMessage(null), 5000)
    }
  }

  const handleInitCommand = async () => {
    if (!workingDirectory) return

    const initialContent = `# Memory

This file stores important context and information for the AI agent.

## User Profile

- **Name**: ${user?.name || 'Unknown'}
- **Email**: ${user?.email || 'Unknown'}
- **User ID**: ${user?.id || 'Unknown'}
- **Initialized**: ${new Date().toLocaleString()}

## Personal Information

## Project Information

## Instructions

`

    const turnId = crypto.randomUUID()
    const newTurn: Turn = {
      id: turnId,
      userMessage: '/init',
      textBlocks: ['Initializing project...\n\n📝 Creating MEMORY.md file...'],
      toolEvents: [],
      isComplete: false,
      startTime: Date.now(),
      endTime: null,
      costUsd: null
    }

    activeTurnIdRef.current = turnId
    setTurns((prev) => [...prev, newTurn])
    setInput('')
    isStreamingRef.current = true
    setIsStreaming(true)

    // Persist active turn ID
    localStorage.setItem('activeTurnId', turnId)

    try {
      // Check if MEMORY.md already exists
      const memoryPath = getMemoryPath(workingDirectory)
      const existingMemory = await window.api.readFile(memoryPath)
      const memoryExists = existingMemory.trim().length > 0

      let memoryStatus = ''
      if (memoryExists) {
        memoryStatus = '⏭️  MEMORY.md already exists (skipped)'
      } else {
        // Create .conntext/history directory if it doesn't exist
        // We'll create it by writing the file - the agent will handle directory creation
        await window.api.writeFile(memoryPath, initialContent)
        memoryStatus = '✅ Created .conntext/history/MEMORY.md'
      }

      // Update progress
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [`Initializing project...\n\n${memoryStatus}\n📦 Copying skills folder...`]
              }
            : t
        )
      )

      // Get bundled skills path and copy to working directory
      const skillsSourcePath = await window.api.getSkillsPath()
      const skillsDestPath = `${workingDirectory}/.claude/skills`
      await window.api.copyDirectory(skillsSourcePath, skillsDestPath)

      // Get skills count for success message
      const skillsInfo = await window.api.getSkillsInfo()

      const createdItems = []
      if (!memoryExists) {
        createdItems.push('• .conntext/history/MEMORY.md - AI memory storage')
      }
      createdItems.push(`• .claude/skills/ - ${skillsInfo.count} agent skills`)

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [
                  '✅ Project initialized successfully!\n\n' +
                  (memoryExists ? '**Updated:**\n' : '**Created:**\n') +
                  createdItems.join('\n') +
                  (memoryExists ? '\n\n*MEMORY.md was preserved (already existed)*' : '') +
                  '\n\nYou can now use all available skills in this project!'
                ],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )

      loadMemories(workingDirectory)
      // Clear active turn from localStorage
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
    } catch (error) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [`❌ Failed to initialize project: ${error}`],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )
      // Clear active turn from localStorage on error
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
    } finally {
      isStreamingRef.current = false
      setIsStreaming(false)
      activeTurnIdRef.current = null
    }
  }

  const handleQuestionSubmit = useCallback(async (questionId: string, response: string) => {
    // Remove the question from pending list
    setPendingQuestions((prev) => prev.filter((q) => q.questionId !== questionId))

    // Send response back to main process
    try {
      await window.api.respondToQuestion(questionId, response)
    } catch (err) {
      console.error('[BuildScreen] Failed to submit question response:', err)
    }
  }, [])

  const handleQuestionCancel = useCallback(async (questionId: string) => {
    // Remove the question from pending list
    setPendingQuestions((prev) => prev.filter((q) => q.questionId !== questionId))

    // Send a cancelled response so the pending promise resolves
    const cancelResponse = JSON.stringify({ status: 'cancelled' })
    try {
      await window.api.respondToQuestion(questionId, cancelResponse)
    } catch (err) {
      console.error('[BuildScreen] Failed to cancel question:', err)
    }
  }, [])

  const handleSend = useCallback(async (overrideInput?: string, displayMessage?: string) => {
    let effectiveInput = overrideInput ?? input
    if (!workingDirectory) return
    if (!effectiveInput.trim() && pastedImages.length === 0 && attachedFiles.length === 0) return

    // Prepend attached file paths as references for the agent to read
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles.map(f => `@${f}`).join(' ')

      effectiveInput = effectiveInput.trim()
        ? `${fileRefs}\n\n${effectiveInput}`
        : `Please review these files: ${fileRefs}`
      setAttachedFiles([])
    }

    // If already streaming, inject the message into the running query
    if (isStreamingRef.current) {
      const trimmed = effectiveInput.trim()
      if (!trimmed) return
      const activeSessionId = sessionIdRef.current || sessionId
      if (activeSessionId) {
        console.log('[BuildScreen] Injecting message into running query (session:', activeSessionId, '):', trimmed.slice(0, 80))
        try {
          const { injected } = await window.api.injectMessage(activeSessionId, trimmed)
          if (injected) {
            // Show the injected message in the active turn's text blocks
            const turnId = activeTurnIdRef.current
            if (turnId) {
              setTurns((prev) =>
                prev.map((t) => {
                  if (t.id !== turnId) return t
                  const blocks = [...t.textBlocks]
                  // Insert a visual marker for the injected user message
                  const lastToolIdx = t.toolEvents.length
                  const expectedBlockIdx = lastToolIdx > 0 ? countToolGroups(t.toolEvents) : 0
                  while (blocks.length <= expectedBlockIdx) blocks.push('')
                  blocks[expectedBlockIdx] += `\n\n> **You:** ${trimmed}\n\n`
                  return { ...t, textBlocks: blocks }
                })
              )
            }
            setInput('')
            if (inputRef.current) {
              inputRef.current.style.height = 'auto'
            }
            return
          }
        } catch (err) {
          console.error('[BuildScreen] injectMessage error:', err)
        }
      } else {
        console.log('[BuildScreen] No session ID available for injection')
      }
      // If injection failed, the query likely completed between our check and the call.
      // Re-check streaming state — if still streaming, just return (shouldn't happen).
      if (isStreamingRef.current) {
        console.log('[BuildScreen] Injection failed but still streaming — cannot send')
        return
      }
      // Query completed, fall through to send as a new message
      console.log('[BuildScreen] Injection failed, query completed — sending as new message')
    }

    const trimmedInput = effectiveInput.trim()

    // Handle slash commands
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.split(' ')
      const command = parts[0].toLowerCase()
      const args = parts.slice(1).join(' ')

      if (command === '/init') {
        handleInitCommand()
        return
      }

      if (command === '/code-review') {
        // Convert slash command to agent prompt and send it
        const reviewPrompt = args
          ? `Use the code_review tool to analyze ${args}. Check for security, performance, and best practices.`
          : `Use the code_review tool to analyze the most recently modified files. Check for security, performance, and best practices.`

        // Clear input and send the converted prompt
        setInput('')

        // Create the turn with the converted prompt
        const turnId = crypto.randomUUID()
        const newTurn: Turn = {
          id: turnId,
          userMessage: reviewPrompt,
          images: pastedImages.length > 0 ? pastedImages : undefined,
          textBlocks: [],
          toolEvents: [],
          isComplete: false,
          startTime: Date.now(),
          endTime: null,
          costUsd: null
        }

        activeTurnIdRef.current = turnId
        setTurns((prev) => [...prev, newTurn])
        setPastedImages([])
        isStreamingRef.current = true
    setIsStreaming(true)
        localStorage.setItem('activeTurnId', turnId)

        // Save session immediately
        if (workingDirectory && sessionId) {
          const sessionData = {
            sessionId,
            projectId: projectId ?? null,
            title: currentSessionTitle || turns[0]?.userMessage?.slice(0, 50) || newTurn.userMessage.slice(0, 50) || 'Untitled Session',
            timestamp: turns[0]?.startTime || Date.now(),
            endTime: Date.now(),
            workingDirectory,
            turns: [...turns, newTurn],
            totalCost: turns.reduce((sum, t) => sum + (t.costUsd || 0), 0)
          }
          window.api.saveSession(sessionData).catch(err =>
            console.error('[BuildScreen] Failed to save session immediately:', err)
          )
        }

        // Send the message with conversation history
        window.api.sendMessage({
          content: newTurn.userMessage,
          images: pastedImages.length > 0 ? pastedImages : undefined,
          workingDirectory: workingDirectory!,
          sessionId: sessionId ?? undefined,
          sdkSessionId: sdkSessionId ?? undefined,
          model: selectedModel,
          turnId: newTurn.id,
          sessionTitle: currentSessionTitle || newTurn.userMessage.slice(0, 50),
          previousTurns: turns.filter(t => t.isComplete)
        }).then(result => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId ? { ...t, isComplete: true, endTime: t.endTime ?? Date.now() } : t
            )
          )
        }).catch(() => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    textBlocks: [...t.textBlocks, 'Failed to send message. Please try again.'],
                    isComplete: true,
                    endTime: Date.now()
                  }
                : t
            )
          )
          if (localStorage.getItem('activeTurnId') === turnId) {
            localStorage.removeItem('activeTurnId')
          }
        }).finally(() => {
          isStreamingRef.current = false
          setIsStreaming(false)
          activeTurnIdRef.current = null
        })

        return
      }

      // Handle skills - commands that should be forwarded to the agent
      // Pattern: /bf-*, /conntext-*, or known skill names
      const skillPatterns = [
        /^\/bf-/,           // BuildFaster skills
        /^\/conntext-/,     // ConnText skills
        /^\/loop$/,         // Known skills
        /^\/simplify$/,
        /^\/claude-api$/,
        /^\/keybindings-help$/,
        /^\/fix-issues$/,
        /^\/feature-build$/,
        /^\/project-build$/,
        /^\/playwright-test$/,
        /^\/playwright-fix-issues$/
      ]

      if (skillPatterns.some(pattern => pattern.test(command))) {
        // This is a skill command - forward to agent to run the skill
        const skillPrompt = `Run the ${trimmedInput} skill`

        // Clear input
        setInput('')

        // Create the turn
        const turnId = crypto.randomUUID()
        const newTurn: Turn = {
          id: turnId,
          userMessage: skillPrompt,
          images: pastedImages.length > 0 ? pastedImages : undefined,
          textBlocks: [],
          toolEvents: [],
          isComplete: false,
          startTime: Date.now(),
          endTime: null,
          costUsd: null
        }

        activeTurnIdRef.current = turnId
        setTurns((prev) => [...prev, newTurn])
        setPastedImages([])
        isStreamingRef.current = true
        setIsStreaming(true)
        localStorage.setItem('activeTurnId', turnId)

        // Save session immediately
        if (workingDirectory && sessionId) {
          const sessionData = {
            sessionId,
            projectId: projectId ?? null,
            title: currentSessionTitle || turns[0]?.userMessage?.slice(0, 50) || newTurn.userMessage.slice(0, 50) || 'Untitled Session',
            timestamp: turns[0]?.startTime || Date.now(),
            endTime: Date.now(),
            workingDirectory,
            turns: [...turns, newTurn],
            totalCost: turns.reduce((sum, t) => sum + (t.costUsd || 0), 0)
          }
          window.api.saveSession(sessionData).catch(err =>
            console.error('[BuildScreen] Failed to save session immediately:', err)
          )
        }

        // Send the message with conversation history
        window.api.sendMessage({
          content: newTurn.userMessage,
          images: pastedImages.length > 0 ? pastedImages : undefined,
          workingDirectory: workingDirectory!,
          sessionId: sessionId ?? undefined,
          sdkSessionId: sdkSessionId ?? undefined,
          model: selectedModel,
          turnId: newTurn.id,
          sessionTitle: currentSessionTitle || newTurn.userMessage.slice(0, 50),
          previousTurns: turns.filter(t => t.isComplete)
        }).catch(() => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    textBlocks: [...t.textBlocks, 'Failed to send message. Please try again.'],
                    isComplete: true,
                    endTime: Date.now()
                  }
                : t
            )
          )
          if (localStorage.getItem('activeTurnId') === turnId) {
            localStorage.removeItem('activeTurnId')
          }
        }).finally(() => {
          isStreamingRef.current = false
          setIsStreaming(false)
          activeTurnIdRef.current = null
        })

        return
      }

      // Unknown command
      const turnId = crypto.randomUUID()
      const availableCommands = SLASH_COMMANDS.map(cmd =>
        `- ${cmd.command} ${cmd.args} - ${cmd.description}`
      ).join('\n')

      setTurns((prev) => [
        ...prev,
        {
          id: turnId,
          userMessage: trimmedInput,
          textBlocks: [`Unknown command: ${command}\n\nAvailable commands:\n${availableCommands}`],
          toolEvents: [],
          isComplete: true,
          startTime: Date.now(),
          endTime: Date.now(),
          costUsd: null
        }
      ])
      setInput('')
      return
    }

    // Check if user wants to save to memory (explicit command)
    const saveToMemoryPattern = /save (?:this )?to memory:?\s*(.*)/i
    const match = trimmedInput.match(saveToMemoryPattern)

    if (match && memoryExists) {
      const memoryContent = match[1] || trimmedInput.replace(saveToMemoryPattern, '').trim()
      await handleSaveToMemory(memoryContent)
      return
    }

    // Add memory context to every message if memory exists
    let messageToSend = trimmedInput
    if (memoryExists) {
      const userName = user?.name || 'User'
      const firstName = userName.split(' ')[0]

      // Add memory instructions to every message
      messageToSend = `${trimmedInput}

---
MEMORY SYSTEM: Before responding, analyze this message for information worth remembering about ${firstName}. If you find anything meaningful, append to .conntext/history/MEMORY.md under the appropriate section:

**## Personal Information** - Personal traits, preferences, habits, opinions (e.g., coffee preference, music taste, hobbies)
**## Project Information** - Project context, requirements, technical decisions, architecture notes
**## Instructions** - Systematic preferences, workflow instructions, how ${firstName} wants things done

Format as markdown bullets, convert "I/my/me" to "${firstName}/${firstName}'s/${firstName}", keep concise.
User: ${userName} (${user?.email || ''})
Don't announce saves unless asked - just respond naturally.`
    }

    // Add folder context to message if folders are selected
    if (activeFolders.length > 0) {
      const folderList = activeFolders.join(', ')
      messageToSend = `${messageToSend}

---
FOLDER CONTEXT: The user has selected the following folders as the active context for this task: ${folderList}
You MUST focus your work within these folders. When reading, writing, editing, or searching files, restrict operations to these folders unless the user explicitly asks otherwise. If the user's request relates to code, assume it's about code within these folders.`
    }

    // Regular message handling
    const turnId = crypto.randomUUID()
    const newTurn: Turn = {
      id: turnId,
      userMessage: displayMessage || trimmedInput, // Show display message or original input in UI
      textBlocks: [],
      toolEvents: [],
      isComplete: false,
      startTime: Date.now(),
      endTime: null,
      costUsd: null
    }

    activeTurnIdRef.current = turnId
    setTurns((prev) => [...prev, newTurn])
    setInput('')
    setPastedImages([])
    isStreamingRef.current = true
    setIsStreaming(true)

    // Persist active turn ID so we can resume after hot reload
    localStorage.setItem('activeTurnId', turnId)

    // Create session ID immediately if this is a new session
    let currentSessionId = sessionId
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID()
      setSessionId(currentSessionId)
    }

    // Save the turn immediately (even though incomplete) so it persists through reloads
    if (workingDirectory) {
      const sessionData = {
        sessionId: currentSessionId,
        projectId: projectId ?? null,
        title: currentSessionTitle || turns[0]?.userMessage?.slice(0, 50) || newTurn.userMessage.slice(0, 50) || 'Untitled Session',
        timestamp: turns[0]?.startTime || Date.now(),
        endTime: Date.now(),
        workingDirectory,
        turns: [...turns, newTurn],
        totalCost: turns.reduce((sum, t) => sum + (t.costUsd || 0), 0)
      }
      window.api.saveSession(sessionData).catch(err =>
        console.error('[BuildScreen] Failed to save session immediately:', err)
      )
    }

    try {
      console.log('[BuildScreen] Sending message (images embedded as file paths in text)')
      const result = await window.api.sendMessage({
        content: messageToSend, // Send the potentially modified message to agent
        workingDirectory,
        sessionId: currentSessionId,
        sdkSessionId: sdkSessionId ?? undefined,
        model: selectedModel,
        turnId: newTurn.id,
        sessionTitle: currentSessionTitle || turns[0]?.userMessage?.slice(0, 50) || newTurn.userMessage.slice(0, 50),
        previousTurns: turns.filter(t => t.isComplete)
      })

      // SessionId is already set by the 'done' stream event, no need to set it again here
      // This prevents duplicate state updates that could trigger multiple auto-saves

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, isComplete: true, endTime: t.endTime ?? Date.now() } : t
        )
      )
    } catch {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [...t.textBlocks, 'Failed to send message. Please try again.'],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )
      // Clear active turn from localStorage on error
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
    } finally {
      isStreamingRef.current = false
      setIsStreaming(false)
      activeTurnIdRef.current = null
    }
  }, [input, workingDirectory, isStreaming, sessionId, sdkSessionId, memoryExists, pastedImages, attachedFiles, activeFolders, selectedModel])

  const detectMemoryIntent = (text: string): string | null => {
    // Patterns that indicate user wants to save to memory
    const memoryPatterns = [
      // Matches: "Remember, X" or "Remember that X" or "Don't forget X" etc.
      /(?:remember|dont forget|don't forget|make sure|keep in mind|note that|FYI)[,\s]+(?:that\s+)?(.+)/i,
      // Matches: "X, remember that" or "X. Remember that" etc.
      /(.+?)[,.\s]+(?:remember that|don't forget that|dont forget that|remember|dont forget|don't forget)\s*$/i
    ]

    for (const pattern of memoryPatterns) {
      const match = text.match(pattern)
      if (match) {
        const content = match[1].trim()
        if (content.length > 0) {
          return content
        }
      }
    }
    return null
  }

  const handleSaveToMemory = async (content: string) => {
    if (!workingDirectory) return

    const turnId = crypto.randomUUID()
    const newTurn: Turn = {
      id: turnId,
      userMessage: `Save to memory: ${content}`,
      textBlocks: ['Saving to memory...'],
      toolEvents: [],
      isComplete: false,
      startTime: Date.now(),
      endTime: null,
      costUsd: null
    }

    activeTurnIdRef.current = turnId
    setTurns((prev) => [...prev, newTurn])
    setInput('')
    isStreamingRef.current = true
    setIsStreaming(true)

    // Persist active turn ID
    localStorage.setItem('activeTurnId', turnId)

    try {
      const memoryPath = getMemoryPath(workingDirectory)
      const existingContent = await window.api.readFile(memoryPath)
      const timestamp = new Date().toLocaleString()
      const newEntry = `\n## ${timestamp}\n\n${content}\n`
      const updatedContent = existingContent + newEntry

      await window.api.writeFile(memoryPath, updatedContent)

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: ['✅ Successfully saved to memory!'],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )

      loadMemories(workingDirectory)
      // Clear active turn from localStorage
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
    } catch (error) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                textBlocks: [`❌ Failed to save to memory: ${error}`],
                isComplete: true,
                endTime: Date.now()
              }
            : t
        )
      )
      // Clear active turn from localStorage on error
      if (localStorage.getItem('activeTurnId') === turnId) {
        localStorage.removeItem('activeTurnId')
      }
    } finally {
      isStreamingRef.current = false
      setIsStreaming(false)
      activeTurnIdRef.current = null
    }
  }

  const handleSaveSession = async () => {
    if (!workingDirectory || !sessionId || turns.length === 0) return

    const totalCost = turns.reduce((sum, turn) => sum + (turn.costUsd || 0), 0)
    const sessionTitle = currentSessionTitle || turns[0]?.userMessage?.slice(0, 50) || 'Untitled Session'

    const sessionData = {
      sessionId,
      sdkSessionId,
      projectId: projectId ?? null,
      title: sessionTitle,
      timestamp: turns[0]?.startTime || Date.now(),
      endTime: Date.now(),
      workingDirectory,
      turns,
      totalCost
    }

    const result = await window.api.saveSession(sessionData)
    if (result.success) {
      loadSessions(workingDirectory)
    }
  }

  const handleLoadSession = async (loadSessionId: string) => {
    if (!workingDirectory) return

    // First, try to get the live turn state from the main process.
    // This has the most up-to-date data if the session was running in the background.
    let liveState: Awaited<ReturnType<typeof window.api.getActiveTurnState>> = null
    let agentSession: Awaited<ReturnType<typeof window.api.getSessionInfo>> = null
    try {
      liveState = await window.api.getActiveTurnState(loadSessionId)
      agentSession = await window.api.getSessionInfo(loadSessionId)
    } catch (err) {
      console.warn('[BuildScreen] Failed to get live session state, falling back to disk:', err)
    }

    if (liveState?.meta && agentSession) {
      // Session is alive in the main process — hydrate from its live state
      console.log('[BuildScreen] Hydrating from main process live state for session:', loadSessionId)

      const allTurns = [...liveState.meta.completedTurns]
      if (liveState.activeTurn) {
        allTurns.push(liveState.activeTurn)
      }

      setTurns(allTurns)
      setSessionId(loadSessionId)
      setSdkSessionId(agentSession.sdkSessionId ?? null)
      setCurrentSessionTitle(liveState.meta.title)

      if (agentSession.isProcessing && liveState.activeTurn) {
        // Session is still running — reconnect to the event stream
        console.log('[BuildScreen] Session still processing, reconnecting to stream...')
        activeTurnIdRef.current = liveState.activeTurn.id
        isStreamingRef.current = true
        setIsStreaming(true)
        localStorage.setItem('activeTurnId', liveState.activeTurn.id)
      } else {
        // Session is alive but not processing — all turns are complete
        activeTurnIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
      }
      return
    }

    // Fall back to loading from disk if session is not alive in main process
    const sessionData = await window.api.loadSession(workingDirectory, loadSessionId, projectId)
    if (sessionData) {
      setTurns(sessionData.turns)
      setSessionId(sessionData.sessionId)
      setSdkSessionId(sessionData.sdkSessionId ?? null)
      setCurrentSessionTitle(sessionData.title)

      // Check if this session has an incomplete turn that's still running
      const incompleteTurn = sessionData.turns.find((t: Turn) => !t.isComplete)
      if (incompleteTurn) {
        // Session finished while we were away — the disk file was auto-saved
        // by the main process. Check if the agent is still alive.
        const agentInfo = await window.api.getSessionInfo(sessionData.sessionId)
        if (agentInfo?.isProcessing) {
          // Still running — reconnect
          console.log('[BuildScreen] Loaded session still processing, reconnecting...')
          activeTurnIdRef.current = incompleteTurn.id
          isStreamingRef.current = true
          setIsStreaming(true)
          localStorage.setItem('activeTurnId', incompleteTurn.id)
        } else {
          // Session finished while we were away — mark the turn as complete
          console.log('[BuildScreen] Loaded session finished in background, marking complete')
          setTurns(prev => prev.map(t =>
            t.id === incompleteTurn.id && !t.isComplete
              ? { ...t, textBlocks: [...t.textBlocks, '\n\n_Session completed in the background_'], isComplete: true, endTime: Date.now() }
              : t
          ))
        }
      } else {
        // All turns complete — ensure streaming state is cleared
        activeTurnIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
      }
    }
  }

  const handleDeleteSession = async (deleteSessionId: string) => {
    if (!workingDirectory) return

    const result = await window.api.deleteSession(workingDirectory, deleteSessionId, projectId)
    if (result.success) {
      loadSessions(workingDirectory)
    }
  }

  const handleNewSession = () => {
    // Don't abort the old session — let it continue in the background
    if (sessionIdRef.current && isStreamingRef.current) {
      console.log('[BuildScreen] Detaching from active session (continues in background):', sessionIdRef.current)
    }
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setSdkSessionId(null)
    setCurrentSessionTitle('')
    setPastedImages([])
    setInput('')
    // Clear streaming state so it doesn't leak into the new session
    activeTurnIdRef.current = null
    isStreamingRef.current = false
    setIsStreaming(false)
    setPendingQuestions([])
    localStorage.removeItem('activeTurnId')
    console.log('[BuildScreen] Started new session')
  }

  const handleRenameSession = async (targetSessionId: string, newTitle: string) => {
    if (!workingDirectory) return
    console.log('[BuildScreen] Renaming session', targetSessionId, 'to', newTitle, 'in', workingDirectory)
    try {
      const result = await window.api.renameSession(workingDirectory, targetSessionId, newTitle, projectId)
      console.log('[BuildScreen] Rename result:', result)
      if (result.success) {
        // Update local sessions list
        setSessions(prev => prev.map(s =>
          s.sessionId === targetSessionId ? { ...s, title: newTitle } : s
        ))
        // If renaming the current session, update the title
        if (targetSessionId === sessionId) {
          setCurrentSessionTitle(newTitle)
        }
        // Reload sessions from disk to ensure consistency
        loadSessions(workingDirectory)
      }
    } catch (err) {
      console.error('[BuildScreen] Rename failed:', err)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // Check if the item is an image
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        // Convert the image to PNG format
        const reader = new FileReader()
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string

          // Load image to convert to PNG
          const img = new Image()
          img.onload = async () => {
            // Create canvas and draw image
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            ctx.drawImage(img, 0, 0)

            // Convert to PNG
            const pngDataUrl = canvas.toDataURL('image/png')
            const base64Data = pngDataUrl.split(',')[1]

            // Save image to temp file
            const timestamp = Date.now()
            const tempFileName = `conntext-build-paste-${timestamp}.png`
            const userHome = await window.api.getUserHome()
            const tempDir = `${userHome}\\AppData\\Local\\Temp`
            const tempFilePath = `${tempDir}\\${tempFileName}`

            try {
              // Convert base64 to buffer for saving
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }

              await window.api.writeImageFile(tempFilePath, bytes)

              // Add thumbnail for preview (keep for UI)
              setPastedImages(prev => [...prev, {
                data: base64Data,
                mediaType: 'image/png'
              }])

              // Insert file path into text input at cursor position
              setInput(prev => {
                const cursorPos = inputRef.current?.selectionStart ?? prev.length
                const beforeCursor = prev.substring(0, cursorPos)
                const afterCursor = prev.substring(cursorPos)
                const newText = `${beforeCursor}"${tempFilePath}"${afterCursor ? ' ' + afterCursor : ''}`

                // Move cursor after inserted text
                setTimeout(() => {
                  if (inputRef.current) {
                    const newPos = beforeCursor.length + tempFilePath.length + 2 // +2 for quotes
                    inputRef.current.selectionStart = newPos
                    inputRef.current.selectionEnd = newPos
                  }
                }, 0)

                return newText
              })
            } catch (error) {
              console.error('Failed to save pasted image:', error)
            }
          }
          img.src = dataUrl
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleRemoveImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files) {
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.onload = (e) => {
              const base64 = e.target?.result as string
              const base64Data = base64.split(',')[1]
              setPastedImages(prev => [...prev, { data: base64Data, mediaType: file.type }])
            }
            reader.readAsDataURL(file)
          }
        }
      }
    }
    input.click()
    setIsActionMenuOpen(false)
  }

  const handleAddFile = async () => {
    setIsActionMenuOpen(false)
    const files = await window.api.selectFiles()
    if (files && files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files.filter(f => !prev.includes(f))])
    }
  }

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const dt = e.dataTransfer
    if (!dt) return

    const files = dt.files
    if (!files || files.length === 0) return

    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const isImage = file.type.startsWith('image/') || imageExts.has(ext)

      if (isImage) {
        // Handle image files — add as pasted images
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          const base64Data = base64.split(',')[1]
          const mediaType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`
          setPastedImages(prev => [...prev, { data: base64Data, mediaType }])
        }
        reader.readAsDataURL(file)
      } else {
        // Use Electron's webUtils.getPathForFile via preload bridge
        try {
          const filePath = window.api.getPathForFile(file)
          if (filePath) {
            setAttachedFiles(prev => prev.includes(filePath) ? prev : [...prev, filePath])
          }
        } catch (err) {
          console.warn('[Drop] Failed to get path for:', file.name, err)
        }
      }
    }
  }

  // Available slash commands
  const SLASH_COMMANDS = [
    { command: '/init', description: 'Initialize project memory & copy skills', args: '' },
    { command: '/code-review', description: 'Review code for issues', args: '[files]' },
    { command: '/fix-issues', description: 'Fix bugs from code review', args: '' },
    { command: '/feature-build', description: 'Build a feature from PRD', args: '[prd-path]' },
    { command: '/project-build', description: 'Build entire project', args: '[prd-path]' },
    { command: '/playwright-test', description: 'Generate/run Playwright tests', args: '[prd-path]' },
    { command: '/playwright-fix-issues', description: 'Fix Playwright test bugs', args: '' }
  ]

  // Filter commands based on input
  const getFilteredCommands = () => {
    if (!input.startsWith('/')) return []
    const query = input.toLowerCase()
    return SLASH_COMMANDS.filter(cmd => cmd.command.toLowerCase().startsWith(query))
  }

  const executeCommand = (command: string, autoSend: boolean = false) => {
    if (autoSend) {
      // Immediately execute the command
      setInput(command)
      setSelectedCommandIndex(0)
      handleSend(command)
    } else {
      // Add to input for parameter entry
      setInput(command + ' ')
      setSelectedCommandIndex(0)
      // Focus the input and move cursor to end
      setTimeout(() => {
        inputRef.current?.focus()
        const len = (command + ' ').length
        inputRef.current?.setSelectionRange(len, len)
      }, 0)
    }
  }

  /**
   * Extract the @query at the current cursor position.
   * Returns { query, start, end } if the cursor is inside an @mention, null otherwise.
   */
  const getAtMention = (): { query: string; start: number; end: number } | null => {
    const textarea = inputRef.current
    if (!textarea) return null
    const cursorPos = textarea.selectionStart
    const text = input

    // Walk backwards from cursor to find the @ trigger
    let atPos = -1
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        atPos = i
        break
      }
      // Stop if we hit whitespace before finding @ (it's not part of this token)
      // But allow spaces within the query for multi-word filenames — stop at newline
      if (text[i] === '\n') break
    }

    if (atPos === -1) return null
    // The @ must be at the start or preceded by whitespace
    if (atPos > 0 && !/\s/.test(text[atPos - 1])) return null

    const query = text.slice(atPos + 1, cursorPos)
    return { query, start: atPos, end: cursorPos }
  }

  // Trigger file search when input changes and contains @
  useEffect(() => {
    if (fileSearchTimerRef.current) {
      clearTimeout(fileSearchTimerRef.current)
    }

    const mention = getAtMention()
    if (!mention || !workingDirectory || mention.query.length === 0) {
      setFileSuggestions([])
      setSelectedFileIndex(0)
      return
    }

    fileSearchTimerRef.current = setTimeout(async () => {
      try {
        const results = await window.api.searchFiles(workingDirectory, mention.query, 15)
        setFileSuggestions(results)
        setSelectedFileIndex(0)
      } catch {
        setFileSuggestions([])
      }
    }, 100) // 100ms debounce

    return () => {
      if (fileSearchTimerRef.current) {
        clearTimeout(fileSearchTimerRef.current)
      }
    }
  }, [input, workingDirectory])

  const insertFileSuggestion = (filePath: string) => {
    const mention = getAtMention()
    if (!mention) return
    // Replace @query with the full file path
    const before = input.slice(0, mention.start)
    const after = input.slice(mention.end)
    const newInput = `${before}@${filePath}${after ? after : ' '}`
    setInput(newInput)
    setFileSuggestions([])
    setSelectedFileIndex(0)
    // Refocus and position cursor after the inserted path
    setTimeout(() => {
      inputRef.current?.focus()
      const pos = mention.start + filePath.length + 1 + (after ? 0 : 1)
      inputRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleStop = () => {
    if (!activeTurnIdRef.current) return

    // Mark the current turn as complete with a stopped message
    const turnId = activeTurnIdRef.current
    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId
          ? {
              ...t,
              textBlocks: [...t.textBlocks, '\n\n_Response stopped by user_'],
              isComplete: true,
              endTime: Date.now()
            }
          : t
      )
    )

    // Abort the backend SDK query so it actually stops
    const currentSessionId = sessionIdRef.current
    if (currentSessionId) {
      window.api.abortAgent(currentSessionId).catch((err) => {
        console.error('[BuildScreen] Failed to abort agent:', err)
      })
    }

    // Cancel any pending questions so their promises resolve
    setPendingQuestions((prev) => {
      const cancelResponse = JSON.stringify({ status: 'cancelled' })
      for (const q of prev) {
        window.api.respondToQuestion(q.questionId, cancelResponse).catch(() => {})
      }
      return []
    })
    isStreamingRef.current = false
    setIsStreaming(false)
    activeTurnIdRef.current = null
    if (localStorage.getItem('activeTurnId') === turnId) {
      localStorage.removeItem('activeTurnId')
    }
  }

  const [rewindingTurnId, setRewindingTurnId] = useState<string | null>(null)

  const handleRewind = useCallback(async (turnId: string, checkpointId: string) => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    if (isStreamingRef.current) {
      console.log('[BuildScreen] Cannot rewind while streaming')
      return
    }

    setRewindingTurnId(turnId)

    try {
      // First do a dry run to preview changes
      const preview = await window.api.rewindFiles(currentSessionId, checkpointId, true)

      if (!preview.canRewind) {
        console.error('[BuildScreen] Cannot rewind:', preview.error)
        setRewindingTurnId(null)
        return
      }

      // Now actually rewind
      const result = await window.api.rewindFiles(currentSessionId, checkpointId, false)

      if (result.canRewind) {
        // Remove turns from this point onward
        setTurns((prev) => {
          const turnIndex = prev.findIndex(t => t.id === turnId)
          if (turnIndex === -1) return prev
          return prev.slice(0, turnIndex)
        })

        // Add a system message about the rewind
        const rewindTurn: Turn = {
          id: crypto.randomUUID(),
          userMessage: 'Rewind files',
          textBlocks: [
            `Rewound file changes to before this point.\n\n` +
            `**${result.filesChanged?.length ?? 0} file${(result.filesChanged?.length ?? 0) !== 1 ? 's' : ''} restored**` +
            (result.filesChanged && result.filesChanged.length > 0
              ? '\n' + result.filesChanged.map(f => `- \`${f}\``).join('\n')
              : '') +
            (result.insertions || result.deletions
              ? `\n\n+${result.insertions ?? 0} / -${result.deletions ?? 0} lines`
              : '')
          ],
          toolEvents: [],
          isComplete: true,
          startTime: Date.now(),
          endTime: Date.now(),
          costUsd: null
        }
        setTurns(prev => [...prev, rewindTurn])
      } else {
        console.error('[BuildScreen] Rewind failed:', result.error)
      }
    } catch (err) {
      console.error('[BuildScreen] Rewind error:', err)
    } finally {
      setRewindingTurnId(null)
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // File mention autocomplete
    if (fileSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedFileIndex((prev) => (prev + 1) % fileSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedFileIndex((prev) => (prev - 1 + fileSuggestions.length) % fileSuggestions.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        insertFileSuggestion(fileSuggestions[selectedFileIndex])
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertFileSuggestion(fileSuggestions[selectedFileIndex])
        // Don't send — just insert the file, user can keep typing
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setFileSuggestions([])
        setSelectedFileIndex(0)
        return
      }
    }

    const filteredCommands = getFilteredCommands()
    const showingCommands = input.startsWith('/') && !input.includes(' ') && filteredCommands.length > 0

    if (showingCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        // Tab completes the command for parameter entry (don't auto-send)
        executeCommand(filteredCommands[selectedCommandIndex].command, false)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        // Enter executes the command immediately
        executeCommand(filteredCommands[selectedCommandIndex].command, true)
        return
      }
    }

    // Check if user typed a complete slash command and pressed enter
    if (e.key === 'Enter' && !e.shiftKey && input.startsWith('/')) {
      const commandMatch = SLASH_COMMANDS.find(cmd =>
        input === cmd.command || input.startsWith(cmd.command + ' ')
      )
      if (commandMatch) {
        // User has typed a complete command, execute it
        e.preventDefault()
        handleSend()
        return
      }
    }

    // Shift+Enter: Queue the message for later processing
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      const trimmedInput = input.trim()
      if (trimmedInput || pastedImages.length > 0) {
        console.log('[Queue] Adding message to queue:', trimmedInput)
        setQueuedMessages((prev) => [...prev, { content: trimmedInput, images: pastedImages.length > 0 ? [...pastedImages] : undefined }])
        setInput('')
        setPastedImages([])
        // Reset textarea height
        if (inputRef.current) {
          inputRef.current.style.height = 'auto'
        }
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Folder selection screen
  if (!workingDirectory) {
    return (
      <div className="flex h-full flex-col bg-brand-bg">
        <AppHeader
          user={user}
          onLogout={onLogout}
          variant="build"
          workingDirectory={workingDirectory}
          workspaces={workspaces}
          activeWorkspace={activeWorkspaceProp}
          onSwitchWorkspace={onSwitchWorkspaceProp}
          onBackToProjects={handleBackToProjects}
          onOpenMemory={() => setIsMemoryDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          memoryCount={memories.length}
          skillsCount={skillsCount}
          skillsVersion={skillsVersion}
          skillsLastSync={skillsLastSync}
          isSyncingSkills={isSyncingSkills}
          onSyncSkills={handleSyncSkills}
        />
        <Header
          workingDirectory={null}
          onSelectFolder={handleSelectFolder}
          sessions={[]}
          currentSessionId={null}
          currentSessionTitle=""
          onLoadSession={() => {}}
          onNewSession={() => {}}
          onRenameSession={() => {}}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-4xl">📁</div>
            <h2 className="mb-2 text-lg font-semibold text-brand-text">Select a project folder</h2>
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

  // Category colour mapping (matches ConnText main app)
  const getCategoryColor = (category: string | null): { border: string; bg: string; text: string; dot: string; icon: React.ReactNode } => {
    const s = 13
    switch (category) {
      case 'essentials': return { border: 'border-cyan-500/30', bg: 'bg-cyan-500/6', text: 'text-cyan-400', dot: 'bg-cyan-400', icon: <Blocks size={s} className="text-cyan-400" /> }
      case 'core': return { border: 'border-amber-500/30', bg: 'bg-amber-500/6', text: 'text-amber-400', dot: 'bg-amber-400', icon: <Lightbulb size={s} className="text-amber-400" /> }
      case 'usability': return { border: 'border-blue-500/30', bg: 'bg-blue-500/6', text: 'text-blue-400', dot: 'bg-blue-400', icon: <Users size={s} className="text-blue-400" /> }
      case 'engagement': return { border: 'border-rose-500/30', bg: 'bg-rose-500/6', text: 'text-rose-400', dot: 'bg-rose-400', icon: <Heart size={s} className="text-rose-400" /> }
      case 'expansion': return { border: 'border-emerald-500/30', bg: 'bg-emerald-500/6', text: 'text-emerald-400', dot: 'bg-emerald-400', icon: <TrendingUp size={s} className="text-emerald-400" /> }
      case 'monetisation': return { border: 'border-violet-500/30', bg: 'bg-violet-500/6', text: 'text-violet-400', dot: 'bg-violet-400', icon: <DollarSign size={s} className="text-violet-400" /> }
      case 'technical': return { border: 'border-slate-400/30', bg: 'bg-slate-500/6', text: 'text-slate-400', dot: 'bg-slate-400', icon: <Cpu size={s} className="text-slate-400" /> }
      case 'uiux': return { border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/6', text: 'text-fuchsia-400', dot: 'bg-fuchsia-400', icon: <Palette size={s} className="text-fuchsia-400" /> }
      case 'integration': return { border: 'border-teal-500/30', bg: 'bg-teal-500/6', text: 'text-teal-400', dot: 'bg-teal-400', icon: <Link2 size={s} className="text-teal-400" /> }
      case 'refactor': return { border: 'border-orange-500/30', bg: 'bg-orange-500/6', text: 'text-orange-400', dot: 'bg-orange-400', icon: <RefreshCw size={s} className="text-orange-400" /> }
      case 'system': return { border: 'border-gray-500/30', bg: 'bg-gray-500/6', text: 'text-gray-400', dot: 'bg-gray-400', icon: <Cog size={s} className="text-gray-400" /> }
      default: return { border: 'border-brand-border/40', bg: 'bg-brand-card/40', text: 'text-brand-text-dim', dot: 'bg-brand-text-dim', icon: <Layers size={s} className="text-brand-text-dim" /> }
    }
  }

  const getStatusBadge = (status: ProjectFeature['status']) => {
    // Map API colour names to Tailwind border/text classes
    const colorMap: Record<string, { border: string; text: string }> = {
      green: { border: 'border-emerald-400/40', text: 'text-emerald-400' },
      blue: { border: 'border-blue-400/40', text: 'text-blue-400' },
      purple: { border: 'border-purple-400/40', text: 'text-purple-400' },
      red: { border: 'border-red-400/40', text: 'text-red-400' },
      amber: { border: 'border-amber-400/40', text: 'text-amber-400' },
      slate: { border: 'border-slate-400/40', text: 'text-slate-400' },
      neutral: { border: 'border-brand-text-dim/30', text: 'text-brand-text-dim' },
    }
    const s = colorMap[status.color] || colorMap.neutral
    return (
      <span className={`shrink-0 rounded-md border bg-transparent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${s.border} ${s.text}`}>
        {status.label}
      </span>
    )
  }

  const getPriorityBadge = (priority: ProjectFeature['priority']) => {
    if (!priority || priority.value === 'none') return null
    const styles: Record<string, { border: string; text: string }> = {
      high: { border: 'border-red-400/40', text: 'text-red-400' },
      medium: { border: 'border-amber-400/40', text: 'text-amber-400' },
      low: { border: 'border-sky-400/40', text: 'text-sky-400' },
    }
    const s = styles[priority.value] || { border: 'border-brand-text-dim/30', text: 'text-brand-text-dim' }
    return (
      <span className={`shrink-0 rounded-md border bg-transparent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${s.border} ${s.text}`}>
        {priority.label}
      </span>
    )
  }

  // Group features: parents first, then children nested under them
  const groupedFeatures = (() => {
    const parents = projectFeatures.filter(f => !f.parent_feature_id)
    const childMap = new Map<string, ProjectFeature[]>()
    for (const f of projectFeatures) {
      if (f.parent_feature_id) {
        const children = childMap.get(f.parent_feature_id) || []
        children.push(f)
        childMap.set(f.parent_feature_id, children)
      }
    }
    return { parents, childMap }
  })()

  // Status summary counts
  const statusCounts = (() => {
    const counts: Record<string, number> = {}
    for (const f of projectFeatures) {
      counts[f.status.value] = (counts[f.status.value] || 0) + 1
    }
    return counts
  })()

  // Left pane content
  const leftPaneContent = (
    <div className="flex h-full flex-col" style={{ background: 'linear-gradient(180deg, rgba(20,20,22,0.95) 0%, rgba(10,10,11,0.98) 100%)' }}>
      {/* Header */}
      <div className="border-b border-brand-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-brand-purple-soft" />
            <h3 className="text-xs font-semibold tracking-wide uppercase text-brand-text-secondary">Features</h3>
            {projectFeatures.length > 0 && (
              <span className="rounded-full bg-brand-purple/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-brand-purple-soft">
                {projectFeatures.length}
              </span>
            )}
          </div>
          <button
            onClick={loadFeatures}
            disabled={isFeaturesLoading}
            className="cursor-pointer rounded-md p-1 text-brand-text-dim transition-all hover:bg-brand-card hover:text-brand-text-muted disabled:opacity-40"
            title="Refresh features"
          >
            <RefreshCw size={13} className={isFeaturesLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Status summary bar */}
        {projectFeatures.length > 0 && (
          <div className="mt-2.5 flex gap-1 overflow-hidden rounded-full" style={{ height: '3px' }}>
            {statusCounts['completed'] > 0 && (
              <div
                className="bg-emerald-400/80"
                style={{ flex: statusCounts['completed'] }}
                title={`${statusCounts['completed']} completed`}
              />
            )}
            {statusCounts['in_progress'] > 0 && (
              <div
                className="bg-amber-400/80"
                style={{ flex: statusCounts['in_progress'] }}
                title={`${statusCounts['in_progress']} in progress`}
              />
            )}
            {statusCounts['ready_for_development'] > 0 && (
              <div
                className="bg-sky-400/80"
                style={{ flex: statusCounts['ready_for_development'] }}
                title={`${statusCounts['ready_for_development']} ready`}
              />
            )}
            {statusCounts['draft'] > 0 && (
              <div
                className="bg-brand-text-dim/40"
                style={{ flex: statusCounts['draft'] }}
                title={`${statusCounts['draft']} draft`}
              />
            )}
            {statusCounts['rejected'] > 0 && (
              <div
                className="bg-red-400/60"
                style={{ flex: statusCounts['rejected'] }}
                title={`${statusCounts['rejected']} rejected`}
              />
            )}
          </div>
        )}
      </div>

      {/* Feature list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {isFeaturesLoading && projectFeatures.length === 0 ? (
          <div className="space-y-2 px-3 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-brand-card/60 p-3" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="mb-2 h-3 w-3/4 rounded bg-brand-border/40" />
                <div className="h-2 w-1/2 rounded bg-brand-border/20" />
              </div>
            ))}
          </div>
        ) : featuresError ? (
          <div className="px-4 py-6 text-center">
            <AlertCircle size={20} className="mx-auto mb-2 text-red-400/60" />
            <p className="text-xs text-red-400/80">{featuresError}</p>
            <button
              onClick={loadFeatures}
              className="mt-2 cursor-pointer text-xs text-brand-purple-soft transition-colors hover:text-brand-purple"
            >
              Try again
            </button>
          </div>
        ) : projectFeatures.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-card/80 ring-1 ring-brand-border/30">
              <Layers size={18} className="text-brand-text-dim" />
            </div>
            <p className="text-xs font-medium text-brand-text-muted">No features yet</p>
            <p className="mt-0.5 text-[11px] text-brand-text-dim">
              {selectedProject ? 'Add features in ConnText' : 'Select a project'}
            </p>
          </div>
        ) : (
          <div className="space-y-1 px-1.5">
            {groupedFeatures.parents.map((feature) => {
              const children = groupedFeatures.childMap.get(feature.id) || []
              const cat = getCategoryColor(feature.brainstorm_category)
              const categoryLabel = feature.brainstorm_category
                ? feature.brainstorm_category.replace(/_/g, ' ').replace(/uiux/i, 'UI/UX').toUpperCase()
                : null

              return (
                <div key={feature.id} className="rounded-lg border border-brand-border/30 bg-brand-card/30 transition-colors hover:bg-brand-card/50">
                  <div className="px-3 py-2.5">
                    {/* Top row: icon + title left, category right */}
                    <div className="flex items-center gap-2">
                      {/* Category icon */}
                      <span className="shrink-0 leading-none">{cat.icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-brand-text">
                          {feature.title}
                        </span>
                      </div>

                      {/* Category name — capitalised, larger, with border */}
                      {categoryLabel && (
                        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${cat.border} ${cat.text}`} style={{ opacity: 0.7 }}>
                          {categoryLabel}
                        </span>
                      )}
                    </div>

                    {/* Status + priority badges row — below title */}
                    <div className="mt-1.5 flex items-center gap-1.5 pl-[21px]">
                      {getStatusBadge(feature.status)}
                      {getPriorityBadge(feature.priority)}
                      {feature.prd_summary_status === 'generated' && (
                        <span className="text-[9px] font-medium text-emerald-400/50">PRD</span>
                      )}
                      {feature.spec_status === 'generated' && (
                        <span className="text-[9px] font-medium text-sky-400/50">Spec</span>
                      )}
                    </div>

                    {/* Description — always visible */}
                    {feature.description && (
                      <p className="mt-1.5 pl-4 text-[11px] leading-relaxed text-brand-text-muted line-clamp-2">
                        {feature.description}
                      </p>
                    )}

                    {/* Labels */}
                    {feature.labels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                        {feature.labels.slice(0, 3).map((label) => (
                          <span
                            key={label.id}
                            className="rounded bg-brand-border/20 px-1.5 py-0.5 text-[9px] font-medium text-brand-text-dim"
                          >
                            {label.name}
                          </span>
                        ))}
                        {feature.labels.length > 3 && (
                          <span className="text-[9px] text-brand-text-dim">+{feature.labels.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Discuss & Build buttons */}
                    <div className="mt-2 pl-[21px] flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const prompt = `I'd like to discuss the feature: "${feature.title}"${feature.description ? `\n\nDescription:\n${feature.description}` : ''}${feature.content ? `\n\nFeature Content:\n${feature.content}` : ''}\n\nBased ONLY on the title, description, and content above, identify what's unclear or missing to fully scope this feature. Focus on:\n- Unclear requirements or ambiguous wording\n- Missing acceptance criteria\n- Undefined user flows or interactions\n- Technical decisions that need input\n\nDo NOT search the codebase, read files, or explore anything. Work solely from the information provided above.\n\nYou MUST use the mcp__customTools__ask_user tool to present your questions to me interactively. Group related questions together and provide options where appropriate. After I answer, summarise the refined feature scope.`
                          const displayMsg = `💬 Discussing feature: **${feature.title}**`
                          handleSend(prompt, displayMsg)
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-purple/30 bg-transparent px-2 py-1 text-[10px] font-medium text-brand-purple-soft transition-colors hover:border-brand-purple/50 hover:bg-brand-purple/10"
                      >
                        <MessageSquare size={11} />
                        Discuss
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const slug = feature.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                          const prdPath = `docs/features/${slug}-prd.md`
                          const featureData = [
                            `**Title:** ${feature.title}`,
                            feature.description ? `**Description:** ${feature.description}` : '',
                            feature.content ? `**Feature Content:**\n${feature.content}` : '',
                            feature.prd_summary ? `**PRD Summary:**\n${feature.prd_summary}` : '',
                            feature.spec ? `**Spec:**\n${feature.spec}` : '',
                          ].filter(Boolean).join('\n\n')

                          const prompt = `Build feature from PRD: "${feature.title}"

Here is all the feature data from ConnText:

${featureData}

**INSTRUCTIONS — Follow these steps in order:**

**Step 1: Create PRD document (if it doesn't exist)**
Check if the file \`${prdPath}\` exists in the working directory.
- If it does NOT exist:
  1. Create the \`docs/features/\` directory structure if needed
  2. Write a comprehensive, well-structured PRD markdown document at \`${prdPath}\`
  3. The PRD MUST include an \`## Implementation Tasks\` section with checkbox items (\`- [ ]\`) covering all implementation work
  4. Derive implementation tasks from all the feature data provided above
  5. Include clear subtasks under each main task (indented with 2 spaces: \`  - [ ]\`)
  6. Include a feature overview, user stories, and acceptance criteria sections before the implementation tasks
- If it already exists, skip to Step 2

**Step 2: Run Feature Build**
Once the PRD file exists, run the skill:
/conntext-feature-build ${prdPath}`

                          const displayMsg = `🔨 Building feature: **${feature.title}**`
                          handleSend(prompt, displayMsg)
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/30 bg-transparent px-2 py-1 text-[10px] font-medium text-emerald-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
                      >
                        <Hammer size={11} />
                        Build
                      </button>
                    </div>
                  </div>

                  {/* Children / extensions */}
                  {children.length > 0 && (
                    <div className="border-t border-brand-border/20 px-3 py-1.5">
                      <div className="space-y-0.5 pl-3 border-l border-brand-border/15">
                        {children.map((child) => {
                          const childCat = getCategoryColor(child.brainstorm_category)
                          return (
                            <div
                              key={child.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1"
                            >
                              <span className="shrink-0">{childCat.icon}</span>
                              <span className="min-w-0 flex-1 truncate text-[11px] text-brand-text-secondary">
                                {child.title}
                              </span>
                              {getStatusBadge(child.status)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer status legend */}
      {projectFeatures.length > 0 && (
        <div className="border-t border-brand-border/40 px-4 py-2">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {Object.entries(statusCounts).map(([status, count]) => {
              // Find a feature with this status to get the API colour
              const sampleFeature = projectFeatures.find(f => f.status.value === status)
              const statusObj = { value: status, label: `${count}`, color: sampleFeature?.status.color || 'neutral' }
              return (
                <span key={status} className="inline-flex items-center gap-1 text-[10px] text-brand-text-dim">
                  {getStatusBadge(statusObj)}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // Right pane content (chat)
  const rightPaneContent = (
    <div className="flex h-full flex-col bg-brand-bg">
      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {turns.length === 0 && (
            <div className="py-20 text-center">
              <h2 className="mb-2 text-lg font-semibold text-brand-text">Start building</h2>
              <p className="text-sm text-brand-text-muted">
                Send a message to begin working in{' '}
                <span className="text-brand-purple">{workingDirectory}</span>
              </p>
            </div>
          )}

          {(() => {
            const hiddenCount = Math.max(0, turns.length - visibleTurnCount)
            const visibleTurns = hiddenCount > 0 ? turns.slice(-visibleTurnCount) : turns
            return (
              <>
                {hiddenCount > 0 && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={() => setVisibleTurnCount(prev => prev + 10)}
                      className="cursor-pointer rounded-full border border-brand-border/50 bg-brand-card/50 px-4 py-1.5 text-xs text-brand-text-muted transition-colors hover:bg-brand-card hover:text-brand-text"
                    >
                      Load {Math.min(hiddenCount, 10)} earlier message{Math.min(hiddenCount, 10) !== 1 ? 's' : ''} ({hiddenCount} hidden)
                    </button>
                  </div>
                )}
                {visibleTurns.map((turn) => (
                  <TurnBlock
                    key={turn.id}
                    turn={turn}
                    liveElapsed={turn.id === activeTurnIdRef.current ? elapsed : null}
                    onFileClick={(path) => { console.log('[FileClick] path:', path); setPreviewFilePath(path) }}
                    pendingQuestions={turn.id === activeTurnIdRef.current ? pendingQuestions : []}
                    onQuestionSubmit={handleQuestionSubmit}
                    onQuestionCancel={handleQuestionCancel}
                    onRewind={turn.checkpointId && !isStreaming ? handleRewind : undefined}
                    isRewinding={rewindingTurnId === turn.id}
                  />
                ))}
              </>
            )
          })()}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-brand-border px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* Slash command hint */}
          {(() => {
            const filteredCommands = getFilteredCommands()
            const showCommands = input.startsWith('/') && !input.includes(' ') && filteredCommands.length > 0

            if (!showCommands) return null

            return (
              <div className="mb-2 rounded-lg border border-brand-border/50 bg-brand-card/50 px-2 py-2">
                <div className="text-xs text-brand-text-muted">
                  <div className="mb-1 px-1.5 font-medium text-brand-text">Available commands:</div>
                  <div className="space-y-0.5">
                    {filteredCommands.map((cmd, index) => (
                      <button
                        key={cmd.command}
                        onClick={() => executeCommand(cmd.command, true)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          index === selectedCommandIndex
                            ? 'bg-brand-purple/10 text-brand-text'
                            : 'hover:bg-brand-border/30 text-brand-text-muted'
                        }`}
                      >
                        <code className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                          index === selectedCommandIndex
                            ? 'bg-brand-purple/20 text-brand-purple'
                            : 'bg-brand-bg text-brand-purple'
                        }`}>
                          {cmd.command} {cmd.args}
                        </code>
                        <span className="flex-1 text-xs">{cmd.description}</span>
                        {index === selectedCommandIndex && (
                          <span className="text-[10px] text-brand-text-dim">↵</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-brand-border/30 pt-2 px-1.5 text-[10px] text-brand-text-dim">
                    <span>↑↓ Navigate</span>
                    <span>•</span>
                    <span>↵ Run</span>
                    <span>•</span>
                    <span>Tab Add Params</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* File mention autocomplete */}
          {fileSuggestions.length > 0 && (
            <div className="mb-2 rounded-lg border border-brand-border/50 bg-brand-card/50 px-2 py-2">
              <div className="mb-1.5 px-1.5 text-xs font-medium text-brand-text">Files</div>
              <div className="space-y-0.5 max-h-56 overflow-y-auto">
                {fileSuggestions.map((file, index) => {
                  const parts = file.split('/')
                  const fileName = parts[parts.length - 1]
                  const dirPath = parts.slice(0, -1).join('/')
                  return (
                    <button
                      key={file}
                      onClick={() => insertFileSuggestion(file)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${
                        index === selectedFileIndex
                          ? 'bg-brand-purple/10 text-brand-text'
                          : 'hover:bg-brand-border/30 text-brand-text-muted'
                      }`}
                    >
                      <code className={`rounded px-2 py-0.5 font-mono text-sm font-medium ${
                        index === selectedFileIndex
                          ? 'bg-brand-purple/20 text-brand-purple'
                          : 'bg-brand-bg text-brand-purple'
                      }`}>
                        {fileName}
                      </code>
                      {dirPath && (
                        <span className="truncate text-xs text-brand-text-dim">{dirPath}</span>
                      )}
                      {index === selectedFileIndex && (
                        <span className="ml-auto flex-shrink-0 text-[11px] text-brand-text-dim">Tab / ↵</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-brand-border/30 pt-2 px-1.5 text-[11px] text-brand-text-dim">
                <span>↑↓ Navigate</span>
                <span>•</span>
                <span>Tab / ↵ Select</span>
                <span>•</span>
                <span>Esc Dismiss</span>
              </div>
            </div>
          )}

          {/* Save to memory hint */}
          {input.toLowerCase().startsWith('save') && !memoryExists && (
            <div className="mb-2 rounded-lg border border-brand-border/50 bg-brand-card/50 px-3 py-2">
              <div className="text-xs text-brand-text-muted">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>Memory not initialized. Use <code className="rounded bg-brand-bg px-1 py-0.5 font-mono text-brand-purple">/init</code> first.</span>
                </div>
              </div>
            </div>
          )}

          {/* Queued messages indicator */}
          {queuedMessages.length > 0 && (
            <div className="mb-2 rounded-lg border border-brand-purple/30 bg-brand-purple/5 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
                <span className="font-medium text-brand-purple">
                  {queuedMessages.length} {queuedMessages.length === 1 ? 'message' : 'messages'} queued
                </span>
                <button
                  onClick={() => setQueuedMessages([])}
                  className="ml-auto text-brand-text-dim hover:text-brand-text transition-colors"
                  title="Clear queue"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Image previews */}
          {pastedImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pastedImages.map((img, index) => (
                <div key={index} className="group relative">
                  <img
                    src={`data:${img.mediaType};base64,${img.data}`}
                    alt={`Pasted image ${index + 1}`}
                    className="h-20 w-20 rounded-lg border border-brand-border object-cover"
                  />
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-purple text-white opacity-0 transition-opacity hover:bg-brand-purple-dim group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File attachment previews */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachedFiles.map((filePath, index) => (
                <div key={index} className="group flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-card px-2.5 py-1.5 text-xs text-brand-text">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-brand-purple">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span className="max-w-[200px] truncate">{filePath.split(/[/\\]/).pop()}</span>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-brand-text-dim opacity-0 transition-opacity hover:bg-brand-purple hover:text-white group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Agent-style input container */}
          <div
            className={`relative rounded-2xl border bg-brand-card/80 backdrop-blur-sm shadow-lg transition-colors ${isDragOver ? 'border-brand-purple bg-brand-purple/5' : 'border-brand-border/50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Folder context selector */}
            <FolderSelector
              activeFolders={activeFolders}
              chosenFolders={chosenFolders}
              onActiveFoldersChange={setActiveFolders}
              onChosenFoldersChange={setChosenFolders}
              projectId={selectedProject?.id ?? null}
              workingDirectory={workingDirectory}
              disabled={isStreaming}
            />
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Action Menu Button */}
              <div className="action-menu-container relative flex-shrink-0">
                <button
                  onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-full bg-brand-purple/10 px-3 py-1.5 text-xs font-medium text-brand-purple transition-all hover:bg-brand-purple/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Add attachments"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Add</span>
                </button>

                {/* Dropdown Menu */}
                {isActionMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-brand-border bg-brand-card shadow-2xl ring-1 ring-black/5">
                    <div className="p-1.5">
                      <button
                        onClick={handleAddImage}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-brand-text transition-colors hover:bg-brand-purple/10"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-purple/10">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                          </svg>
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Add Image</span>
                          <span className="text-xs text-brand-text-dim">Upload image files</span>
                        </div>
                      </button>

                      <button
                        onClick={handleAddFile}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-brand-text transition-colors hover:bg-brand-purple/10"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-purple/10">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                          </svg>
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Add File</span>
                          <span className="text-xs text-brand-text-dim">Attach a file reference</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask, search, or build something..."
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-brand-text placeholder-brand-text-dim/60 outline-none"
                style={{ maxHeight: '150px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 150)}px`
                }}
              />

              {/* Status indicator */}
              {isStreaming && (
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 text-xs text-brand-text-dim">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-purple" />
                  <span>Working</span>
                </div>
              )}

              {/* Send/Stop/Queue button */}
              <button
                onClick={() => {
                  if (isStreaming && !input.trim() && pastedImages.length === 0 && attachedFiles.length === 0) {
                    handleStop()
                  } else {
                    handleSend()
                  }
                }}
                disabled={!isStreaming && !input.trim() && pastedImages.length === 0 && attachedFiles.length === 0}
                className="flex-shrink-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-brand-purple text-white transition-all hover:bg-brand-purple-dim hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                title={
                  isStreaming && !input.trim() && pastedImages.length === 0 && attachedFiles.length === 0
                    ? 'Stop response'
                    : isStreaming
                    ? 'Queue message'
                    : 'Send message'
                }
              >
                {isStreaming && !input.trim() && pastedImages.length === 0 && attachedFiles.length === 0 ? (
                  // Stop icon
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : isStreaming ? (
                  // Queue icon (layers)
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
                  </svg>
                ) : (
                  // Send icon
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                )}
              </button>
            </div>

            {/* Bottom bar: model selector */}
            <div className="flex items-center border-t border-brand-border/30 px-3 py-1.5">
              <div className="model-dropdown-container relative">
                <button
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-brand-text-dim transition-colors hover:bg-brand-purple/10 hover:text-brand-text"
                >
                  {AVAILABLE_MODELS.find(m => m.value === selectedModel)?.label || 'Model'}
                  <ChevronDown size={12} />
                </button>

                {isModelDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-brand-border bg-brand-card shadow-xl">
                    {AVAILABLE_MODELS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => {
                          setSelectedModel(model.value)
                          setIsModelDropdownOpen(false)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-brand-purple/10 first:rounded-t-lg last:rounded-b-lg ${
                          selectedModel === model.value ? 'bg-brand-purple/5 text-brand-purple' : 'text-brand-text'
                        }`}
                      >
                        <div>
                          <div className="font-medium">{model.label}</div>
                          <div className="text-[10px] text-brand-text-dim">{model.description}</div>
                        </div>
                        {selectedModel === model.value && (
                          <Check size={14} className="text-brand-purple" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Context size indicator */}
          {turns.length > 0 && (
            <div className="mt-1.5 flex items-center justify-between px-1 text-[13px] font-semibold text-white/40">
              <div className="flex items-center gap-2">
                {isCompacting ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
                    Compacting context...
                  </span>
                ) : (
                  <span>
                    ~{contextTokens >= 1000 ? `${(contextTokens / 1000).toFixed(1)}k` : contextTokens} tokens
                    {' '}
                    <span className="text-white/25">/ ~200k</span>
                  </span>
                )}
              </div>
              <div>
                {turns.length} turn{turns.length !== 1 ? 's' : ''}
                {turns.reduce((sum, t) => sum + (t.costUsd || 0), 0) > 0 && (
                  <span className="ml-2">
                    ${turns.reduce((sum, t) => sum + (t.costUsd || 0), 0).toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-brand-bg">
      <AppHeader
        user={user}
        onLogout={onLogout}
        variant="build"
        workingDirectory={workingDirectory}
        workspaces={workspaces}
        activeWorkspace={activeWorkspaceProp}
        onSwitchWorkspace={onSwitchWorkspaceProp}
        onOpenSettings={() => setIsSettingsOpen(true)}
        memoryCount={memories.length}
        onOpenMemory={() => setIsMemoryDialogOpen(true)}
        onBackToProjects={handleBackToProjects}
        skillsCount={skillsCount}
        skillsVersion={skillsVersion}
        skillsLastSync={skillsLastSync}
        isSyncingSkills={isSyncingSkills}
        onSyncSkills={handleSyncSkills}
      />
      <Header
        workingDirectory={workingDirectory}
        onSelectFolder={handleSelectFolder}
        sessions={sessions}
        currentSessionId={sessionId}
        currentSessionTitle={currentSessionTitle}
        onLoadSession={handleLoadSession}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
      />

      {/* Resizable two-pane layout */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanes
          leftPane={leftPaneContent}
          rightPane={rightPaneContent}
          defaultLeftWidth={300}
          minLeftWidth={200}
          minRightWidth={400}
        />
      </div>

      {/* Memory Dialog */}
      <MemoryDialog
        isOpen={isMemoryDialogOpen}
        onClose={() => setIsMemoryDialogOpen(false)}
        onRefresh={() => workingDirectory && loadMemories(workingDirectory)}
        memories={memories}
        workingDirectory={workingDirectory}
      />

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {workingDirectory && previewFilePath && (
        <FilePreviewDialog
          isOpen={!!previewFilePath}
          onClose={() => setPreviewFilePath(null)}
          filePath={previewFilePath}
          workingDirectory={workingDirectory}
        />
      )}
    </div>
  )
}

// ===== Helpers =====

/** Count how many "groups" of tool usage have occurred (each tool_result ends a group) */
function countToolGroups(events: ToolEvent[]): number {
  let count = 0
  for (const e of events) {
    if (e.type === 'tool_result') count++
  }
  return count
}

interface ToolEventGroup {
  toolUse: ToolEvent
  toolResult?: ToolEvent
}

function groupToolEvents(events: ToolEvent[]): ToolEventGroup[] {
  const groups: ToolEventGroup[] = []
  let i = 0

  while (i < events.length) {
    const event = events[i]

    if (event.type === 'tool_use') {
      const group: ToolEventGroup = { toolUse: event }

      // Check if next event is tool_result
      if (i + 1 < events.length && events[i + 1].type === 'tool_result') {
        group.toolResult = events[i + 1]
        i += 2 // Skip both events
      } else {
        i += 1 // Only skip tool_use
      }

      groups.push(group)
    } else {
      // Standalone tool_result (shouldn't normally happen, but handle it)
      i += 1
    }
  }

  return groups
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

// ===== Sub-components =====

const Header = memo(function Header({
  workingDirectory,
  onSelectFolder,
  sessions,
  currentSessionId,
  currentSessionTitle,
  onLoadSession,
  onNewSession,
  onRenameSession
}: {
  workingDirectory: string | null
  onSelectFolder: () => void
  sessions: SessionMetadata[]
  currentSessionId: string | null
  currentSessionTitle: string
  onLoadSession: (sessionId: string) => void
  onNewSession: () => void
  onRenameSession: (sessionId: string, newTitle: string) => void
}) {
  const [showSessionDropdown, setShowSessionDropdown] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSessionDropdown(false)
      }
    }
    if (showSessionDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSessionDropdown])

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingSessionId])

  const startRenaming = (sessionId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(sessionId)
    setEditingTitle(currentTitle)
  }

  const confirmRename = (sessionId: string) => {
    const trimmed = editingTitle.trim()
    if (trimmed) {
      onRenameSession(sessionId, trimmed)
    }
    setEditingSessionId(null)
  }

  const cancelRename = () => {
    setEditingSessionId(null)
  }

  if (!workingDirectory) return null

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex items-center justify-between border-b border-brand-border/50 px-4 py-1.5">
      {/* Left: Folder location */}
      <div className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <button
          onClick={onSelectFolder}
          className="cursor-pointer text-xs font-mono text-brand-text-muted transition-colors hover:text-brand-text"
          title="Change folder"
        >
          {workingDirectory}
        </button>
      </div>

      {/* Right: Session selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowSessionDropdown(!showSessionDropdown)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-brand-border/30 cursor-pointer"
          title="Switch session"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="font-mono text-brand-text-muted max-w-[200px] truncate">
            {currentSessionId ? (currentSessionTitle || 'Current Session') : 'New Session'}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {/* Dropdown */}
        {showSessionDropdown && (
          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-brand-border bg-brand-card shadow-xl">
            <div className="max-h-96 overflow-y-auto">
              {/* New Session Button */}
              <div className="border-b border-brand-border/50 p-2">
                <button
                  onClick={() => {
                    onNewSession()
                    setShowSessionDropdown(false)
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-purple-dim cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  New Session
                </button>
              </div>

              {/* Current session */}
              {currentSessionId ? (
                <div className="border-b border-brand-border/50 p-2">
                  <div className="group rounded-lg bg-brand-purple/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-purple animate-pulse" />
                        <span className="text-xs font-medium text-brand-purple">Current Session</span>
                      </div>
                      {editingSessionId !== currentSessionId && (
                        <button
                          onClick={(e) => startRenaming(currentSessionId, currentSessionTitle || 'Untitled Session', e)}
                          className="cursor-pointer rounded p-0.5 text-brand-purple/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-purple hover:bg-brand-purple/10"
                          title="Rename session"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {editingSessionId === currentSessionId ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmRename(currentSessionId)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          className="flex-1 rounded border border-brand-purple/40 bg-brand-input px-2 py-1 text-sm text-brand-text outline-none focus:border-brand-purple"
                        />
                        <button
                          onClick={() => confirmRename(currentSessionId)}
                          className="cursor-pointer rounded p-1 text-green-400 hover:bg-green-400/10"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelRename}
                          className="cursor-pointer rounded p-1 text-brand-text-dim hover:bg-white/5"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-brand-text truncate">
                          {currentSessionTitle || 'Untitled Session'}
                        </p>
                        <p className="text-xs font-mono text-brand-text-dim truncate mt-0.5">
                          {currentSessionId.slice(0, 8)}...
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-b border-brand-border/50 p-2">
                  <div className="rounded-lg bg-brand-border/30 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <span className="text-xs font-medium text-brand-text-muted">New Session</span>
                    </div>
                    <p className="text-xs text-brand-text-dim">
                      Session will be created when you send your first message
                    </p>
                  </div>
                </div>
              )}

              {/* Previous sessions */}
              <div className="p-1">
                <div className="px-3 py-1.5">
                  <span className="text-xs font-medium text-brand-text-dim">Previous Sessions</span>
                </div>
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-brand-text-dim">
                    No previous sessions found
                  </div>
                ) : (
                  sessions
                    .filter(s => s.sessionId !== currentSessionId)
                    .map((session) => (
                      <div
                        key={session.sessionId}
                        className="group relative rounded-lg px-3 py-2 transition-colors hover:bg-brand-purple/10"
                      >
                        {editingSessionId === session.sessionId ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmRename(session.sessionId)
                                if (e.key === 'Escape') cancelRename()
                              }}
                              className="flex-1 rounded border border-brand-purple/40 bg-brand-input px-2 py-1 text-sm text-brand-text outline-none focus:border-brand-purple"
                            />
                            <button
                              onClick={() => confirmRename(session.sessionId)}
                              className="cursor-pointer rounded p-1 text-green-400 hover:bg-green-400/10"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelRename}
                              className="cursor-pointer rounded p-1 text-brand-text-dim hover:bg-white/5"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              onLoadSession(session.sessionId)
                              setShowSessionDropdown(false)
                            }}
                            className="w-full text-left cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                onLoadSession(session.sessionId)
                                setShowSessionDropdown(false)
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium text-brand-text truncate flex-1">
                                {session.title}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); startRenaming(session.sessionId, session.title, e) }}
                                  className="cursor-pointer rounded p-0.5 text-brand-text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-text hover:bg-white/5"
                                  title="Rename session"
                                >
                                  <Pencil size={12} />
                                </button>
                                <span className="text-xs text-brand-text-dim whitespace-nowrap">
                                  {formatDate(session.timestamp)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-brand-text-dim">
                              <span>{session.turnsCount} turns</span>
                              {session.totalCost > 0 && (
                                <span>${session.totalCost.toFixed(4)}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

// Regex to detect file paths in text
// Matches: ./foo, ../foo, /foo, C:\foo, .hidden/foo/bar.ext, and bare relative paths like src/foo/bar.ext
const FILE_PATH_REGEX = /(?:^|\s)((?:\.{1,2}\/|\/|[A-Za-z]:\\)[\w\-./\\]+\.\w+|(?:\.?[a-zA-Z][\w\-.]*\/)+[\w\-.]+\.\w+)/g

function makeFilePathsClickable(nodeChildren: React.ReactNode, onFileClick: (path: string) => void): React.ReactNode {
  const processNode = (node: React.ReactNode): React.ReactNode => {
    if (typeof node !== 'string') return node

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    const regex = new RegExp(FILE_PATH_REGEX.source, 'g')
    let match: RegExpExecArray | null

    while ((match = regex.exec(node)) !== null) {
      const path = match[1]
      const matchStart = match.index + (match[0].length - match[1].length)
      if (matchStart > lastIndex) {
        parts.push(node.slice(lastIndex, matchStart))
      }
      parts.push(
        <span
          key={matchStart}
          className="cursor-pointer rounded bg-brand-purple/10 px-1 py-0.5 font-mono text-[0.9em] text-brand-purple-soft transition-colors hover:bg-brand-purple/20 hover:text-brand-purple"
          onClick={(e) => {
            e.stopPropagation()
            onFileClick(path)
          }}
          title="Click to preview file"
        >
          {path}
        </span>
      )
      lastIndex = match.index + match[0].length
    }

    if (parts.length === 0) return node
    if (lastIndex < node.length) parts.push(node.slice(lastIndex))
    return <>{parts}</>
  }

  return Array.isArray(nodeChildren)
    ? nodeChildren.map(processNode)
    : processNode(nodeChildren)
}

function ClickableMarkdown({ children, onFileClick }: { children: string; onFileClick?: (path: string) => void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Make inline code with file-like paths clickable
        code: ({ children: codeChildren, className }) => {
          const text = String(codeChildren)
          if (!className && onFileClick && /^(?:(?:\.{1,2}\/|\/|[A-Za-z]:\\)[\w\-./\\]+\.\w+|(?:\.?[a-zA-Z][\w\-.]*\/)+[\w\-.]+\.\w+)$/.test(text.trim())) {
            return (
              <code
                className="cursor-pointer rounded bg-brand-purple/10 px-1.5 py-0.5 text-brand-purple-soft transition-colors hover:bg-brand-purple/20 hover:text-brand-purple"
                onClick={(e) => {
                  e.stopPropagation()
                  onFileClick(text.trim())
                }}
                title="Click to preview file"
              >
                {text}
              </code>
            )
          }
          return <code className={className}>{codeChildren}</code>
        },
        // Intercept all links — prevent navigation, open file paths in preview
        a: ({ href, children: aChildren }) => {
          const handleClick = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (onFileClick && href) {
              onFileClick(href)
            }
          }
          return (
            <span
              className="cursor-pointer rounded bg-brand-purple/10 px-1 py-0.5 font-mono text-[0.9em] text-brand-purple-soft transition-colors hover:bg-brand-purple/20 hover:text-brand-purple"
              onClick={handleClick}
              title="Click to preview file"
            >
              {aChildren}
            </span>
          )
        },
        p: ({ children: pChildren }) => {
          if (!onFileClick) return <p>{pChildren}</p>
          return <p>{makeFilePathsClickable(pChildren, onFileClick)}</p>
        },
        li: ({ children: liChildren }) => {
          if (!onFileClick) return <li>{liChildren}</li>
          return <li>{makeFilePathsClickable(liChildren, onFileClick)}</li>
        },
        strong: ({ children: strongChildren }) => {
          if (!onFileClick) return <strong>{strongChildren}</strong>
          return <strong>{makeFilePathsClickable(strongChildren, onFileClick)}</strong>
        },
        em: ({ children: emChildren }) => {
          if (!onFileClick) return <em>{emChildren}</em>
          return <em>{makeFilePathsClickable(emChildren, onFileClick)}</em>
        }
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

const TurnBlock = memo(function TurnBlock({ turn, liveElapsed, onFileClick, pendingQuestions = [], onQuestionSubmit, onQuestionCancel, onRewind, isRewinding }: { turn: Turn; liveElapsed: number | null; onFileClick?: (path: string) => void; pendingQuestions?: UserQuestion[]; onQuestionSubmit?: (questionId: string, response: string) => void; onQuestionCancel?: (questionId: string) => void; onRewind?: (turnId: string, checkpointId: string) => void; isRewinding?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showRewindConfirm, setShowRewindConfirm] = useState(false)
  const isWorking = !turn.isComplete

  // Duration
  const duration = turn.endTime
    ? Math.floor((turn.endTime - turn.startTime) / 1000)
    : liveElapsed ?? 0

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-2">
      {/* User message */}
      <div className="flex justify-end group">
        <div className="relative max-w-[85%] rounded-lg bg-brand-purple px-4 py-3 text-sm text-white select-text">
          {turn.images && turn.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {turn.images.map((img, index) => (
                <img
                  key={index}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={`Image ${index + 1}`}
                  className="max-h-40 rounded border border-white/20"
                />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap">{turn.userMessage}</div>

          {/* Action buttons (left of bubble) */}
          <div className="absolute -left-16 top-1.5 flex flex-row gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Rewind button */}
            {onRewind && turn.checkpointId && turn.isComplete && (
              <button
                onClick={() => setShowRewindConfirm(true)}
                disabled={isRewinding}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40"
                title="Rewind files to before this message"
              >
                {isRewinding ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-300 animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                )}
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={() => handleCopy(turn.userMessage, `user-${turn.id}`)}
              className="p-1.5 rounded-lg hover:bg-white/10"
              title="Copy message"
            >
              {copiedId === `user-${turn.id}` ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Rewind confirmation dialog */}
      {showRewindConfirm && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
            <div className="flex items-start gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-yellow-400">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <div>
                <p className="font-medium text-brand-text">Rewind file changes?</p>
                <p className="mt-1 text-xs text-brand-text-muted">
                  This will undo all file changes made from this message onward and remove those messages from the conversation.
                  Only changes made via Edit/Write tools are tracked — Bash changes cannot be undone.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowRewindConfirm(false)
                      if (onRewind && turn.checkpointId) {
                        onRewind(turn.id, turn.checkpointId)
                      }
                    }}
                    className="cursor-pointer rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-300 transition-colors hover:bg-yellow-500/30"
                  >
                    Rewind
                  </button>
                  <button
                    onClick={() => setShowRewindConfirm(false)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-brand-text-muted transition-colors hover:bg-brand-border/30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interleaved text blocks and tool groups */}
      {(() => {
        const toolGroups = groupToolEvents(turn.toolEvents)
        const maxIdx = Math.max(turn.textBlocks.length, toolGroups.length + 1)
        const elements: React.ReactNode[] = []

        for (let i = 0; i < maxIdx; i++) {
          // Text block at this index
          const text = turn.textBlocks[i]?.trim() || ''
          if (text) {
            // For incomplete turns, the last text block is still streaming — don't show as final bubble
            const isLastBlock = i === turn.textBlocks.length - 1
            const showAsStreaming = isLastBlock && isWorking

            elements.push(
              <div key={`text-${i}`} className="flex justify-start group">
                <div className={`relative prose-response max-w-[85%] rounded-lg border border-brand-border bg-brand-card px-4 py-3 text-sm text-brand-text select-text ${showAsStreaming ? 'opacity-80' : ''}`}>
                  <ClickableMarkdown onFileClick={onFileClick}>{text}</ClickableMarkdown>

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopy(text, `text-${i}-${turn.id}`)}
                    className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-brand-border/30"
                    title="Copy message"
                  >
                    {copiedId === `text-${i}-${turn.id}` ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text-dim">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          }

          // Tool group at this index (toolGroups[i] follows textBlocks[i])
          if (i < toolGroups.length) {
            // Collect consecutive tool groups until the next text block
            const groupStart = i
            let groupEnd = i
            // If the next text block is empty, bundle consecutive tool groups together
            while (groupEnd + 1 < toolGroups.length && !(turn.textBlocks[groupEnd + 1]?.trim())) {
              groupEnd++
            }
            const batchedGroups = toolGroups.slice(groupStart, groupEnd + 1)

            elements.push(
              <div key={`tools-${i}`} className="ml-2 border-l-2 border-brand-border-subtle pl-4">
                <div className="max-h-[400px] space-y-0.5 overflow-y-auto py-1">
                  {batchedGroups.map((group, j) => (
                    <ToolEventLine key={j} group={group} onFileClick={onFileClick} />
                  ))}
                </div>
              </div>
            )

            // Skip ahead past any batched groups
            i = groupEnd
          }
        }

        return elements
      })()}

      {/* Thinking / streaming partial text / working indicator — all in the activity area */}
      {isWorking && (turn.isThinking || turn.currentPartialText || pendingQuestions.length === 0) && (
        <div className="ml-2 border-l-2 border-brand-border-subtle pl-4">
          {/* Thinking indicator */}
          {turn.isThinking && turn.currentThinking && (
            <ThinkingBlock text={turn.currentThinking} />
          )}

          {/* Streaming partial text (before it gets committed to a textBlock) */}
          {turn.currentPartialText && (
            <div className="py-1 text-xs text-brand-text-muted">
              <ClickableMarkdown onFileClick={onFileClick}>{turn.currentPartialText}</ClickableMarkdown>
            </div>
          )}

          {/* Working indicator */}
          {pendingQuestions.length === 0 && (
            <div className="flex items-center gap-2 py-1 text-xs text-brand-text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-purple" />
              Working...
              <span className="font-mono text-brand-text-dim">{formatDuration(duration)}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending user questions from ask_user MCP tool */}
      {pendingQuestions.length > 0 && onQuestionSubmit && (
        <div className="space-y-2">
          {pendingQuestions.map((q) => (
            <QuestionDialog key={q.questionId} question={q} onSubmit={onQuestionSubmit} onCancel={onQuestionCancel} />
          ))}
        </div>
      )}

      {/* Completed footer with duration and cost */}
      {turn.isComplete && (turn.toolEvents.length > 0 || duration > 0) && (
        <div className="flex items-center gap-3 pl-2 text-[11px] text-brand-text-dim">
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatDuration(duration)}
          </span>
          {turn.costUsd !== null && turn.costUsd > 0 && (
            <span>${turn.costUsd.toFixed(4)}</span>
          )}
        </div>
      )}
    </div>
  )
})

const ThinkingBlock = memo(function ThinkingBlock({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 py-1 text-xs text-brand-purple/70 hover:text-brand-purple transition-colors cursor-pointer"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-purple/50" />
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Thinking...
      </button>
      {isExpanded && (
        <div className="mt-1 mb-2 rounded-lg border border-brand-purple/20 bg-brand-purple/5 px-3 py-2 text-xs text-brand-text-dim whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
})

const ToolEventLine = memo(function ToolEventLine({ group, onFileClick }: { group: ToolEventGroup; onFileClick?: (path: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { toolUse, toolResult } = group
  const detail = getToolDetail(toolUse.tool, toolUse.input)
  const isFilePath = detail && ['Read', 'Write', 'Edit'].includes(toolUse.tool ?? '')
  const hasExpandableContent = toolUse.input || toolResult?.output

  return (
    <div className="py-0.5">
      <div className="flex items-start gap-1.5 text-xs">
        {toolResult ? (
          <span className="text-brand-success">✓</span>
        ) : (
          <span className="text-brand-purple">⚡</span>
        )}
        {hasExpandableContent ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 cursor-pointer hover:text-brand-text transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-brand-text-dim transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="font-mono text-brand-text-muted">{toolUse.tool}</span>
          </button>
        ) : (
          <span className="font-mono text-brand-text-muted">{toolUse.tool}</span>
        )}
        {detail && isFilePath && onFileClick ? (
          <span
            className="flex-1 break-all font-mono text-brand-purple-soft cursor-pointer transition-colors hover:text-brand-purple"
            onClick={() => onFileClick(detail)}
            title="Click to preview file"
          >
            {detail}
          </span>
        ) : detail ? (
          <span className="flex-1 break-all font-mono text-brand-text-dim">{detail}</span>
        ) : null}
      </div>
      {isExpanded && (
        <div className="ml-5 mt-1 space-y-1">
          {toolUse.input && (
            <div className="rounded border border-brand-border bg-brand-bg/50 px-2 py-1.5 text-[11px] font-mono text-brand-text-dim max-h-[200px] overflow-y-auto whitespace-pre-wrap">
              {formatToolInput(toolUse.tool, toolUse.input)}
            </div>
          )}
          {toolResult?.output && (
            <div className="rounded border border-brand-success/20 bg-brand-success/5 px-2 py-1.5 text-[11px] font-mono text-brand-text-dim max-h-[200px] overflow-y-auto whitespace-pre-wrap">
              {typeof toolResult.output === 'string' && toolResult.output.length > 500
                ? toolResult.output.slice(0, 500) + '...'
                : toolResult.output}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function getToolDetail(tool?: string, input?: Record<string, unknown>): string | null {
  if (!tool || !input) return null

  switch (tool) {
    case 'Read':
      return (input.file_path as string) || null
    case 'Write':
      return (input.file_path as string) || null
    case 'Edit':
      return (input.file_path as string) || null
    case 'Bash':
      return (input.command as string) || null
    case 'Glob':
      return (input.pattern as string) || null
    case 'Grep':
      return (input.pattern as string) || null
    case 'ask_user': {
      const questions = input.questions as Array<{ question: string }> | undefined
      if (questions && questions.length > 0) {
        return questions.length === 1
          ? questions[0].question
          : `${questions.length} questions`
      }
      return 'Waiting for user input...'
    }
    default:
      return null
  }
}

function formatToolInput(tool?: string, input?: Record<string, unknown>): string {
  if (!tool || !input) return ''

  switch (tool) {
    case 'Edit':
      return [
        input.file_path && `File: ${input.file_path}`,
        input.old_string && `- ${(input.old_string as string).slice(0, 200)}`,
        input.new_string && `+ ${(input.new_string as string).slice(0, 200)}`
      ].filter(Boolean).join('\n')
    case 'Write':
      return [
        input.file_path && `File: ${input.file_path}`,
        input.content && `Content: ${(input.content as string).slice(0, 300)}${(input.content as string).length > 300 ? '...' : ''}`
      ].filter(Boolean).join('\n')
    case 'Bash':
      return (input.command as string) || ''
    case 'Grep':
      return [
        input.pattern && `Pattern: ${input.pattern}`,
        input.path && `Path: ${input.path}`,
        input.glob && `Glob: ${input.glob}`
      ].filter(Boolean).join('\n')
    case 'Glob':
      return [
        input.pattern && `Pattern: ${input.pattern}`,
        input.path && `Path: ${input.path}`
      ].filter(Boolean).join('\n')
    default:
      return JSON.stringify(input, null, 2).slice(0, 500)
  }
}
