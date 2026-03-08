import { useState, useRef, useEffect, useCallback, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import { FolderOpen } from 'lucide-react'
import type { StreamEvent, UserInfo, SessionMetadata, Turn, ToolEvent, Workspace } from '../../../preload/index.d'
import { ResizablePanes } from '../components/ResizablePanes'
import { MemoryDialog } from '../components/MemoryDialog'
import { SettingsDialog } from '../components/SettingsDialog'
import { AppHeader } from '../components/AppHeader'

interface BuildScreenProps {
  user: UserInfo | null
  onLogout: () => void
  workingDirectory: string | null
  onBackToProjects: () => void
  workspaces?: Workspace[]
  activeWorkspace?: Workspace | null
  onSwitchWorkspace?: (workspace: Workspace) => void
}

export function BuildScreen({ user, onLogout, workingDirectory: initialWorkingDirectory, onBackToProjects: onBackToProjectsFromParent, workspaces = [], activeWorkspace: activeWorkspaceProp, onSwitchWorkspace: onSwitchWorkspaceProp }: BuildScreenProps) {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(initialWorkingDirectory)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [pastedImages, setPastedImages] = useState<Array<{ data: string; mediaType: string }>>([])
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

  // Sync working directory prop with local state
  useEffect(() => {
    if (initialWorkingDirectory !== null && initialWorkingDirectory !== workingDirectory) {
      setWorkingDirectory(initialWorkingDirectory)
    }
  }, [initialWorkingDirectory, workingDirectory])
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
  const currentSessionTitleRef = useRef<string>('')

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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

  // Keep currentSessionTitleRef in sync with currentSessionTitle state
  useEffect(() => {
    currentSessionTitleRef.current = currentSessionTitle
  }, [currentSessionTitle])

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

  // Load last app state on mount
  useEffect(() => {
    const restoreLastState = async () => {
      try {
        const appState = await window.api.getAppState()
        setRecentDirectories(appState.recentDirectories || [])
        if (appState.lastWorkingDirectory) {
          setWorkingDirectory(appState.lastWorkingDirectory)

          // If there's a last session, try to load it
          if (appState.lastSessionId) {
            const sessionData = await window.api.loadSession(
              appState.lastWorkingDirectory,
              appState.lastSessionId
            )
            if (sessionData) {
              setTurns(sessionData.turns)
              setSessionId(sessionData.sessionId)
              setSdkSessionId(sessionData.sdkSessionId ?? null)
              setCurrentSessionTitle(sessionData.title)

              // Check if there's an incomplete turn we should mark as streaming
              const storedActiveTurnId = localStorage.getItem('activeTurnId')
              if (storedActiveTurnId) {
                const incompleteTurn = sessionData.turns.find(
                  t => t.id === storedActiveTurnId && !t.isComplete
                )
                if (incompleteTurn) {
                  console.log('[BuildScreen] Found incomplete turn after reload, resuming...')
                  activeTurnIdRef.current = storedActiveTurnId
                  isStreamingRef.current = true
                  setIsStreaming(true)
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
    }
  }, [workingDirectory])

  // Save session ID whenever it changes
  useEffect(() => {
    if (sessionId) {
      window.api.saveSessionId(sessionId)
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
    // ATOMIC guard check and set - prevent race conditions
    if (isStreamingRef.current || isProcessingQueueRef.current) {
      return
    }
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

    // Set streaming state BEFORE sending (both state and ref)
    isStreamingRef.current = true
    setIsStreaming(true)
    // Now safe to clear processing flag - isStreamingRef will guard further calls
    isProcessingQueueRef.current = false
    activeTurnIdRef.current = turnId
    localStorage.setItem('activeTurnId', turnId)

    setTurns((prev) => {
      const updatedTurns = [...prev, newTurn]

      // Save session immediately with updated turns
      if (workingDirectoryRef.current && sessionIdRef.current) {
        const sessionData = {
          sessionId: sessionIdRef.current,
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
      // Handle system events (compaction) regardless of active turn
      if (event.event === 'system') {
        const type = event.data.type as string
        if (type === 'compacting') {
          setIsCompacting(true)
        } else if (type === 'compact') {
          setIsCompacting(false)
          // After compaction, the context was reset — use a reduced estimate
          setContextTokens(prev => Math.round(prev * 0.15))
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
              return { ...t, textBlocks: blocks }
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
                    costUsd: (event.data.costUsd as number) ?? null
                  }
                : t
            )
          )
          // Clear active turn from localStorage when done
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
    setWorkingDirectory(folder)
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setSdkSessionId(null)
    setCurrentSessionTitle('')
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
    setWorkingDirectory(null)
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setCurrentSessionTitle('')
    setMemories([])
    setMemoryExists(false)
    setSessions([])
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
      const sessionList = await window.api.listSessions(directory)
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

  const handleSend = useCallback(async () => {
    if (!workingDirectory) return
    if (!input.trim() && pastedImages.length === 0) return

    // Don't send while already streaming - we can only track one active turn at a time
    if (isStreamingRef.current) {
      console.log('[BuildScreen] Already streaming, please wait for current message to complete')
      return
    }

    const trimmedInput = input.trim()

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
        /^\/keybindings-help$/
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

    // Regular message handling
    const turnId = crypto.randomUUID()
    const newTurn: Turn = {
      id: turnId,
      userMessage: trimmedInput, // Show original user message in UI
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
  }, [input, workingDirectory, isStreaming, sessionId, sdkSessionId, memoryExists, pastedImages])

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

    const sessionData = await window.api.loadSession(workingDirectory, loadSessionId)
    if (sessionData) {
      setTurns(sessionData.turns)
      setSessionId(sessionData.sessionId)
      setSdkSessionId(sessionData.sdkSessionId ?? null)
      setCurrentSessionTitle(sessionData.title)
      setIsSessionHistoryDialogOpen(false)
    }
  }

  const handleDeleteSession = async (deleteSessionId: string) => {
    if (!workingDirectory) return

    const result = await window.api.deleteSession(workingDirectory, deleteSessionId)
    if (result.success) {
      loadSessions(workingDirectory)
    }
  }

  const handleNewSession = () => {
    setTurns([])
    setVisibleTurnCount(6)
    setSessionId(null)
    setSdkSessionId(null)
    setCurrentSessionTitle('')
    setPastedImages([])
    setInput('')
    localStorage.removeItem('activeTurnId')
    console.log('[BuildScreen] Started new session')
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
    // TODO: Implement file attachment functionality
    console.log('Add file clicked')
    setIsActionMenuOpen(false)
  }

  // Available slash commands
  const SLASH_COMMANDS = [
    { command: '/init', description: 'Initialize project memory', args: '' },
    { command: '/code-review', description: 'Review code for issues', args: '[files]' }
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
      // Use setTimeout to ensure state updates before sending
      setTimeout(() => {
        handleSend()
      }, 0)
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

    // Clean up
    isStreamingRef.current = false
    setIsStreaming(false)
    activeTurnIdRef.current = null
    if (localStorage.getItem('activeTurnId') === turnId) {
      localStorage.removeItem('activeTurnId')
    }

    // Backend now handles queue processing automatically
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      <div className="flex h-screen flex-col bg-brand-bg">
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

  // Left pane content
  const leftPaneContent = (
    <div className="flex h-full flex-col bg-brand-card/30">
      <div className="border-b border-brand-border px-4 py-3">
        <h3 className="text-sm font-semibold text-brand-text">Features</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
      </div>
    </div>
  )

  // Right pane content (chat)
  const rightPaneContent = (
    <div className="flex h-full flex-col bg-brand-bg">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
                  <TurnBlock key={turn.id} turn={turn} liveElapsed={turn.id === activeTurnIdRef.current ? elapsed : null} />
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

          {/* Agent-style input container */}
          <div className="relative rounded-2xl border border-brand-border/50 bg-brand-card/80 backdrop-blur-sm shadow-lg">
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
                  if (isStreaming && !input.trim() && pastedImages.length === 0) {
                    handleStop()
                  } else {
                    handleSend()
                  }
                }}
                disabled={!isStreaming && !input.trim() && pastedImages.length === 0}
                className="flex-shrink-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-brand-purple text-white transition-all hover:bg-brand-purple-dim hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                title={
                  isStreaming && !input.trim() && pastedImages.length === 0
                    ? 'Stop response'
                    : isStreaming
                    ? 'Queue message'
                    : 'Send message'
                }
              >
                {isStreaming && !input.trim() && pastedImages.length === 0 ? (
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
          </div>

          {/* Context size indicator */}
          {turns.length > 0 && (
            <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-brand-text-dim">
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
                    <span className="text-brand-text-dim/50">/ ~200k</span>
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
    <div className="flex h-screen flex-col bg-brand-bg">
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
  onNewSession
}: {
  workingDirectory: string | null
  onSelectFolder: () => void
  sessions: SessionMetadata[]
  currentSessionId: string | null
  currentSessionTitle: string
  onLoadSession: (sessionId: string) => void
  onNewSession: () => void
}) {
  const [showSessionDropdown, setShowSessionDropdown] = useState(false)
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
                  <div className="rounded-lg bg-brand-purple/10 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-purple animate-pulse" />
                      <span className="text-xs font-medium text-brand-purple">Current Session</span>
                    </div>
                    <p className="text-sm font-medium text-brand-text truncate">
                      {currentSessionTitle || 'Untitled Session'}
                    </p>
                    <p className="text-xs font-mono text-brand-text-dim truncate mt-0.5">
                      {currentSessionId.slice(0, 8)}...
                    </p>
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
                      <button
                        key={session.sessionId}
                        onClick={() => {
                          onLoadSession(session.sessionId)
                          setShowSessionDropdown(false)
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-purple/10 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-brand-text truncate flex-1">
                            {session.title}
                          </p>
                          <span className="text-xs text-brand-text-dim whitespace-nowrap">
                            {formatDate(session.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-brand-text-dim">
                          <span>{session.turnsCount} turns</span>
                          {session.totalCost > 0 && (
                            <span>${session.totalCost.toFixed(4)}</span>
                          )}
                        </div>
                      </button>
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

const TurnBlock = memo(function TurnBlock({ turn, liveElapsed }: { turn: Turn; liveElapsed: number | null }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const hasTools = turn.toolEvents.length > 0
  const isWorking = !turn.isComplete

  // Separate first text block (initial response) from last text block (final response)
  const firstText = turn.textBlocks[0]?.trim() || ''
  const lastText = turn.textBlocks.length > 1 ? turn.textBlocks[turn.textBlocks.length - 1]?.trim() || '' : ''

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

          {/* Copy button */}
          <button
            onClick={() => handleCopy(turn.userMessage, `user-${turn.id}`)}
            className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10"
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

      {/* Initial response — text before any tools */}
      {firstText && (
        <div className="flex justify-start group">
          <div className="relative prose-response max-w-[85%] rounded-lg border border-brand-border bg-brand-card px-4 py-3 text-sm text-brand-text select-text">
            <ReactMarkdown>{firstText}</ReactMarkdown>

            {/* Copy button */}
            <button
              onClick={() => handleCopy(firstText, `first-${turn.id}`)}
              className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-brand-border/30"
              title="Copy message"
            >
              {copiedId === `first-${turn.id}` ? (
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
      )}

      {/* Activity log — all tool events grouped together */}
      {(hasTools || isWorking) && (
        <div className="ml-2 border-l-2 border-brand-border-subtle pl-4">
          {hasTools && (
            <div className="max-h-[400px] space-y-0.5 overflow-y-auto py-1">
              {groupToolEvents(turn.toolEvents).map((group, i) => (
                <ToolEventLine key={i} group={group} />
              ))}
            </div>
          )}
          {isWorking && (
            <div className="flex items-center gap-2 py-1 text-xs text-brand-text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-purple" />
              Working...
              <span className="font-mono text-brand-text-dim">{formatDuration(duration)}</span>
            </div>
          )}
        </div>
      )}

      {/* Final response — text after tools complete, only shown when turn is done */}
      {turn.isComplete && lastText && (
        <div className="flex justify-start group">
          <div className="relative prose-response max-w-[85%] rounded-lg border border-brand-border bg-brand-card px-4 py-3 text-sm text-brand-text select-text">
            <ReactMarkdown>{lastText}</ReactMarkdown>

            {/* Copy button */}
            <button
              onClick={() => handleCopy(lastText, `last-${turn.id}`)}
              className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-brand-border/30"
              title="Copy message"
            >
              {copiedId === `last-${turn.id}` ? (
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
      )}

      {/* Completed footer with duration and cost */}
      {turn.isComplete && (hasTools || duration > 0) && (
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

const ToolEventLine = memo(function ToolEventLine({ group }: { group: ToolEventGroup }) {
  const { toolUse, toolResult } = group
  const detail = getToolDetail(toolUse.tool, toolUse.input)

  return (
    <div className="flex items-start gap-1.5 py-0.5 text-xs">
      {toolResult ? (
        <span className="text-brand-success">✓</span>
      ) : (
        <span className="text-brand-purple">⚡</span>
      )}
      <span className="font-mono text-brand-text-muted">{toolUse.tool}</span>
      {detail && (
        <span className="flex-1 break-all font-mono text-brand-text-dim">{detail}</span>
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
    default:
      return null
  }
}
