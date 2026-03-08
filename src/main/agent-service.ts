import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage, SDKUserMessage, Options, HookJSONOutput, Query, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'
import { VisionService } from './vision-service'
import { customToolsServer } from './tools'
import { setQuestionNotifier } from './tools/ask-user'

/**
 * An async-iterable message channel that can be pushed to externally.
 * Used to feed user messages into a running query via streamInput().
 *
 * The channel stays open (the async iterator blocks) until close() is called,
 * which allows the query's stdin to remain open for the duration of the task.
 */
class MessageChannel implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private resolve: (() => void) | null = null
  private closed = false

  push(message: SDKUserMessage): void {
    if (this.closed) return
    this.queue.push(message)
    // Wake up the iterator if it's waiting
    if (this.resolve) {
      this.resolve()
      this.resolve = null
    }
  }

  close(): void {
    this.closed = true
    // Wake up the iterator so it can exit
    if (this.resolve) {
      this.resolve()
      this.resolve = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: async (): Promise<IteratorResult<SDKUserMessage>> => {
        while (true) {
          if (this.queue.length > 0) {
            return { value: this.queue.shift()!, done: false }
          }
          if (this.closed) {
            return { value: undefined as any, done: true }
          }
          // Wait for a push() or close()
          await new Promise<void>((resolve) => {
            this.resolve = resolve
          })
        }
      }
    }
  }
}

function findClaudeExecutable(customPath?: string | null): string {
  // If custom path is provided, use it
  if (customPath && customPath.trim()) {
    return customPath.trim()
  }

  // Otherwise, try to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0]
  } catch {
    throw new Error(
      'Claude Code CLI not found. Please install it from https://claude.ai/download or configure the path in Settings.'
    )
  }
}

export interface StreamEvent {
  event: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'system' | 'user_question'
  data: Record<string, unknown>
}

interface QueuedMessage {
  params: {
    content: string
    images?: Array<{ data: string; mediaType: string }>
    workingDirectory: string
    sessionId?: string
    sdkSessionId?: string
    systemPrompt?: string
    allowedTools?: string[]
    previousTurns?: Array<{
      id: string
      userMessage: string
      images?: Array<{ data: string; mediaType: string }>
      textBlocks: string[]
      toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
      isComplete: boolean
      startTime: number
      endTime: number | null
      costUsd: number | null
    }>
  }
  onEvent: (event: StreamEvent) => void
  resolve: (value: { sessionId: string; success: boolean }) => void
  reject: (error: Error) => void
}

interface Session {
  id: string
  sdkSessionId: string | null
  config: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools: string[]
  }
  createdAt: Date
  isProcessing: boolean
  messageQueue: QueuedMessage[]
  abortController: AbortController | null
  /** The last Query object — needed for rewindFiles() after stream completes */
  lastQuery: Query | null
  /** Active input channel for injecting messages into a running query */
  inputChannel: MessageChannel | null
}

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'mcp__customTools__code_review', 'mcp__customTools__ask_user']

export class AgentService {
  private sessions = new Map<string, Session>()
  private visionService: VisionService | null = null
  private customClaudeCodePath: string | null = null

  initializeVisionService(apiKey: string) {
    this.visionService = new VisionService(apiKey)
    console.log('[AgentService] Vision service initialized')
  }

  setClaudeCodePath(path: string | null) {
    this.customClaudeCodePath = path
    console.log('[AgentService] Claude Code path set to:', path || 'auto-detect')
  }

  createSession(params: {
    workingDirectory: string
    systemPrompt?: string
    allowedTools?: string[]
  }): { sessionId: string } {
    const id = randomUUID()

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      config: {
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools?.length ? params.allowedTools : DEFAULT_TOOLS
      },
      createdAt: new Date(),
      isProcessing: false,
      messageQueue: [],
      abortController: null,
      lastQuery: null,
      inputChannel: null
    })

    console.log('[AgentService] Session created:', id, '| Total sessions:', this.sessions.size)
    return { sessionId: id }
  }

  destroySession(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId)
    if (session?.abortController) {
      session.abortController.abort()
    }
    this.sessions.delete(sessionId)
    return { success: true }
  }

  /**
   * Abort the currently running query for a session.
   * This kills the SDK subprocess and breaks the streaming loop.
   */
  abortSession(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.log('[AgentService] abortSession: session not found:', sessionId)
      return { success: false }
    }

    if (session.abortController) {
      console.log('[AgentService] Aborting active query for session:', sessionId)
      session.abortController.abort()
      session.abortController = null
      // Also clear the message queue so queued messages don't auto-fire
      session.messageQueue = []
      return { success: true }
    }

    console.log('[AgentService] abortSession: no active query to abort for session:', sessionId)
    return { success: false }
  }

  /**
   * Inject a message into a currently running query.
   * The agent picks it up at its next natural pause (between tool calls).
   * Returns true if the message was injected, false if no active query.
   */
  injectMessage(sessionId: string, content: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.log('[AgentService] injectMessage: session not found:', sessionId)
      return false
    }

    if (!session.isProcessing || !session.inputChannel) {
      console.log('[AgentService] injectMessage: no active query for session:', sessionId)
      return false
    }

    console.log('[AgentService] Injecting message into running query:', content.slice(0, 100))

    const message: SDKUserMessage = {
      type: 'user',
      session_id: session.sdkSessionId || '',
      message: {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: content }]
      },
      parent_tool_use_id: null
    } as SDKUserMessage

    session.inputChannel.push(message)
    return true
  }

  getSessionInfo(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null
  }

  listActiveSessions(): Array<{
    id: string
    sdkSessionId: string | null
    workingDirectory: string
    createdAt: Date
    allowedTools: string[]
  }> {
    console.log('[AgentService] Listing active sessions, total:', this.sessions.size)
    const result = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      sdkSessionId: session.sdkSessionId,
      workingDirectory: session.config.workingDirectory,
      createdAt: session.createdAt,
      allowedTools: session.config.allowedTools
    }))
    console.log('[AgentService] Returning', result.length, 'sessions')
    return result
  }

  async sendMessage(
    params: {
      content: string
      images?: Array<{ data: string; mediaType: string }>
      workingDirectory: string
      sessionId?: string
      sdkSessionId?: string
      systemPrompt?: string
      allowedTools?: string[]
      model?: string
      previousTurns?: Array<{
        id: string
        userMessage: string
        images?: Array<{ data: string; mediaType: string }>
        textBlocks: string[]
        toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
        isComplete: boolean
        startTime: number
        endTime: number | null
        costUsd: number | null
      }>
    },
    onEvent: (event: StreamEvent) => void
  ): Promise<{ sessionId: string; success: boolean }> {
    console.log('[AgentService] sendMessage called with images:', params.images?.length || 0)

    // If images are present, use vision service to analyze them, then hand off to Agent SDK
    if (params.images && params.images.length > 0) {
      if (!this.visionService) {
        onEvent({
          event: 'error',
          data: { error: 'Vision service not initialized. Please configure your Anthropic API key.' }
        })
        return { sessionId: '', success: false }
      }

      console.log('[AgentService] Using vision service to analyze images, then handing off to Agent SDK')

      // Step 1: Get vision analysis
      let visionAnalysis = ''

      const visionResult = await this.visionService.sendMessageWithVision(
        {
          content: `Please analyze this image and provide a detailed description. The user's request is: "${params.content}"

Provide your analysis in a clear format that can be used by another AI agent to complete the task.`,
          images: params.images,
          workingDirectory: params.workingDirectory
        },
        (event) => {
          // Capture the vision response
          if (event.event === 'text') {
            visionAnalysis += event.data.text as string
          }
          // Forward events to the UI
          onEvent(event)
        }
      )

      if (!visionResult.success) {
        return { sessionId: params.sessionId || `vision-${Date.now()}`, success: false }
      }

      // Step 2: Send vision analysis to Agent SDK for actual work
      console.log('[AgentService] Vision analysis complete, handing off to Agent SDK for implementation')

      onEvent({
        event: 'system',
        data: {
          message: '🔄 Switching to Agent SDK for implementation...',
          type: 'handoff'
        }
      })

      // Construct enhanced prompt with vision analysis
      const enhancedPrompt = `Based on the following image analysis:

---
${visionAnalysis}
---

User's original request: ${params.content}

Please proceed to complete the user's request using the appropriate tools.`

      // Now send to Agent SDK without images (just text)
      return this.sendMessage(
        {
          ...params,
          content: enhancedPrompt,
          images: undefined // Remove images, we have the analysis now
        },
        onEvent
      )
    }

    // Text-only messages continue to use the Agent SDK
    let session: Session

    // If sessionId is provided, trust it and recreate session in memory if needed
    if (params.sessionId) {
      if (this.sessions.has(params.sessionId)) {
        session = this.sessions.get(params.sessionId)!
        console.log('[AgentService] Reusing existing session:', params.sessionId)
      } else {
        // Session exists on disk but not in memory - recreate it
        console.log('[AgentService] Recreating session in memory:', params.sessionId, 'with SDK session:', params.sdkSessionId || 'none')
        this.sessions.set(params.sessionId, {
          id: params.sessionId,
          sdkSessionId: params.sdkSessionId || null,
          config: {
            workingDirectory: params.workingDirectory,
            systemPrompt: params.systemPrompt,
            allowedTools: params.allowedTools?.length ? params.allowedTools : DEFAULT_TOOLS
          },
          createdAt: new Date(),
          isProcessing: false,
          messageQueue: [],
          abortController: null,
          lastQuery: null
        })
        session = this.sessions.get(params.sessionId)!
      }
    } else {
      // No sessionId provided - create a brand new session
      console.log('[AgentService] Creating new session')
      const { sessionId } = this.createSession({
        workingDirectory: params.workingDirectory,
        systemPrompt: params.systemPrompt,
        allowedTools: params.allowedTools
      })
      session = this.sessions.get(sessionId)!
    }

    // If already processing, queue this message
    if (session.isProcessing) {
      console.log('[AgentService] Session is already processing, queuing message (queue length:', session.messageQueue.length, ')')
      return new Promise<{ sessionId: string; success: boolean }>((resolve, reject) => {
        session.messageQueue.push({
          params,
          onEvent,
          resolve,
          reject
        })
        onEvent({
          event: 'system',
          data: { message: `Message queued (position ${session.messageQueue.length} in queue)` }
        })
      })
    }

    // Mark session as processing and create abort controller
    session.isProcessing = true
    const abortController = new AbortController()
    session.abortController = abortController

    try {
      const claudePath = findClaudeExecutable(this.customClaudeCodePath)

      const options: Options = {
        model: params.model || 'claude-sonnet-4-5-20250929',
        pathToClaudeCodeExecutable: claudePath,
        allowedTools: session.config.allowedTools,
        // Block built-in AskUserQuestion — it can't interact with users in Electron.
        // The agent must use mcp__customTools__ask_user instead.
        disallowedTools: ['AskUserQuestion'],
        cwd: session.config.workingDirectory,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        includePartialMessages: true,
        // Enable file checkpointing so we can rewind file changes
        enableFileCheckpointing: true,
        // Required to receive checkpoint UUIDs in the stream
        extraArgs: { 'replay-user-messages': null },
        env: {
          ...process.env,
          // ask_user tool waits for user input, which can take minutes
          CLAUDE_CODE_STREAM_CLOSE_TIMEOUT: '300000',
        },
        // Load project CLAUDE.md files — these survive compaction and are
        // re-read every turn, giving the agent persistent project context
        settingSources: ['user', 'project'],
        // Use the full Claude Code CLI system prompt for consistent behavior
        // (coding conventions, safety rules, tool instructions, etc.)
        // with our custom instructions appended
        tools: { type: 'preset', preset: 'claude_code' },
        // Add custom MCP server with your tools
        mcpServers: {
          customTools: customToolsServer
        },
        // PreCompact hook: guide what the compaction summary should preserve
        hooks: {
          PreCompact: [{
            hooks: [async (): Promise<HookJSONOutput> => {
              console.log('[AgentService] PreCompact hook fired — injecting compaction guidance')
              return {
                continue: true,
                systemMessage: [
                  'COMPACTION INSTRUCTIONS — When summarizing this conversation, you MUST preserve:',
                  '1. All file paths that were read, created, or modified, and what specific changes were made to each',
                  '2. Key architectural decisions and the reasoning behind them',
                  '3. Any errors encountered and how they were resolved',
                  '4. The current state of the task — what is done and what remains',
                  '5. User preferences, constraints, and conventions expressed during the conversation',
                  '6. Names of functions, components, variables, and types that were discussed or modified',
                  '7. Any TODO items or follow-up tasks mentioned',
                  '8. The working directory and project structure details discovered',
                  'Do NOT discard specifics about code changes — file:line references, function signatures, and exact modifications are critical for continuity.',
                ].join('\n')
              }
            }]
          }]
        },
        stderr: (data: string) => {
          console.error('[SDK stderr]', data.trim())
        }
      }

      const workDir = session.config.workingDirectory
      const directoryGuard = [
        `CRITICAL RULE — DIRECTORY RESTRICTION:`,
        `You MUST only read, write, edit, and execute files within: ${workDir}`,
        `You MUST NOT access, read, write, or modify any files or directories outside of ${workDir}.`,
        `All file paths must be within ${workDir}. Reject any request that would require accessing files outside this directory.`,
        `When using Bash, always run commands from ${workDir} and never cd outside of it.`,
        ``,
        `EXCEPTION: If the user provides a full absolute file path (e.g. "C:\\Users\\..." or "/home/...") in their message, you MAY read that file using the Read tool. You must NEVER write to, edit, or delete files outside ${workDir}. This read-only exception applies only when the user explicitly provides the full path.`,
      ].join('\n')

      // Build persistent session context from turns — this goes in the system
      // prompt so it survives compaction (system prompt is always re-injected)
      const sessionContext = this.buildSessionContext(params.previousTurns)

      const interactiveQuestions = [
        `INTERACTIVE QUESTIONS — USER INPUT:`,
        `When you need to ask the user a question with choices, you MUST follow these exact steps:`,
        `1. First call ToolSearch with query "select:mcp__customTools__ask_user" to load the tool`,
        `2. Then call mcp__customTools__ask_user with your questions and options`,
        `The tool displays an interactive UI. When it returns, the response contains the user's actual answers (formatted as Q: and A: pairs). Trust those answers and proceed immediately — do NOT re-ask the same questions.`,
        `IMPORTANT: The built-in AskUserQuestion tool is DISABLED. You MUST use mcp__customTools__ask_user instead.`,
        `ALWAYS use this two-step process (ToolSearch then mcp__customTools__ask_user) whenever you are presenting 2+ options, asking for confirmation, or requesting preferences.`,
        `NEVER type out numbered options or choices as plain text — ALWAYS use the tool instead.`,
        `Only call mcp__customTools__ask_user ONCE per set of questions. After receiving answers, proceed with the task.`,
      ].join('\n')

      // Assemble custom instructions to append to the CLI system prompt
      const appendParts = [directoryGuard, interactiveQuestions]
      if (session.config.systemPrompt) {
        appendParts.push(session.config.systemPrompt)
      }
      if (sessionContext) {
        appendParts.push(sessionContext)
      }
      // Use the full Claude Code CLI system prompt as base, with our
      // custom instructions (directory guard, interactive questions, etc.) appended
      options.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: appendParts.join('\n\n')
      }

      // Resume SDK session if available — this carries full conversation history natively
      if (session.sdkSessionId) {
        console.log('[AgentService] Resuming SDK session:', session.sdkSessionId)
        options.resume = session.sdkSessionId
      } else {
        console.log('[AgentService] Starting new SDK session', sessionContext ? '(with session context)' : '')
      }

      // Build the prompt - if images are provided, use message format
      let promptContent: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>

      if (params.images && params.images.length > 0) {
        // Multi-part message with images
        promptContent = [
          ...params.images.map(img => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data
            }
          })),
          {
            type: 'text',
            text: params.content
          }
        ]
      } else {
        // Simple text prompt
        promptContent = params.content
      }

      console.log('[AgentService] Sending to SDK with prompt type:', Array.isArray(promptContent) ? 'multi-part' : 'text')
      if (Array.isArray(promptContent)) {
        console.log('[AgentService] Multi-part content blocks:', promptContent.length)
      }

      // Wire up the ask_user notifier so MCP tool can push question events to the renderer
      setQuestionNotifier((questionData) => {
        onEvent({
          event: 'user_question',
          data: questionData
        } as StreamEvent)
      })

      // Wire up abort controller so the frontend can cancel this query
      options.abortController = abortController

      // Create input channel for injecting messages mid-query
      const inputChannel = new MessageChannel()
      session.inputChannel = inputChannel

      // Build the initial SDKUserMessage
      const contentBlocks = Array.isArray(promptContent)
        ? promptContent
        : [{ type: 'text' as const, text: promptContent }]

      const initialMessage: SDKUserMessage = {
        type: 'user',
        session_id: session.sdkSessionId || '',
        message: {
          role: 'user' as const,
          content: contentBlocks as any
        },
        parent_tool_use_id: null
      } as SDKUserMessage

      // Push initial message and start the query with the channel as prompt
      inputChannel.push(initialMessage)

      const stream = query({
        prompt: inputChannel,
        options
      })

      // Store the query object so we can call rewindFiles() later
      session.lastQuery = stream

      for await (const message of stream) {
        this.handleSDKMessage(message, session, onEvent)
        // Break immediately on result so the finally block clears isProcessing
        // before the next sendMessage call arrives. Without this, the stream
        // may linger open after the result, leaving isProcessing=true and
        // causing subsequent messages to be incorrectly queued.
        if (message.type === 'result') {
          break
        }
      }

      return { sessionId: session.id, success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[AgentService] Error:', errorMessage)
      onEvent({ event: 'error', data: { error: errorMessage } })
      return { sessionId: session.id, success: false }
    } finally {
      // Clear the question notifier so stale references don't leak
      setQuestionNotifier(null)

      // Close the input channel so streamInput() finishes and stdin closes
      if (session.inputChannel) {
        session.inputChannel.close()
        session.inputChannel = null
      }

      // Clear processing flag and abort controller
      session.isProcessing = false
      session.abortController = null
      console.log('[AgentService] Cleared processing flag for session:', session.id)

      // Process next queued message if any
      if (session.messageQueue.length > 0) {
        console.log('[AgentService] Processing next queued message (', session.messageQueue.length, 'messages in queue)')
        const nextMessage = session.messageQueue.shift()!

        // Process the queued message asynchronously
        this.sendMessage(nextMessage.params, nextMessage.onEvent)
          .then(nextMessage.resolve)
          .catch(nextMessage.reject)
      }
    }
  }

  /**
   * Rewind file changes to a specific checkpoint (user message).
   * Resumes the session with an empty prompt and calls rewindFiles() on the new query.
   */
  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    dryRun: boolean = false
  ): Promise<RewindFilesResult> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { canRewind: false, error: 'Session not found' }
    }

    if (!session.sdkSessionId) {
      return { canRewind: false, error: 'No SDK session to rewind (session has not sent any messages yet)' }
    }

    if (session.isProcessing) {
      return { canRewind: false, error: 'Cannot rewind while a query is in progress. Stop the agent first.' }
    }

    console.log('[AgentService] Rewinding files for session:', sessionId, 'to checkpoint:', userMessageId, 'dryRun:', dryRun)

    try {
      const claudePath = findClaudeExecutable(this.customClaudeCodePath)

      // Resume the session with the same options used to create it.
      // The CLI subprocess needs matching config to locate checkpoint data.
      const rewindQuery = query({
        prompt: '',
        options: {
          model: 'claude-sonnet-4-5-20250929',
          pathToClaudeCodeExecutable: claudePath,
          cwd: session.config.workingDirectory,
          resume: session.sdkSessionId,
          enableFileCheckpointing: true,
          extraArgs: { 'replay-user-messages': null },
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          settingSources: ['user', 'project'],
          stderr: (data: string) => {
            console.error('[SDK rewind stderr]', data.trim())
          }
        }
      })

      // We need to start iterating to establish the connection, then call rewindFiles
      let result: RewindFilesResult | null = null
      for await (const msg of rewindQuery) {
        console.log('[AgentService] rewind resumed, first message type:', msg.type, 'uuid:', (msg as any).uuid)
        // Call rewindFiles once the connection is open
        result = await rewindQuery.rewindFiles(userMessageId, { dryRun })
        console.log('[AgentService] rewindFiles result:', result)
        break // We're done — break out of the stream
      }

      return result ?? { canRewind: false, error: 'No messages received from resumed session' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[AgentService] rewindFiles error:', errorMessage)
      return { canRewind: false, error: errorMessage }
    }
  }

  /**
   * Build a persistent session context from previous turns.
   * This is included in the system prompt so it survives compaction.
   * Extracts key facts: files modified, tools used, decisions made.
   */
  private buildSessionContext(
    previousTurns?: Array<{
      id: string
      userMessage: string
      images?: Array<{ data: string; mediaType: string }>
      textBlocks: string[]
      toolEvents: Array<{ type: string; tool?: string; input?: Record<string, unknown>; output?: string }>
      isComplete: boolean
      startTime: number
      endTime: number | null
      costUsd: number | null
    }>
  ): string {
    if (!previousTurns || previousTurns.length === 0) return ''

    const filesModified = new Set<string>()
    const filesRead = new Set<string>()
    const taskSummaries: string[] = []

    for (const turn of previousTurns) {
      // Extract file operations from tool events
      for (const event of turn.toolEvents) {
        if (event.type === 'tool_use' && event.input) {
          const filePath = (event.input as Record<string, unknown>).file_path as string
            || (event.input as Record<string, unknown>).path as string
          if (filePath) {
            if (event.tool === 'Write' || event.tool === 'Edit') {
              filesModified.add(filePath)
            } else if (event.tool === 'Read') {
              filesRead.add(filePath)
            }
          }
        }
      }

      // Build a brief task summary from each turn
      if (turn.userMessage) {
        const userMsg = turn.userMessage.length > 150
          ? turn.userMessage.substring(0, 150) + '...'
          : turn.userMessage
        let summary = `- User asked: "${userMsg}"`

        if (turn.textBlocks.length > 0) {
          const response = turn.textBlocks.join(' ')
          // Extract just the first meaningful sentence of the response
          const firstSentence = response.match(/^[^.!?\n]{10,200}[.!?]/)?.[0]
          if (firstSentence) {
            summary += ` → ${firstSentence}`
          }
        }
        taskSummaries.push(summary)
      }
    }

    const parts: string[] = ['<sessionContext>']

    if (filesModified.size > 0) {
      parts.push('Files modified in this session:')
      for (const f of filesModified) {
        parts.push(`  - ${f}`)
      }
    }

    if (filesRead.size > 0 && filesRead.size <= 20) {
      parts.push('Files read in this session:')
      for (const f of filesRead) {
        parts.push(`  - ${f}`)
      }
    }

    // Include last 10 task summaries to stay within reasonable prompt size
    const recentTasks = taskSummaries.slice(-10)
    if (recentTasks.length > 0) {
      parts.push('Conversation history (most recent):')
      parts.push(...recentTasks)
    }

    parts.push('</sessionContext>')
    return parts.join('\n')
  }

  private handleSDKMessage(
    message: SDKMessage,
    session: Session,
    onEvent: (event: StreamEvent) => void
  ): void {
    // Debug: log all message types and their UUIDs for checkpoint tracking
    const msgAny = message as any
    if (msgAny.uuid) {
      console.log(`[AgentService] Message type=${message.type} subtype=${msgAny.subtype || ''} uuid=${msgAny.uuid}`)
    }

    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          onEvent({
            event: 'system',
            data: {
              model: message.model,
              tools: message.tools,
              cwd: message.cwd,
              sessionId: message.session_id
            }
          })
        } else if (message.subtype === 'compact_boundary') {
          console.log('[AgentService] Conversation compacted. Pre-compact tokens:', (message as any).compact_metadata?.pre_tokens)
          onEvent({
            event: 'system',
            data: {
              type: 'compact',
              trigger: (message as any).compact_metadata?.trigger,
              preTokens: (message as any).compact_metadata?.pre_tokens
            }
          })
        } else if (message.subtype === 'status') {
          const status = (message as any).status
          if (status === 'compacting') {
            console.log('[AgentService] Compaction in progress...')
            onEvent({
              event: 'system',
              data: { type: 'compacting' }
            })
          }
        }
        break

      case 'assistant': {
        session.sdkSessionId = message.session_id

        const assistantMessage = message.message
        if (assistantMessage?.content) {
          for (const block of assistantMessage.content) {
            if (block.type === 'text') {
              onEvent({
                event: 'text',
                data: { text: block.text }
              })
            } else if (block.type === 'tool_use') {
              onEvent({
                event: 'tool_use',
                data: {
                  tool: block.name,
                  toolUseId: block.id,
                  input: block.input
                }
              })
            }
          }
        }
        break
      }

      case 'user': {
        // Emit checkpoint UUID so the renderer can enable rewind for this turn.
        // With replay-user-messages enabled, SDKUserMessageReplay messages have
        // guaranteed UUIDs that serve as checkpoint restore points.
        const userMsgUuid = (message as any).uuid as string | undefined
        const isReplay = (message as any).isReplay === true
        const isSynthetic = (message as any).isSynthetic === true
        console.log(`[AgentService] User message: uuid=${userMsgUuid} isReplay=${isReplay} isSynthetic=${isSynthetic} parent_tool_use_id=${(message as any).parent_tool_use_id}`)

        if (userMsgUuid) {
          onEvent({
            event: 'system',
            data: { type: 'checkpoint', userMessageId: userMsgUuid }
          })
        }

        const userMessage = message.message
        if (userMessage?.content && Array.isArray(userMessage.content)) {
          for (const block of userMessage.content) {
            if (typeof block === 'object' && 'type' in block && block.type === 'tool_result') {
              onEvent({
                event: 'tool_result',
                data: {
                  toolUseId: (block as Record<string, unknown>).tool_use_id,
                  content: (block as Record<string, unknown>).content
                }
              })
            }
          }
        }
        break
      }

      case 'stream_event': {
        // SDKPartialAssistantMessage — real-time streaming deltas
        const streamEvent = (message as any).event
        if (streamEvent) {
          if (streamEvent.type === 'content_block_start') {
            const block = streamEvent.content_block
            if (block?.type === 'thinking') {
              onEvent({
                event: 'thinking',
                data: { type: 'start', thinking: block.thinking ?? '' }
              })
            }
          } else if (streamEvent.type === 'content_block_delta') {
            const delta = streamEvent.delta
            if (delta?.type === 'thinking_delta') {
              onEvent({
                event: 'thinking',
                data: { type: 'delta', thinking: delta.thinking ?? '' }
              })
            } else if (delta?.type === 'text_delta') {
              onEvent({
                event: 'partial_text',
                data: { text: delta.text ?? '' }
              })
            }
          } else if (streamEvent.type === 'content_block_stop') {
            // Thinking block finished
            onEvent({
              event: 'thinking',
              data: { type: 'stop' }
            })
          }
        }
        break
      }

      case 'tool_progress': {
        // SDKToolProgressMessage — progress updates for long-running tools
        const toolMsg = message as any
        onEvent({
          event: 'tool_progress',
          data: {
            toolUseId: toolMsg.tool_use_id,
            toolName: toolMsg.tool_name,
            elapsedSeconds: toolMsg.elapsed_time_seconds
          }
        })
        break
      }

      case 'result':
        onEvent({
          event: 'done',
          data: {
            sessionId: session.id,
            sdkSessionId: message.session_id,
            subtype: message.subtype,
            isError: message.is_error,
            numTurns: message.num_turns,
            costUsd: message.total_cost_usd,
            result: message.subtype === 'success' ? (message as { result?: string }).result : undefined
          }
        })
        break
    }
  }
}
